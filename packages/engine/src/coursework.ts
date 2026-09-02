/**
 * The academic ledger (GAME_DESIGN §4.4): the layer that turns a planned day into banked
 * hours, a fired draw, and eventually a grade.
 *
 * Everything §4.4 specifies as arithmetic already existed as pure primitives before this file
 * did — `deriveBrackets` and `drawCount` in `effort.ts`, `bandFor`/`drawCards`/`applyBumps`/
 * `scorePercentage`/`psetGradePercentage` in `grading.ts`, `splitHoursByDemand` and
 * `levelUpCost` in `levels.ts`. None of them had a caller. This is the caller: the *stateful*
 * half, which is only ever bookkeeping — which item a band's hours belong to, whether the
 * draw has already fired, and when an item stops accepting work.
 *
 * Two ledgers, fed by the same real hour and never conflated (§4.4 step 1):
 *
 *   - **the pool** — hours toward one course's next graded item. Stops the moment that item's
 *     cards are drawn; after that the same hours buy bumps instead.
 *   - **the level ledger** — hours toward durable subject levels, split across every tag the
 *     course demands. This one *never* stops. Leveling is not a race against a due date, and
 *     an all-nighter the day before an exam still teaches you something even though it can no
 *     longer improve the grade.
 *
 * Pure: no clock, no randomness of its own, no i/o. Every draw is a function of
 * `(saveSeed, itemKey)` and the day being folded, so replaying a log twice gives the same
 * term twice, and a reload cannot reroll a bad grade (§4.4).
 *
 * **The cards never leave the server.** `ItemLedger.cards` is engine-internal; the readout in
 * §4.4 is derived from the *band*, which is public and non-invertible. There is a leak test.
 */

import { deriveBrackets, drawCount } from './effort.ts'
import { effectiveHours, isCourseOpen } from './demands.ts'
import {
  applyBumps,
  bandFor,
  courseGradePercentage,
  drawCards,
  isDrawTriggered,
  psetGradePercentage,
  scorePercentage,
  type ConfidenceBand,
} from './grading.ts'
import { resolveAssignmentDates } from './calendar/fitSessions.ts'
import type { DayProblem } from './day.ts'
import { ATTENDANCE_SUPPORT_MULTIPLIER, bankedLevelHours, levelUpCost, splitHoursByDemand } from './levels.ts'
import { daysBetween } from './dates.ts'
import {
  SUBJECT_TAGS,
  type AssignmentKind,
  type Levels,
  type SubjectTag,
  type Syllabus,
  type Term,
} from './schema.ts'

// ── the ledger ────────────────────────────────────────────────────────────────────────

/** `pset` grades on completion and never draws; everything else draws (§4.1, `drawCount`). */
const isMilestone = (kind: AssignmentKind): boolean => kind !== 'pset'

/**
 * One graded item's whole state. `courseCode/assignmentId` is the key, and it is also the
 * `assessmentId` the draw hashes — so an item's cards are stable across every replay of the
 * same save, and two courses with an assignment both called `midterm1` cannot collide.
 */
export type ItemLedger = {
  courseCode: string
  assignmentId: string
  title: string
  kind: AssignmentKind
  /** Due, or sat, resolved through the term calendar — holidays already applied. */
  date: string
  weight: number
  /** Real hours banked *before* the draw. The only thing that sets the band. */
  hours: number
  /** Real hours banked after it. Two of these buy one bump, and nothing else. */
  extraHours: number
  /** Frozen when the cards are drawn. `undefined` means the item is still open. */
  band?: ConfidenceBand | undefined
  /**
   * The draw, then the draw as bumped. **Engine-internal — never serialised to a client or a
   * narrator** (§4.4, r6). Present only on milestones; a pset has no cards at all.
   */
  cards?: number[] | undefined
  /** 0-100, set once and only at the due date. `undefined` until then. */
  percentage?: number | undefined
  /** Finished off someone else's answers: completes the item, grades flat at a C (§4.4). */
  copied: boolean
}

export type Coursework = {
  /** Keyed `courseCode/assignmentId`. */
  items: Record<string, ItemLedger>
  /**
   * Dates the player was actually in the room, per course, in order. Dates rather than session
   * numbers because a date is what the day loop knows and is lossless: §4.3's multiplier needs
   * *which sessions* were missed, and `fitSessions` maps one to the other whenever it is asked.
   * Recording the derived thing instead would bake today's session fit into the save.
   */
  attended: Record<string, string[]>
}

export const emptyCoursework = (): Coursework => ({ items: {}, attended: {} })

export const itemKey = (courseCode: string, assignmentId: string): string =>
  `${courseCode}/${assignmentId}`

