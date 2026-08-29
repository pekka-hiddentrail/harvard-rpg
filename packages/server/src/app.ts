import { randomBytes, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Content } from '@harvard/content'
import {
  BANDS,
  BuildRequest,
  HALVES_PER_BAND,
  HALF_COUNT,
  PlanDay,
  STRATEGIES,
  Save,
  bandOf,
  formatLong,
  hasErrors,
  parseDate,
  priceTrait,
  replay,
  resolveDay,
  toCreationBlock,
  validateBuild,
  type Activity,
  type Placement,
} from '@harvard/engine'
import { z } from 'zod'

/**
 * Tier 0 server. Two content routes and two game routes — enough to prove the slice
 * end to end: Ink → HTTP → engine → SQLite → back.
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
      : { ok: false, problems: result.problems }
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

    // Levels are DERIVED, never stored (§8). Recomputed from the build on every read, which
    // is also how a content change announces itself instead of hiding.
    const revalidated = validateBuild(
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
        const s = replay(save.actions, content.activityIndex, content.rules.day)
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
   * Resolve a candidate day without committing it. This is the day planner's whole loop:
   * the client holds a `Placement[]`, posts it on every edit, and renders what comes back.
   * It computes nothing itself — not a duration, not an hour, not a conflict.
   */
  app.post('/api/game/:id/day/preview', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const parsed = PreviewBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const state = replay(found.save.actions, content.activityIndex, content.rules.day)
    const result = resolveDay(
      { date: state.date, placements: parsed.data.placements },
      content.activityIndex,
      content.rules.day,
      state.body,
    )
    return dayView(state.day, result, parsed.data.placements)
  })

  /** Commit the day: append one `plan_day` action, and the save is the log (§3). */
  app.post('/api/game/:id/day/resolve', (req, reply) => {
    const found = load(req.params as { id: string })
    if (!found) return reply.code(404).send({ error: 'no such save' })
    const parsed = PreviewBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const before = replay(found.save.actions, content.activityIndex, content.rules.day)
    const action = PlanDay.parse({
      type: 'plan_day',
      date: before.date,
      placements: parsed.data.placements,
    })

    const dry = resolveDay(action, content.activityIndex, content.rules.day, before.body)
    if (hasErrors(dry.problems)) {
      return reply.code(422).send({ problems: dry.problems.filter((p) => p.severity === 'error') })
    }

    const save = Save.parse({ ...found.save, actions: [...found.save.actions, action] })
    db.prepare('UPDATE saves SET json = ? WHERE id = ?').run(JSON.stringify(save), save.id)

    const after = replay(save.actions, content.activityIndex, content.rules.day)
    return {
      day: dayView(before.day, dry, parsed.data.placements),
      log: after.log,
      hoursBySubject: after.hoursBySubject,
      next: { day: after.day, date: after.date },
      actionCount: save.actions.length,
    }
  })

  function load({ id }: { id: string }): { save: Save } | null {
    const row = db.prepare('SELECT json FROM saves WHERE id = ?').get(id) as
      | { json: string }
      | undefined
    return row ? { save: Save.parse(JSON.parse(row.json)) } : null
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
