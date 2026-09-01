import {
  courseworkHoursPerWeek,
  effectiveDemand,
  examSitHoursPerWeek,
  meetingHoursPerWeek,
} from './effort.ts'
import { NOT_SURVIVABLE_GAP, demandGap, demandGapMultiplier, isCourseOpen } from './demands.ts'
import type { Levels, SubjectTag, Syllabus } from './schema.ts'

/**
 * Shopping week (GAME_DESIGN §4.6): pricing a candidate course *for this player*, and
 * pricing a whole candidate course set.
 *
 * Two rules from §4.4 that this module exists to obey, and that a caller must not undo:
 *
 * - **Price, never outcome.** Everything here is hours, gaps and multipliers. Nothing
 *   predicts a grade, and nothing here draws.
 * - **A closed course is closed with its reason.** `open: false` still carries a full set of
 *   `gaps` rows, because §9.3's job is to report why rather than to refuse. Callers render
 *   the reason; they never get a bare rejection to render.
 *
 * The one arithmetic judgement in here worth arguing with: the demand-gap multiplier is
 * applied to **coursework only**, never to contact time or exam sit-time. Being three levels
 * behind on `math` makes a problem set take 2.4× as long; it does not make the lecture run
 * 2.4× longer, and it does not keep you in the exam hall past the end of the exam. Applying
 * one multiplier to the whole weekly total would be simpler and wrong in the player's favour
 * for lecture-heavy courses and against it for pset-heavy ones.
 */

/** One demanded tag, priced against what the player currently has. */
export type GapRow = {
  tag: SubjectTag
  /** What the course asks. */
  courseLevel: number
  /** What the player has right now — levels move over a term (§8). */
  playerLevel: number
  /** Positive means behind, negative means ahead. */
  gap: number
  /**
   * The share of this course's coursework this tag is presumed to account for, weighted by
   * demand level — the §4.5 working assumption, since nothing authors a real per-tag hour
   * split yet.
   */
  share: number
  /** `undefined` at a not-survivable gap, where the course is closed rather than expensive. */
  multiplier: number | undefined
}