/** Everything the fold needs that the action log does not carry. */
export type AcademicContext = {
  /** The save's seed. Draws hash `(seed, itemKey)` and nothing else (§3.3). */
  saveSeed: string
  term: Term
  /** By course code — the catalogue, not the enrolment. `enrolled` decides what counts. */
  syllabi: ReadonlyMap<string, Syllabus>
}

// ── resolving a course's items ────────────────────────────────────────────────────────

/**
 * Every graded item a syllabus declares, dated and sorted. `resolveAssignmentDates` does the
 * holiday-proof part; an assignment with neither a `due` nor a `date` is skipped rather than
 * guessed at, the same way `termPlan` skips it.
 */
function itemsOf(syllabus: Syllabus, term: Term): ItemLedger[] {
  const rows: ItemLedger[] = []
  for (const a of resolveAssignmentDates(syllabus, term)) {
    const date = a.due ?? a.date
    if (!date) continue
    rows.push({
      courseCode: syllabus.courseCode,
      assignmentId: a.id,
      title: a.title ?? a.id,
      kind: a.kind,
      date,
      weight: a.weight,
      hours: 0,
      extraHours: 0,
      copied: false,
    })
  }
  return rows.sort((x, y) => x.date.localeCompare(y.date))
}

/**
 * The item a course-targeted study band feeds: the earliest one still open on this date. Open
 * means ungraded and not yet past — hours cannot travel backwards to an item already sat, and
 * an item due *today* is still the right answer, since the day it is due is the day people
 * actually do it.
 */
function nextOpenItem(ledgers: readonly ItemLedger[], date: string): ItemLedger | undefined {
  return ledgers.find((i) => i.percentage === undefined && i.date >= date)
}

// ── the fold ──────────────────────────────────────────────────────────────────────────

/** What one folded day did, so a caller can say so without re-deriving it. */
export type CourseworkDay = {
  /** Course code → real hours aimed at it, whatever they ended up buying. */
  hoursByCourse: Record<string, number>
  /** Item key → hours that went into its pool, its psets' own tally included. */
  pooled: Record<string, number>
  /** Item keys whose cards were drawn today. The practice-exam moment (§4.4). */
  drawn: string[]
  /** Item keys graded today, having reached their due date. */
  graded: string[]
  /** Course codes attended today. */
  attended: string[]
  /** Tags that gained a level today, in the order they crossed. */
  levelled: SubjectTag[]
}

const emptyDay = (): CourseworkDay => ({
  hoursByCourse: {},
  pooled: {},
  drawn: [],
  graded: [],
  attended: [],
  levelled: [],
})

const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * The state `foldDay` reads and writes. Deliberately not `GameState` itself: this file has no
 * business knowing about `body`, `log` or `days`, and taking only the three fields it actually
 * touches means the two can be tested apart.
 */
export type AcademicState = {
  coursework: Coursework
  levels: Levels
  /** Level-hours banked toward the *next* level, per tag. Spent hours are removed. */
  levelHours: Record<SubjectTag, number>
}

/**
 * A resolved placement, narrowed structurally to the four fields the ledger reads. `day.ts`'s
 * `ResolvedPlacement` satisfies it, and saying so structurally rather than importing the type
 * keeps the dependency pointing one way: the ledger reads the day's output, the day never
 * learns what a course is.
 */
type Placed = { activity: string; target?: string | undefined; hours: number }

/**
 * Fold one resolved day into the academic ledger, in the order §4.4's own worked example
 * requires:
 *
 *   1. **Draws first.** The Oct 18 example resolves the draw and *then* banks six hours of
 *      bumping the same day. Firing the draw after the day's hours would bank those six into
 *      the pool instead, widen nothing, and lose the two-day crisis entirely.
 *   2. **Then the day's hours**, to the pool if the item is still open and to bumps if it is
 *      not — and to the level ledger either way.
 *   3. **Then grading**, for items whose due date is today, so the last afternoon before an
 *      exam counts toward it.
 */
