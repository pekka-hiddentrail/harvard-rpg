import {
  BLOCK_MINUTES,
  type Assignment,
  type AssignmentKind,
  type Meeting,
  type OfficeHour,
  type Syllabus,
} from './schema'

/**
 * `effort` and `workloadHint` are derived, not authored — the only per-course field a
 * human still has to hand-pick is `demands` (real subject content). This is what keeps
 * ~120 future courses from being 120 hand-tuned guesses (GAME_DESIGN §4.1, §4.6).
 *
 * Known gap: this only counts a course's own `meetings` (the shared pattern every
 * section follows), not a specific section's length from `content/sections.yaml` — a
 * section is a registration-time fact, and joining the two is a content-loader concern,
 * not an engine one (ARCHITECTURE §11.1's engine/content boundary). Pass
 * `extraMeetingHours` to add a representative section length once a caller has one.
 */

function meetingHours(meeting: Meeting): number {
  const days = meeting.days.length
  if (meeting.pattern) return (BLOCK_MINUTES[meeting.pattern] / 60) * days
  if (meeting.time) return parseHourRange(meeting.time) * days
  return 0
}

/** Exported so `packages/content` can size a real `CourseSlot`'s section length the
 * same way — one parser, not two copies drifting apart. */
export function parseHourRange(time: string): number {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(time)
  if (!match) return 0
  const [, h1, m1, h2, m2] = match.map(Number)
  return (h2! * 60 + m2! - (h1! * 60 + m1!)) / 60
}

export function meetingHoursPerWeek(meetings: readonly Meeting[]): number {
  return meetings.reduce((sum, m) => sum + meetingHours(m), 0)
}

/** The one continuous span of term-weeks a set of weeks falls within. */
function weekSpan(weeks: readonly number[]): number {
  if (weeks.length === 0) return 0
  return Math.max(...weeks) - Math.min(...weeks) + 1
}

function assignmentWeeks(a: Assignment): number[] {
  const own = [a.assigned?.week, a.due?.week, a.date?.week].filter((w): w is number => w != null)
  const stageWeeks = a.stages.map((s) => s.due.week)
  return [...own, ...stageWeeks]
}

/**
 * Total hours ÷ the weeks they're spread over — not an average per item, which only
 * happens to work when items land roughly weekly. Uses whichever assignments carry an
 * `estHours` (normally psets); a course with none (an essay-only syllabus with no
 * `estHours` authored on its essays) contributes nothing here yet — a known content gap,
 * not a silent zero pretending to be a real answer.
 */
function totalCourseworkHours(assignments: readonly Assignment[]): number {
  return assignments.filter((a) => a.estHours != null).reduce((sum, a) => sum + a.estHours!, 0)
}

export function courseworkHoursPerWeek(assignments: readonly Assignment[]): number {
  const withHours = assignments.filter((a) => a.estHours != null)
  if (withHours.length === 0) return 0
  const weeks = weekSpan(withHours.flatMap(assignmentWeeks))
  return weeks === 0 ? 0 : totalCourseworkHours(assignments) / weeks
}

/**
 * A sit-down exam is contact time, the same category as a lecture — not prep time,
 * which already has a home in the bracket/draw system and would be double-counted here.
 * Amortized over the whole course span, same as a weekly lecture would be. Falls back to
 * a standard 3h block when an exam/final's own `time` isn't authored yet (real department
 * policy often isn't published this far out — e.g. Math21b's final).
 */
const DEFAULT_EXAM_SIT_HOURS = 3

function sitHours(assignment: Assignment): number {
  if (assignment.kind !== 'exam' && assignment.kind !== 'final') return 0
  return assignment.time ? parseHourRange(assignment.time) : DEFAULT_EXAM_SIT_HOURS
}

function totalExamSitHours(syllabus: Syllabus): number {
  return syllabus.assignments.reduce((sum, a) => sum + sitHours(a), 0)
}

export function examSitHoursPerWeek(syllabus: Syllabus): number {
  const exams = syllabus.assignments.filter((a) => a.kind === 'exam' || a.kind === 'final')
  if (exams.length === 0) return 0
  const weeks = courseSpanWeeks(syllabus)
  return weeks === 0 ? 0 : totalExamSitHours(syllabus) / weeks
}

/** The raw weekly-hours estimate a "workload hint" is actually reporting. */
export function rawWeeklyHours(syllabus: Syllabus, extraMeetingHours = 0): number {
  return (
    meetingHoursPerWeek(syllabus.meetings) +
    extraMeetingHours +
    examSitHoursPerWeek(syllabus) +
    courseworkHoursPerWeek(syllabus.assignments)
  )
}

/**
 * How much a course asks of its subjects, all told. Exported for
 * `scripts/import-courses.ts`, which sizes a generated coursework budget from it — the same
 * total `effortScore` blends in below, so the two cannot drift into disagreeing about what
 * "how much does this course ask" means.
 */
export function sumDemands(demands: Syllabus['demands']): number {
  return Object.values(demands).reduce((sum, level) => sum + level, 0)
}

/**
 * The `effort` score (replaces the hand-authored `demand` scalar): raw weekly hours
 * blended with how much this course actually asks of a subject, halved. Two courses with
 * the same raw hours aren't equally demanding if one asks far more of you per tag.
 */
export function effortScore(syllabus: Syllabus, extraMeetingHours = 0): number {
  return Math.round((rawWeeklyHours(syllabus, extraMeetingHours) + sumDemands(syllabus.demands)) / 2)
}

// ── the two derived, display-facing fields (§4.1, §4.6) ──────────────────────────────

/** `demand` is a 1-10 scale; a derived score outside it is clamped, never rejected. */
const clampDemand = (score: number) => Math.max(1, Math.min(10, score))