export type CoursePreview = {
  courseCode: string
  title: string
  /** The general-purpose heaviness scalar (`effort`), derived unless authored (§4.6 r15). */
  effort: number
  /** False when any one demanded tag has reached `NOT_SURVIVABLE_GAP`. */
  open: boolean
  /** Every demanded tag, always — including on a closed course. */
  gaps: GapRow[]
  /**
   * Weekly hours nobody can negotiate: contact time plus exam sit-time amortized over the
   * course. Identical for every player, and never multiplied by a gap.
   */
  fixedHours: number
  /** Weekly coursework hours as the syllabus states them, before this player's gaps. */
  baseCourseworkHours: number
  /** ...and after. Equal to `baseCourseworkHours` for a player exactly at every ask. */
  personalCourseworkHours: number
  /** `fixedHours + baseCourseworkHours` — the catalogue's "base ~12h". */
  baseWeeklyHours: number
  /** `fixedHours + personalCourseworkHours` — the "~15h/wk" this player would actually pay. */
  personalWeeklyHours: number
  /**
   * The tag costing this player the most hours — the "names the reason" half of r11's
   * mockup. `undefined` when nothing costs anything extra (every gap at or below 0), which
   * is the honest answer: there is no reason to name.
   */
  drivingTag: SubjectTag | undefined
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Every demanded tag priced against `levels`, in the syllabus's own key order. */
export function courseGaps(syllabus: Syllabus, levels: Levels): GapRow[] {
  const entries = Object.entries(syllabus.demands) as [SubjectTag, number][]
  const totalDemand = entries.reduce((sum, [, level]) => sum + level, 0)
  return entries.map(([tag, courseLevel]) => {
    const gap = demandGap(courseLevel, levels[tag])
    return {
      tag,
      courseLevel,
      playerLevel: levels[tag],
      gap,
      share: totalDemand === 0 ? 0 : courseLevel / totalDemand,
      multiplier: gap >= NOT_SURVIVABLE_GAP ? undefined : demandGapMultiplier(gap),
    }
  })
}

/**
 * What one candidate course would cost this player per week, and why.
 *
 * `extraMeetingHours` is the representative section length joined in from the real section
 * pool — a syllabus alone never pins one, so the caller at the content boundary supplies it
 * (see `representativeSectionHours`). Omitting it prices a course like CS 50, whose section
 * is most of its contact time, as substantially lighter than it is.
 */
export function previewCourse(
  syllabus: Syllabus,
  levels: Levels,
  extraMeetingHours = 0,
): CoursePreview {
  const gaps = courseGaps(syllabus, levels)
  const open = isCourseOpen(syllabus.demands, levels)

  const fixedHours =
    meetingHoursPerWeek(syllabus.meetings) + extraMeetingHours + examSitHoursPerWeek(syllabus)
  const baseCoursework = courseworkHoursPerWeek(syllabus.assignments)

  // Summed per tag rather than multiplied by one blended figure, so `drivingTag` below is
  // reading the same numbers the total is built from — a course can't report a reason that
  // doesn't add up to its own hours. A closed course's coursework is left at base: there is
  // no honest number for "how long would this take if you took it", and `Infinity` in a
  // field the UI formats is a worse answer than the base hours beside `open: false`.
  const extraPerTag = gaps.map((g) =>
    g.multiplier === undefined ? 0 : baseCoursework * g.share * (g.multiplier - 1),
  )
  const personalCoursework = open ? baseCoursework + extraPerTag.reduce((a, b) => a + b, 0) : baseCoursework

  // Strictly greater, so a tie goes to the earlier tag in the syllabus's own key order and
  // the answer is stable rather than dependent on iteration luck. A not-survivable tag always
  // wins outright: it is the reason the course is shut, whatever the hours say.
  let drivingTag: SubjectTag | undefined
  let worst = 0
  for (const [i, g] of gaps.entries()) {
    const cost = g.multiplier === undefined ? Infinity : extraPerTag[i]!
    if (cost > worst) {
      worst = cost
      drivingTag = g.tag
    }
  }

  // Every field is rounded once, and the two totals are the sums of the *rounded* parts
  // rather than rounded sums of the raw ones. r11's argument is one the player is supposed to
  // be able to check by adding it up; a screen reading "5.8 fixed + 5.9 coursework = 11.6"
  // loses that, and the tenth of an hour it costs to be consistent is not a real quantity of
  // time. (CS50 with its real section is exactly this case: 5.75 and 5.8666 both round up.)
  const fixed = round1(fixedHours)
  const base = round1(baseCoursework)
  const personal = round1(personalCoursework)

  return {
    courseCode: syllabus.courseCode,
    title: syllabus.title,
    effort: effectiveDemand(syllabus, extraMeetingHours),
    open,
    gaps,
    fixedHours: fixed,
    baseCourseworkHours: base,
    personalCourseworkHours: personal,
    baseWeeklyHours: round1(fixed + base),
    personalWeeklyHours: round1(fixed + personal),
    drivingTag,
  }
}

// ── the cart (§4.6) ───────────────────────────────────────────────────────────────────

export type CartSummary = {
  /** Sum of `effort` across the cart — what the semester cap is a line on. */
  effortTotal: number
  cap: number
  /** Soft: true is a warning to render, never a reason to refuse (§4.6). */
  over: boolean
  overBy: number
  baseWeeklyHours: number
  personalWeeklyHours: number
  /**
   * Course codes in the cart that aren't survivable right now. Kept as a list rather than a
   * count because the screen has to name them, and kept out of `over` because the two are
   * different failures: one is "this is too much", the other is "this one is shut".
   */
  closed: string[]
}

/**
 * Price a whole candidate course set. Sums previews rather than re-deriving anything, so the
 * cart total and the per-course rows on the same screen cannot disagree.
 *
 * A closed course still contributes its `effort` and its base hours to the totals. It is in
 * the cart; leaving it out would quietly under-report what the player is looking at, and the
 * `closed` list is how the screen says the set isn't yet enrollable.
 */
export function summarizeCart(previews: readonly CoursePreview[], cap: number): CartSummary {
  const effortTotal = previews.reduce((sum, p) => sum + p.effort, 0)
  return {
    effortTotal,
    cap,
    over: effortTotal > cap,
    overBy: Math.max(0, effortTotal - cap),
    baseWeeklyHours: round1(previews.reduce((sum, p) => sum + p.baseWeeklyHours, 0)),
    personalWeeklyHours: round1(previews.reduce((sum, p) => sum + p.personalWeeklyHours, 0)),
    closed: previews.filter((p) => !p.open).map((p) => p.courseCode),
  }
}