export function foldDay(
  state: AcademicState,
  date: string,
  placements: readonly Placed[],
  enrolledCodes: readonly string[],
  ctx: AcademicContext,
): CourseworkDay {
  const day = emptyDay()
  const enrolled = enrolledCodes.filter((c) => ctx.syllabi.has(c))

  // Every enrolled course's items, materialised into the ledger once. An item already there
  // keeps its banked hours; a course enrolled mid-term picks its items up from here on.
  const byCourse = new Map<string, ItemLedger[]>()
  for (const code of enrolled) {
    const syllabus = ctx.syllabi.get(code)!
    const ledgers: ItemLedger[] = []
    for (const fresh of itemsOf(syllabus, ctx.term)) {
      const key = itemKey(code, fresh.assignmentId)
      state.coursework.items[key] ??= fresh
      ledgers.push(state.coursework.items[key]!)
    }
    byCourse.set(code, ledgers)
  }

  // ── 0. attendance ───────────────────────────────────────────────────────────────────
  // Being in the room is recorded from the placement, which is the whole reason `attend_class`
  // is an activity: the player skips a lecture by deleting it or scheduling over it, and either
  // way the band is visibly theirs again. An absence needs no record — §4.3 asks which sessions
  // you *missed*, and that is the term's meetings minus this list, computed when asked.
  for (const p of placements) {
    if (p.activity !== 'attend_class' || p.target === undefined) continue
    if (!enrolled.includes(p.target) || day.attended.includes(p.target)) continue
    day.attended.push(p.target)
    const seen = (state.coursework.attended[p.target] ??= [])
    if (!seen.includes(date)) seen.push(date)
  }

  // ── 1. the draws ────────────────────────────────────────────────────────────────────
  for (const code of enrolled) {
    const syllabus = ctx.syllabi.get(code)!
    for (const item of byCourse.get(code) ?? []) {
      if (!isMilestone(item.kind) || item.cards !== undefined || item.percentage !== undefined) continue
      const hoursUntilDue = daysBetween(date, item.date) * 24
      if (!isDrawTriggered(hoursUntilDue)) continue

      const assignment = syllabus.assignments.find((a) => a.id === item.assignmentId)
      const count = assignment ? drawCount(syllabus, assignment) : undefined
      if (!assignment || count === undefined) continue

      const key = itemKey(code, item.assignmentId)
      item.band = bandFor(item.hours, deriveBrackets(syllabus, assignment))
      item.cards = drawCards(ctx.saveSeed, key, item.band, count)
      day.drawn.push(key)
    }
  }

  // ── 2. the day's hours ──────────────────────────────────────────────────────────────
  for (const p of placements) {
    if (p.hours <= 0 || p.target === undefined) continue

    if ((SUBJECT_TAGS as readonly string[]).includes(p.target)) {
      // Aimed at a bare subject: the level ledger only, and at half rate unless something on
      // the card actually demands it (`ISOLATED_STUDY_DISCOUNT`).
      const tag = p.target as SubjectTag
      const relevant = enrolled.some((c) => (ctx.syllabi.get(c)!.demands[tag] ?? 0) > 0)
      bankLevelHours(state, tag, bankedLevelHours(p.hours, relevant), day)
      continue
    }

    const syllabus = ctx.syllabi.get(p.target)
    if (!syllabus || !enrolled.includes(p.target)) continue
    day.hoursByCourse[p.target] = round1((day.hoursByCourse[p.target] ?? 0) + p.hours)

    // Contact with the material beats self-direction, so a lecture's hour is worth more to the
    // level ledger than a library hour is (§4.4 step 1). It buys no more *pool* progress: an
    // hour of pset time is an hour either way.
    const support = p.activity === 'attend_class' ? ATTENDANCE_SUPPORT_MULTIPLIER : 1
    for (const [tag, split] of Object.entries(splitHoursByDemand(syllabus.demands, p.hours))) {
      bankLevelHours(state, tag as SubjectTag, bankedLevelHours(split, true, support), day)
    }

    const item = nextOpenItem(byCourse.get(p.target) ?? [], date)
    if (!item) continue
    const key = itemKey(p.target, item.assignmentId)
    if (item.cards !== undefined) {
      // Drawn already: these hours bump cards and bank no pool progress (§4.4 step 5).
      item.extraHours = round1(item.extraHours + p.hours)
      item.cards = applyBumps(item.cards, item.extraHours)
    } else {
      item.hours = round1(item.hours + p.hours)
      day.pooled[key] = round1((day.pooled[key] ?? 0) + p.hours)
    }
  }

  // ── 3. grading ──────────────────────────────────────────────────────────────────────
  for (const code of enrolled) {
    const syllabus = ctx.syllabi.get(code)!
    for (const item of byCourse.get(code) ?? []) {
      if (item.percentage !== undefined || item.date !== date) continue
      const key = itemKey(code, item.assignmentId)

      if (item.cards !== undefined) {
        item.percentage = scorePercentage(item.cards)
        day.graded.push(key)
        continue
      }

      const assignment = syllabus.assignments.find((a) => a.id === item.assignmentId)
      if (!assignment) continue
      if (isMilestone(item.kind)) {
        // A milestone whose draw never fired — no `drawCount` for its kind, or it was enrolled
        // inside its own final 48 hours. Grading it off nothing would invent a number, so it
        // stays ungraded and `courseGrade` leaves it out of the weighted average.
        continue
      }
      item.percentage = psetGradePercentage(
        item.hours,
        effectiveEstHours(assignment.estHours, syllabus, state.levels),
        item.copied,
      )
      day.graded.push(key)
    }
  }

  return day
}

