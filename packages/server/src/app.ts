import { randomBytes, randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import Database from 'better-sqlite3'
import Fastify, { type FastifyInstance } from 'fastify'
import { representativeSectionHours, type Content } from '@harvard/content'
import {
  BANDS,
  BuildRequest,
  DropCourse,
  EnrolCourse,
  HALVES_PER_BAND,
  HALF_COUNT,
  PlanDay,
  STRATEGIES,
  Save,
  bandOf,
  checkCourseTargets,
  countsToward,
  effectiveDemand,
  effectiveOfficeHourDemand,
  effectiveWorkloadHint,
  enrolledIn,
  fitSessions,
  formatLong,
  hasErrors,
  openingRoutes,
  parseDate,
  previewCourse,
  priceTrait,
  replay,
  resolveAssignmentDates,
  resolveDay,
  studyPlan,
  summarizeCart,
  termPlan,
  toCreationBlock,
  validateBuild,
  type AcademicSetup,
  type Activity,
  type EnrolledCourse,
  type GameState,
  type Levels,
  type Placement,
} from '@harvard/engine'
import { z } from 'zod'

/**
 * Tier 0 server. Two content routes and two game routes — enough to prove the slice
 * end to end: client → HTTP → engine → SQLite → back.
 *
 * The rules live behind this boundary and stay there. The client cannot compute a cost,
 * cannot validate a build, and cannot see anything the engine did not hand it
 * (ARCHITECTURE §4).
 *
 * `buildApp` takes its content and its database path so the slice is testable without a
 * listening socket or a file on disk.
 */

export type ServerOptions = {
  content: Content
  /** A path, or `:memory:` in tests. */
  dbFile: string
}

export function buildApp({ content, dbFile }: ServerOptions): {
  app: FastifyInstance
  db: Database.Database
} {
  const db = new Database(dbFile)
  if (dbFile !== ':memory:') db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      json         TEXT NOT NULL
    );
  `)

  const app = Fastify({ logger: false })
  app.addHook('onClose', () => db.close())

  // The browser GUI runs on Vite's dev origin, distinct from this server's port. Local-first,
  // single-player, no cookies or auth — a permissive dev CORS policy carries no real risk here.
  void app.register(cors, { origin: true })

  /**
   * Reach is deliberately absent from this payload. §7.8 requires the creation screen to
   * show what a choice *reaches*, never a score — and reach is a count over the NPC pool,
   * which does not exist until Tier 3. Shipping it as a stub would be worse than omitting
   * it: a wrong number on this screen is a wrong decision by the player.
   */
  app.get('/api/creation/options', () => ({
    contentHash: content.hash,
    budget: content.rules.creation.budget,
    refundCap: content.rules.creation.refundCap,
    priceTolerance: content.rules.creation.priceTolerance,
    subjectTags: content.rules.subjectTags,
    packs: content.packs.map((p) => ({ id: p.id, version: p.version })),
    presets: content.presets.map((p) => ({
      id: p.id,
      name: p.name,
      hometown: p.hometown,
      schoolType: p.schoolType,
      program: p.program,
      targetTrack: p.targetTrack ?? null,
      traits: p.traits,
    })),
    traits: content.traits
      .filter((t) => !t.hidden)
      .map((t) => ({
        id: t.id,
        name: t.name,
        blurb: t.blurb,
        cost: t.cost,
        kinds: t.kinds,
        affects: t.affects,
        excludes: t.excludes,
        requiresAnyOf: t.requiresAnyOf,
        requiresOneOf: t.requiresOneOf,
        grantsLanguageFrom: t.grantsLanguageFrom,
        contagious: t.contagious,
        structural: t.structural,
        why: t.why ?? null,
        // What the schedule would charge, so the screen can be honest about derivation.
        derivedCost: priceTrait(t, content.rules).points,
      })),
  }))

  /** A dry run of the validator, so the screen can show problems while the player edits. */
  app.post('/api/creation/validate', (req, reply) => {
    const parsed = BuildRequest.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const result = validateBuild(parsed.data, content.index, content.rules)
    return result.ok
      ? {
          ok: true,
          spent: result.spent,
          refunded: result.refunded,
          levels: result.levels,
          languages: result.languages,
        }
      : {
          ok: false,
          problems: result.problems,
          spent: result.spent,
          refunded: result.refunded,
          levels: result.levels,
        }
  })

  app.post('/api/game/new', (req, reply) => {
    const parsed = BuildRequest.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const result = validateBuild(parsed.data, content.index, content.rules)
    if (!result.ok) return reply.code(422).send({ problems: result.problems })

    // The seed is drawn here and nowhere else. The engine may not call randomBytes — every
    // draw in play derives from this string (ARCHITECTURE §3.3).
    const save = Save.parse({
      id: randomUUID(),
      seed: randomBytes(16).toString('hex'),
      contentHash: content.hash,
      creation: toCreationBlock(parsed.data, result, content.index, content.rules),
      actions: [],
    })

    db.prepare(
      'INSERT INTO saves (id, created_at, content_hash, json) VALUES (?, ?, ?, ?)',
    ).run(save.id, new Date().toISOString(), save.contentHash, JSON.stringify(save))

    return reply.code(201).send({ gameId: save.id })
  })

  app.get('/api/game/:id', (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT json FROM saves WHERE id = ?').get(id) as
      | { json: string }
      | undefined
    if (!row) return reply.code(404).send({ error: 'no such save' })

    const save = Save.parse(JSON.parse(row.json))
    const stale = save.contentHash !== content.hash
    const revalidated = revalidate(save)

    return {
      view: 'character',
      id: save.id,
      contentHash: save.contentHash,
      staleContent: stale,
      creation: save.creation,
      traitNames: save.creation.traits.map((t) => content.index.get(t.id)?.name ?? t.id),
      levels: revalidated.ok ? revalidated.levels : null,
      actionCount: save.actions.length,
      // Replayed, never stored (ARCHITECTURE §3). The character sheet leads into the day.
      state: (() => {
        const s = fold(save)
        return {
          day: s.day,
          date: s.date,
          dateLong: formatLong(parseDate(s.date)),
          body: s.body,
          hoursBySubject: s.hoursBySubject,
          log: s.log,
        }
      })(),
    }
  })

  /** The course catalogue (Tier 2). Full syllabi — sessions and assignments included —
   * so a browse/shopping-week screen can render without a second round trip. Real,
   * concrete section slots (the shopping-cart pool) ride along too. Session and
   * assignment dates are computed here from the course's meeting pattern and the shared
   * term calendar (`fitSessions` / `resolveAssignmentDates`), never authored as absolute
   * dates — a holiday shifting which real day a course meets must not silently invalidate
   * a hand-typed due date (see `CourseWeek` in `packages/engine/src/schema.ts`). */
  app.get('/api/courses', () => {
    const term = content.terms[0]
    return {
      contentHash: content.hash,
      courses: content.courses.map((c) => {
        // A course's own `meetings` names only the pattern every section shares; the real
        // length of the section a student would land in lives in sections.yaml. Joining the
        // two is what makes a derived `demand` right for a course like CS50, whose 2h45m
        // section is most of its contact time (see `representativeSectionHours`).
        const sectionHours = representativeSectionHours(c.courseCode, content.slots)
        return {
          ...c,
          // Derived unless the syllabus pinned one — see `effectiveDemand`. Resolved here,
          // beside the session and assignment dates, because all four are the same kind of
          // thing: computed from content, never stored in it.
          demand: effectiveDemand(c, sectionHours),
          workloadHint: effectiveWorkloadHint(c, sectionHours),
          officeHours: c.officeHours.map((oh) => ({
            ...oh,
            demand: effectiveOfficeHourDemand(c, oh, sectionHours),
          })),
          sessions: term ? fitSessions(c, term) : c.sessions,
          assignments: term ? resolveAssignmentDates(c, term) : c.assignments,
          /**
           * Which requirement groups, in which concentrations, this course could serve. Pure
           * content — identical for every player, like `demand` — so it belongs on the
           * catalogue rather than behind a save. It is what lets shopping week answer §9.3's
           * second question, *"what does this cost me in three years?"*, on the row itself.
           */
          countsToward: countsToward(c.courseCode, content.tracks),
        }
      }),
      slots: content.slots,
      /**
       * The tracks themselves, so a client can name a concentration and show its shape
       * without a save. `requirements` carries the authored `notes`, which are the rules the
       * solver cannot enforce and the player therefore has to be told.
       */
      tracks: content.tracks,
    }
  })

  // ── the day (Tier 1) ───────────────────────────────────────────────────────────────

  /**
   * The catalogue, and the only place the client learns what a day looks like. Two things
   * are precomputed here rather than in the client, because both are rules:
   *
   * - `prices` — what each legal duration of an activity *banks*, straight off the curve.
   *   §12 requires an option to show its price and never its outcome, and for study the
   *   price genuinely is `+1.7 h`; what that turns into is the preview's business.
   * - `canPlace` — which activities a band will accept. The client filters its option list
   *   with this and never learns the rule behind it.
   */
  const activityViews = content.activities.map(activityView)
  const canPlace = BANDS.map((b) =>
    content.activities
      .filter((a) => a.allowedBands.length === 0 || a.allowedBands.includes(b.index))
      .map((a) => a.id),
  )

  /**
   * The standing routine, prefilled. §3.2: "a day is still 2-3 clicks in the common case,
   * because the standing routine pre-fills it." The bot's baseline strategy *is* that
   * routine — run, three meals, four bands of study, sleep — so the planner opens on a
   * sane day and editing is the interaction, not construction from nothing.
   */
  const routine = STRATEGIES[0]!.plan(content.rules.subjectTags[0] ?? 'math')

  app.get('/api/day/activities', () => ({
    contentHash: content.hash,
    bands: BANDS,
    halvesPerBand: HALVES_PER_BAND,
    halfCount: HALF_COUNT,
    subjectTags: content.rules.subjectTags,
    activities: activityViews,
    canPlace,
    routine,
  }))

  const PreviewBody = z.object({ placements: PlanDay.shape.placements }).strict()

  /**
   * `replay`, with the academic context always attached (§4.4). Every fold in this file goes
   * through here for one reason: `replay`'s `academic` parameter is optional, so forgetting it
   * does not fail — it silently produces an empty ledger, which is indistinguishable from a
   * term in which nothing was studied. One helper means there is one place to forget.
   *
   * The seed goes in and never comes out. It is what the draw hashes (§3.3), and no route
   * serialises `GameState` wholesale — every response picks its fields by hand, which is the
   * habit the leak test will grow teeth around.
   */
  function fold(save: Save): GameState {
    const levels = revalidate(save)
    const academic: AcademicSetup | undefined = shoppingTerm
      ? {
          saveSeed: save.seed,
          term: shoppingTerm,
          syllabi: courseByCode,
          // A build that no longer validates against current content has no derived levels; the
          // ledger then starts from zero rather than refusing to fold. The sheet already
          // reports that case as `levels: null`, so the drift is visible where it belongs.
          ...(levels.ok ? { startingLevels: levels.levels } : {}),
        }
      : undefined
    return replay(save.actions, content.activityIndex, content.rules.day, academic)
  }

  /**
   * The course codes a study band may legitimately name today. Empty before shopping week has
   * produced a card, which is the right answer rather than a missing one: it means every course
   * target is refused by name until there is something to aim at.
   */
  const cardCodes = (state: GameState): string[] =>
    shoppingTerm ? enrolledIn(state, shoppingTerm.id).map((e) => e.courseCode) : []

  /**
   * Resolve a candidate day without committing it. This is the day planner's whole loop:
   * the client holds a `Placement[]`, posts it on every edit, and renders what comes back.
   * It computes nothing itself — not a duration, not an hour, not a conflict.
   */
  app.post('/api/game/:id/day/preview', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const parsed = PreviewBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const state = fold(found.save)
    const result = resolveDay(
      { date: state.date, placements: parsed.data.placements },
      content.activityIndex,
      content.rules.day,
      state.body,
    )
    // A course target is checked here rather than in `resolveDay`, which has no catalogue.
    // Preview reports them alongside the day's own problems; `resolve` refuses on them.
    result.problems.push(...checkCourseTargets(result.placements, content.activityIndex, cardCodes(state)))
    return dayView(state.day, result, parsed.data.placements)
  })

  /** Commit the day: append one `plan_day` action, and the save is the log (§3). */
  app.post('/api/game/:id/day/resolve', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const parsed = PreviewBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const before = fold(found.save)
    const action = PlanDay.parse({
      type: 'plan_day',
      date: before.date,
      placements: parsed.data.placements,
    })

    const dry = resolveDay(action, content.activityIndex, content.rules.day, before.body)
    dry.problems.push(...checkCourseTargets(dry.placements, content.activityIndex, cardCodes(before)))
    if (hasErrors(dry.problems)) {
      return reply.code(422).send({ problems: dry.problems.filter((p) => p.severity === 'error') })
    }

    const save = Save.parse({ ...found.save, actions: [...found.save.actions, action] })
    db.prepare('UPDATE saves SET json = ? WHERE id = ?').run(JSON.stringify(save), save.id)

    const after = fold(save)
    return {
      day: dayView(before.day, dry, parsed.data.placements),
      log: after.log,
      hoursBySubject: after.hoursBySubject,
      next: { day: after.day, date: after.date },
      actionCount: save.actions.length,
    }
  })

  // ── shopping week (Tier 2, §4.6) ───────────────────────────────────────────────────

  /**
   * Pricing lives here rather than beside the catalogue in `/api/courses` on purpose, and the
   * split is the point: `/api/courses` answers "what is this course", which is the same for
   * everybody and depends on nothing but content; this answers "what would it cost *you*",
   * which needs a save. A client joins the two on `courseCode`.
   *
   * Everything served here is a price, never an outcome (§4.4) — hours, gaps, multipliers, and
   * no predicted grade anywhere. A closed course is served *with its gap rows*, because §9.3's
   * job is to report why rather than to refuse.
   */
  const shoppingTerm = content.terms[0]

  /** Slots are the concrete, capacity-tracked instances a player actually files into. */
  const sectionsOf = (courseCode: string) =>
    content.slots.filter((s) => s.courseCode === courseCode)

  const courseByCode = new Map(content.courses.map((c) => [c.courseCode, c]))

  /** Every course, or a named subset, priced against this save's derived levels. */
  function priceCourses(save: Save, codes?: readonly string[]) {
    const levels = revalidate(save)
    if (!levels.ok) return null
    const wanted =
      codes === undefined
        ? content.courses
        : codes.map((c) => courseByCode.get(c)).filter((c) => c !== undefined)
    return wanted.map((c) =>
      previewCourse(c, levels.levels, representativeSectionHours(c.courseCode, content.slots)),
    )
  }

  app.get('/api/game/:id/shopping', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const levels = revalidate(found.save)
    if (!levels.ok) return reply.code(409).send({ problems: levels.problems })

    const state = fold(found.save)
    const term = shoppingTerm?.id ?? null
    const enrolled = term === null ? [] : enrolledIn(state, term)
    const priced = priceCourses(found.save) ?? []
    const byCode = new Map(priced.map((p) => [p.courseCode, p]))

    return {
      contentHash: content.hash,
      term,
      levels: levels.levels,
      /** The soft line, sent so the client can render it without knowing the rule (§4). */
      cap: content.rules.academics.semesterEffortCap,
      courses: priced.map((p) => ({ ...p, sections: sectionsOf(p.courseCode) })),
      enrolled,
      // The card as it stands. `summarizeCart` over the same previews the rows came from, so
      // the total and the rows on one screen cannot disagree.
      summary: summarizeCart(
        enrolled.map((e) => byCode.get(e.courseCode)).filter((p) => p !== undefined),
        content.rules.academics.semesterEffortCap,
      ),
    }
  })

  const CartBody = z.object({ courseCodes: z.array(z.string().min(1)) }).strict()

  /**
   * Price a tentative cart — the add/drop loop's live total, before anything is filed. The
   * shopping-week counterpart to `/day/preview`: the client holds a list of course codes,
   * posts it on every change, and renders what comes back. It sums nothing itself.
   */
  app.post('/api/game/:id/shopping/preview', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const parsed = CartBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const priced = priceCourses(found.save, parsed.data.courseCodes)
    if (!priced) return reply.code(409).send({ error: 'build no longer validates' })

    const unknown = parsed.data.courseCodes.filter((c) => !courseByCode.has(c))
    if (unknown.length > 0) return reply.code(404).send({ error: `no such course: ${unknown.join(', ')}` })

    return {
      courses: priced,
      summary: summarizeCart(priced, content.rules.academics.semesterEffortCap),
    }
  })

  const EnrolBody = z
    .object({ courseCode: z.string().min(1), section: z.string().min(1).optional() })
    .strict()

  /**
   * File one course. Two things refuse here and nothing else does:
   *
   * - a **not-survivable** course (§4.5's +5 gap), which is closed rather than expensive —
   *   and the refusal carries the gap rows, so the client shows the reason, not a red box;
   * - a **section that doesn't exist or is full**, which is a fact about the world.
   *
   * The semester effort cap explicitly does *not* refuse (§4.6: "a line, not a wall"). Going
   * over is a legal, and sometimes correct, decision — the response says so and files it
   * anyway. This is the one place that rule is enforceable, so it is worth being loud: an
   * `over: true` in a 200 body is the design working, not an error that leaked.
   */
  app.post('/api/game/:id/shopping/enrol', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    if (!shoppingTerm) return reply.code(409).send({ error: 'no term in content to enrol into' })
    const parsed = EnrolBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const course = courseByCode.get(parsed.data.courseCode)
    if (!course) return reply.code(404).send({ error: `no such course: ${parsed.data.courseCode}` })

    const levels = revalidate(found.save)
    if (!levels.ok) return reply.code(409).send({ problems: levels.problems })
    const preview = previewCourse(
      course,
      levels.levels,
      representativeSectionHours(course.courseCode, content.slots),
    )
    if (!preview.open) {
      return reply.code(422).send({
        error: 'not survivable',
        courseCode: course.courseCode,
        gaps: preview.gaps,
        drivingTag: preview.drivingTag,
      })
    }

    const sections = sectionsOf(course.courseCode)
    if (parsed.data.section !== undefined) {
      const slot = sections.find((s) => s.section === parsed.data.section)
      if (!slot) {
        return reply.code(422).send({ error: `no section ${parsed.data.section} of ${course.courseCode}` })
      }
      // Never fires on today's content (no seeded slot is full), which is exactly why it is
      // written now: `occupied` is authored and shopping week is meant to move it, so the
      // first full section must not be the thing that discovers this check is missing.
      if (slot.occupied >= slot.size) {
        return reply.code(422).send({ error: `section ${slot.section} of ${course.courseCode} is full` })
      }
    } else if (sections.length > 1) {
      return reply.code(422).send({
        error: `${course.courseCode} needs a section`,
        sections: sections.map((s) => s.section),
      })
    }

    const action = EnrolCourse.parse({
      type: 'enrol_course',
      term: shoppingTerm.id,
      courseCode: course.courseCode,
      ...(parsed.data.section === undefined ? {} : { section: parsed.data.section }),
    })
    return commit(found.save, action, shoppingTerm.id, levels.levels)
  })

  /**
   * The term as enrolled: real dates, real bands, real collisions (ARCHITECTURE §11.5).
   *
   * The shopping-week routes above answer "what would this cost" one course at a time and sum
   * it. This answers the question a total cannot — *when* — which is §11's go/no-go gate:
   * planning a Tuesday in mid-October with three deadlines converging and a lecture you would
   * rather skip. Same save, same derived levels, one pass through `termPlan`, so the conflicts
   * and the weekly hours on one screen were computed against the same card.
   *
   * Still a price and never an outcome (§4.4): hours due, bands occupied, clashes. No grade.
   */
  app.get('/api/game/:id/term', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    if (!shoppingTerm) return reply.code(409).send({ error: 'no term in content' })
    const levels = revalidate(found.save)
    if (!levels.ok) return reply.code(409).send({ problems: levels.problems })

    const state = fold(found.save)
    const enrolled: EnrolledCourse[] = []
    for (const e of enrolledIn(state, shoppingTerm.id)) {
      const syllabus = courseByCode.get(e.courseCode)
      if (!syllabus) continue // content moved under the save; the hash pin will say so
      const slot =
        e.section === undefined
          ? undefined
          : content.slots.find((s) => s.courseCode === e.courseCode && s.section === e.section)
      enrolled.push(slot ? { syllabus, slot } : { syllabus })
    }

    // `termPlan` throws on a content bug — an assignment authored for a week that has no such
    // session, typically a miscounted holiday. That is worth surfacing as the content problem
    // it is rather than as a 500: the save is fine, one course file isn't.
    try {
      return { contentHash: content.hash, levels: levels.levels, plan: termPlan(enrolled, levels.levels, shoppingTerm) }
    } catch (e) {
      return reply.code(422).send({
        error: 'the term calendar could not be built from this card',
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  })

  /**
   * The study plan: every track solved against this save's card (GAME_DESIGN §9.2/§9.3).
   *
   * Runs every track, always — that is how the planner can tell you a concentration you were not
   * thinking about just closed (ARCHITECTURE §3.4). It was seven tracks when this was written and
   * it is forty now, which is still microseconds; the cost that grew is the response, not the
   * solve, and that is a payload problem rather than a reason to solve fewer.
   *
   * `taken` is every course filed in any term, not just the shopping term: `enrolled` is flat
   * across terms by design (§4.6), and a requirement does not care which term satisfied it.
   * `termsUsed` counts terms the save has begun — freshman fall is 1 — which is what turns
   * feasibility into a number rather than a vibe.
   *
   * Still a price and never an outcome (§4.4): what a card *forecloses*, never what grade it
   * will earn. The r11 routes are the one forward-looking field, and they name courses that
   * ask less of a blocking tag rather than promising what a term of work would do to a level.
   */
  app.get('/api/game/:id/plan', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const levels = revalidate(found.save)
    if (!levels.ok) return reply.code(409).send({ problems: levels.problems })

    const state = fold(found.save)
    const taken = [...new Set(state.enrolled.map((e) => e.courseCode))]
    // One term has begun as soon as there is a save: this is freshman fall.
    const termsUsed = Math.max(1, new Set(state.enrolled.map((e) => e.term)).size)

    return {
      contentHash: content.hash,
      levels: levels.levels,
      taken,
      termsUsed,
      tracks: studyPlan({ taken, termsUsed }, content.tracks, content.courses, content.rules),
      /**
       * Only for courses the player is actually shut out of, which is usually none — a route
       * list for every course in the catalogue would be 163 answers to a question nobody asked.
       */
      blocked: content.courses.flatMap((c) => openingRoutes(c.courseCode, levels.levels, content.courses)),
    }
  })

  const DropBody = z.object({ courseCode: z.string().min(1) }).strict()

  app.post('/api/game/:id/shopping/drop', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    if (!shoppingTerm) return reply.code(409).send({ error: 'no term in content to drop from' })
    const parsed = DropBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const before = fold(found.save)
    // Replay is idempotent about this, so the fold would survive it — but a drop for a course
    // that was never filed is a client that has lost track of the card, and swallowing it
    // would append a no-op action to a log that is supposed to be a history of what happened.
    if (!enrolledIn(before, shoppingTerm.id).some((e) => e.courseCode === parsed.data.courseCode)) {
      return reply.code(422).send({ error: `not enrolled in ${parsed.data.courseCode}` })
    }

    const levels = revalidate(found.save)
    if (!levels.ok) return reply.code(409).send({ problems: levels.problems })

    const action = DropCourse.parse({
      type: 'drop_course',
      term: shoppingTerm.id,
      courseCode: parsed.data.courseCode,
    })
    return commit(found.save, action, shoppingTerm.id, levels.levels)
  })

  /** Append one enrolment action and answer with the card as it now stands. */
  function commit(save: Save, action: EnrolCourse | DropCourse, term: string, levels: Levels) {
    const next = Save.parse({ ...save, actions: [...save.actions, action] })
    db.prepare('UPDATE saves SET json = ? WHERE id = ?').run(JSON.stringify(next), next.id)

    const after = fold(next)
    const enrolled = enrolledIn(after, term)
    const priced = enrolled
      .map((e) => courseByCode.get(e.courseCode))
      .filter((c) => c !== undefined)
      .map((c) => previewCourse(c, levels, representativeSectionHours(c.courseCode, content.slots)))

    return {
      enrolled,
      courses: priced,
      summary: summarizeCart(priced, content.rules.academics.semesterEffortCap),
      actionCount: next.actions.length,
    }
  }

  function load({ id }: { id: string }): { save: Save } | null {
    const row = db.prepare('SELECT json FROM saves WHERE id = ?').get(id) as
      | { json: string }
      | undefined
    return row ? { save: Save.parse(JSON.parse(row.json)) } : null
  }

  /**
   * Levels are DERIVED, never stored (§8). Recomputed from the build on every read, which is
   * also how a content change announces itself instead of hiding — and why both the character
   * sheet and shopping week go through here rather than each keeping their own copy: two
   * screens disagreeing about what level you are on `math` is exactly the drift §8 forbids.
   */
  function revalidate(save: Save) {
    return validateBuild(
      {
        hometown: save.creation.hometown,
        schoolType: save.creation.schoolType,
        program: save.creation.program,
        ...(save.creation.targetTrack === undefined
          ? {}
          : { targetTrack: save.creation.targetTrack }),
        traits: save.creation.traits.map((t) => ({
          id: t.id,
          ...(t.language === undefined ? {} : { language: t.language }),
        })),
      },
      content.index,
      content.rules,
    )
  }

  return { app, db }
}

/** Every legal duration of an activity, in halves. */
const durationsOf = (a: Activity): number[] =>
  Array.from({ length: a.maxHalves - a.minHalves + 1 }, (_, i) => a.minHalves + i)

const bandsLabel = (halves: number): string => {
  const b = halves / HALVES_PER_BAND
  return b === 1 ? '1 band' : `${b} bands`
}

const activityView = (a: Activity) => ({
  id: a.id,
  name: a.name,
  blurb: a.blurb,
  kind: a.kind,
  targets: a.targets,
  minHalves: a.minHalves,
  maxHalves: a.maxHalves,
  fixed: a.fixed,
  allowedBands: a.allowedBands,
  food: a.food,
  sleep: a.sleep,
  prices: durationsOf(a).map((halves) => ({
    halves,
    label: bandsLabel(halves),
    /** Null for the activities that bank no hours at all — not zero, which means something. */
    hours: a.curve.length > 0 ? (a.curve[halves - 1] ?? 0) : null,
  })),
})

/**
 * The day-planner view model. `grid` is the part that matters: twenty-two entries, one per
 * half-band, each holding the index of the placement that owns it. A 1.5-band session shows
 * up as three consecutive halves pointing at the same placement, which is exactly what §3.6
 * asks the grid to make visible instead of silently rounding away.
 */
function dayView(day: number, result: ReturnType<typeof resolveDay>, placements: readonly Placement[]) {
  const grid = new Array<number | null>(HALF_COUNT).fill(null)
  for (const [i, r] of result.placements.entries()) {
    for (let h = r.start; h < Math.min(r.start + r.halves, HALF_COUNT); h++) grid[h] = i
  }
  return {
    day,
    date: result.date,
    dateLong: formatLong(parseDate(result.date)),
    grid,
    placements: result.placements.map((r) => ({ ...r, band: bandOf(r.start) })),
    /** Echoed back so the client's copy of the plan and the server's cannot drift. */
    submitted: placements,
    hours: result.hours,
    freeHalves: result.freeHalves,
    body: result.body,
    bandsSinceFood: result.body.halvesSinceFood / HALVES_PER_BAND,
    peakGap: result.peakGap,
    /** Per-half, so the planner can print the hunger clock in the row where it bites. */
    trace: result.trace,
    meals: result.meals,
    slept: result.slept,
    problems: result.problems,
    ok: !hasErrors(result.problems),
    log: result.log,
  }
}

const flatten = (e: { issues: { path: (string | number)[]; message: string }[] }) =>
  e.issues.map((i) => ({ code: 'schema', message: `${i.path.join('.') || 'body'}: ${i.message}` }))