/**
 * The `demand` a course actually presents. Authored when a human pinned one — a real
 * published figure, or a known exception — and derived from `effortScore` otherwise.
 *
 * Both callers must go through here rather than reading `syllabus.demand`: the API serves
 * it to the catalogue and the content tests assert the office-hour invariant against it,
 * and those two disagreeing about a course's demand is exactly the drift this prevents.
 */
export function effectiveDemand(syllabus: Syllabus, extraMeetingHours = 0): number {
  return syllabus.demand ?? clampDemand(effortScore(syllabus, extraMeetingHours))
}

/**
 * How contested a course's office hours are: one below the course's own demand, which is
 * the standing rule the content tests have always enforced. Derived rather than authored
 * for the same reason `demand` is — the rule makes an authored copy of it redundant, and a
 * course whose own demand derives cannot know the number to write down anyway.
 *
 * Floors at 1 so a demand-1 course still yields a legal value instead of a 0 the schema
 * would reject. An authored `demand` wins, so a genuine exception stays sayable.
 */
export function effectiveOfficeHourDemand(
  syllabus: Syllabus,
  officeHour: OfficeHour,
  extraMeetingHours = 0,
): number {
  return officeHour.demand ?? Math.max(1, effectiveDemand(syllabus, extraMeetingHours) - 1)
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The workload string the catalogue shows. A stub with no assignments yet can only be
 * honest about what it knows — contact time — so it says that outright instead of quoting
 * a total that silently omits every pset the course will turn out to have.
 */
export function effectiveWorkloadHint(syllabus: Syllabus, extraMeetingHours = 0): string {
  if (syllabus.workloadHint) return syllabus.workloadHint
  const hours = round1(rawWeeklyHours(syllabus, extraMeetingHours))
  if (syllabus.assignments.length === 0) return `~${hours}h/week in class, coursework TBD`
  return `~${hours}h/week`
}

// ── bracket width (§4.4) ──────────────────────────────────────────────────────────────

const MODERATE_FRACTION = 0.625 // calibrated to reproduce the original 10/16 default

const MILESTONE_KINDS: readonly AssignmentKind[] = ['exam', 'final', 'project', 'essay']

function courseSpanWeeks(syllabus: Syllabus): number {
  return weekSpan(syllabus.assignments.flatMap(assignmentWeeks))
}

/**
 * The moderate/narrow hour thresholds for one milestone-graded item, derived from its
 * `weight` share of the course's non-pset hour pool — not authored per item. An explicit
 * `assignment.brackets` override always wins (e.g. a genuine editorial exception); this
 * only fills the gap when none is set.
 *
 * Built from each component's own *raw total*, not `rawWeeklyHours() * courseSpanWeeks()`
 * — `courseworkHoursPerWeek` and `examSitHoursPerWeek` are rates over their own natural
 * spans (a course's psets, say, might all land inside week 1-14 of a 15-week course), and
 * multiplying that rate back out by a *different*, longer span silently inflates the pool
 * by exactly the mismatch between the two spans. Only `meetings` legitimately scales by
 * the full course span, since a lecture actually recurs every one of those weeks.
 */
export function deriveBrackets(
  syllabus: Syllabus,
  assignment: Assignment,
  extraMeetingHours = 0,
): { moderate: number; narrow: number } {
  if (assignment.brackets) return assignment.brackets

  const totalMeetingHours =
    (meetingHoursPerWeek(syllabus.meetings) + extraMeetingHours) * courseSpanWeeks(syllabus)
  const totalHours = totalMeetingHours + totalExamSitHours(syllabus) + totalCourseworkHours(syllabus.assignments)
  const psetHours = syllabus.assignments
    .filter((a) => a.kind === 'pset' && a.estHours != null)
    .reduce((sum, a) => sum + a.estHours!, 0)
  const milestonePool = totalHours - psetHours

  const weightTotal = syllabus.assignments
    .filter((a) => MILESTONE_KINDS.includes(a.kind))
    .reduce((sum, a) => sum + a.weight, 0)

  const narrow = weightTotal === 0 ? 0 : Math.round(milestonePool * (assignment.weight / weightTotal))
  const moderate = Math.round(narrow * MODERATE_FRACTION)
  return { moderate, narrow }
}

// ── draw counts (§4.4) ────────────────────────────────────────────────────────────────

const DRAW_COUNT: Partial<Record<AssignmentKind, number>> = {
  exam: 8,
  final: 10,
  project: 12,
}

/** Essay stages draw more as the course progresses: 4, 5, 6, ... capped at 8. */
const ESSAY_DRAW_BASE = 3
const ESSAY_DRAW_CAP = 8

/**
 * How many values are drawn for this assignment's hidden roll. `pset` returns
 * `undefined` — psets never draw, they grade on completion (§4.1).
 */
export function drawCount(syllabus: Syllabus, assignment: Assignment): number | undefined {
  if (assignment.kind === 'essay') {
    const essays = syllabus.assignments
      .filter((a) => a.kind === 'essay')
      .sort((a, b) => (assignmentWeeks(a)[0] ?? 0) - (assignmentWeeks(b)[0] ?? 0))
    const position = essays.findIndex((a) => a.id === assignment.id) + 1
    return Math.min(ESSAY_DRAW_BASE + position, ESSAY_DRAW_CAP)
  }
  return DRAW_COUNT[assignment.kind]
}

// ── semester effort cap (§4.6) ───────────────────────────────────────────────────────

/** A soft warning, not a hard block — shopping week names it, never refuses it. */
export function checkSemesterEffort(
  effortScores: readonly number[],
  cap: number,
): { total: number; cap: number; over: boolean; overBy: number } {
  const total = effortScores.reduce((sum, e) => sum + e, 0)
  return { total, cap, over: total > cap, overBy: Math.max(0, total - cap) }
}