/**
 * A pset's hour cost as *this* player experiences it. Demand gap only, for now: §4.3's
 * attendance multiplier is the one formula GAME_DESIGN still lists as unbuilt — only its
 * stacking rule (multiplicative, on top of this) is settled — so leaving the slot visible
 * beats inventing a curve here and pretending the design named it.
 *
 * A course past the not-survivable gap returns `Infinity` from `effectiveHours`, which would
 * make every pset grade 0 for a course shopping week already refuses to sell. Falling back to
 * the authored estimate is the same call `termPlan` makes, for the same reason.
 */
function effectiveEstHours(estHours: number | undefined, syllabus: Syllabus, levels: Levels): number {
  const base = estHours ?? 1
  if (!isCourseOpen(syllabus.demands, levels)) return base
  return effectiveHours(base, syllabus.demands, levels)
}

/**
 * Bank level-hours and spend them. A level costs `levelUpCost(current)` hours and the
 * remainder carries — so no hour is ever lost to rounding at a boundary, and a tag can cross
 * two levels in one enormous day rather than silently capping at one.
 */
function bankLevelHours(state: AcademicState, tag: SubjectTag, hours: number, day: CourseworkDay): void {
  if (hours <= 0) return
  state.levelHours[tag] = round2(state.levelHours[tag] + hours)
  while (state.levelHours[tag] >= levelUpCost(state.levels[tag])) {
    state.levelHours[tag] = round2(state.levelHours[tag] - levelUpCost(state.levels[tag]))
    state.levels[tag] += 1
    day.levelled.push(tag)
  }
}

// ── refusing a target before it is committed ──────────────────────────────────────────

/**
 * The membership half of target validation, which `validatePlan` cannot do because it has no
 * catalogue (see the note beside the shape check in `day.ts`).
 *
 * This exists because letting study aim at a course made `validatePlan` unable to tell a typo
 * from a course code: `study ▸ basketry` used to be a flat `bad_target`, and once `basketry`
 * might have been a course it stopped being decidable there. Without this the typo would pass
 * validation, commit, and then be *silently dropped* by `foldDay` — an afternoon of work that
 * counted toward nothing, with no error anywhere. §9.3 asks for the opposite: say why.
 *
 * A `DayProblem[]`, so both day routes can append it to `resolveDay`'s own problems and refuse
 * on the union. `foldDay` still drops an unknown target quietly, and that stays correct — by
 * the time it runs the action is committed and a fold has nobody to complain to.
 */
export function checkCourseTargets(
  placements: readonly (Placed & { start: number })[],
  activities: ReadonlyMap<string, { name: string; targets: string }>,
  enrolledCodes: readonly string[],
): DayProblem[] {
  const problems: DayProblem[] = []
  for (const p of placements) {
    const a = activities.get(p.activity)
    // An unknown activity is `validatePlan`'s error to report, and it already does.
    if (!a || (a.targets !== 'course' && a.targets !== 'subjectOrCourse')) continue
    if (p.target === undefined) continue

    const isTag = (SUBJECT_TAGS as readonly string[]).includes(p.target)
    if (isTag) {
      if (a.targets === 'course') {
        problems.push({
          code: 'needs_course',
          severity: 'error',
          message: `${a.name} has to be aimed at a course, and \`${p.target}\` is a subject`,
          start: p.start,
        })
      }
      continue
    }
    if (!enrolledCodes.includes(p.target)) {
      problems.push({
        code: 'not_enrolled',
        severity: 'error',
        message: `\`${p.target}\` is not a subject and not a course on your card this term`,
        start: p.start,
      })
    }
  }
  return problems
}

// ── reading the ledger back ───────────────────────────────────────────────────────────

/**
 * One course's grade so far: the weighted average of every item that has one (§4.4, r15).
 * Ungraded items are *excluded* rather than counted as zero — a course three weeks in is not
 * failing because November hasn't happened yet. `weightGraded` is returned alongside so a
 * caller can say how much of the course this number actually covers, which is the difference
 * between a grade and a guess.
 */
export function courseGrade(
  coursework: Coursework,
  courseCode: string,
): { percentage: number | undefined; weightGraded: number } {
  const graded = Object.values(coursework.items).filter(
    (i) => i.courseCode === courseCode && i.percentage !== undefined,
  )
  if (graded.length === 0) return { percentage: undefined, weightGraded: 0 }
  return {
    percentage: courseGradePercentage(graded.map((i) => ({ percentage: i.percentage!, weight: i.weight }))),
    weightGraded: round2(graded.reduce((sum, i) => sum + i.weight, 0)),
  }
}
