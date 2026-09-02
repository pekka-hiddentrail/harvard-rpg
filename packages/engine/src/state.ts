import { SUBJECT_TAGS, zeroLevels, type Action, type DayRules, type Levels, type SubjectTag } from './schema.ts'
import { nextMorning, resolveDay, startingBody, type ActivityIndex, type Body, type DayResult } from './day.ts'
import { nextDay, parseDate, toISO } from './dates.ts'
import {
  emptyCoursework,
  foldDay,
  type AcademicContext,
  type Coursework,
  type CourseworkDay,
} from './coursework.ts'

/**
 * `GameState = replay(seed, actions[])` (ARCHITECTURE §3).
 *
 * The database stores the seed and the action log; this is the fold that turns them back
 * into a game.
 *
 * The seed arrives inside `academic`, which is the Tier 2 parameter the previous revision of
 * this docstring promised: grading needs a seed (§3.3), and the ledger needs the syllabi and
 * the term calendar alongside it, so they travel together rather than as four arguments. It is
 * **optional**, and absent it the fold behaves exactly as Tier 1 did — a day still resolves,
 * hours still bank by subject, and no course is graded. That keeps every caller that only
 * wants a day out of the business of assembling a term.
 *
 * Pure, total, and cheap: ~180 days × a few actions is a few hundred entries.
 */

/** One filed course, per term. `section` is absent when the course had nothing to choose. */
export type Enrolment = {
  term: string
  courseCode: string
  section?: string | undefined
}

export type GameState = {
  /** 1-based. Day 1 is `rules.day.firstDay`. */
  day: number
  /** The date the player is about to plan. */
  date: string
  body: Body
  /**
   * Real hours studied per subject tag, as the day resolved them — the raw tally the log line
   * reports. Not the same number as `levelHours`, which is this run through
   * `bankedLevelHours`'s accrual rate and relevance discount and then *spent* on levels.
   * Keeping both means "I studied nine hours of maths this month" and "I am 40 hours from
   * maths 1" are separately answerable, and neither has to be reconstructed from the other.
   */
  hoursBySubject: Record<SubjectTag, number>
  /**
   * Where each subject tag actually stands (§8: the derived start plus accumulated movement).
   * Seeded from the character build via `academic.startingLevels`; zero everywhere without it.
   */
  levels: Levels
  /** Level-hours banked toward the *next* level in each tag. Spent hours are removed. */
  levelHours: Record<SubjectTag, number>
  /** Every graded item and the attendance record (§4.4). Absent an `academic` context, empty. */
  coursework: Coursework
  /** What each folded day did academically, in order — parallel to `days`. */
  academicDays: CourseworkDay[]
  /**
   * What's on the study card right now, in the order it was filed — the fold of every
   * `enrol_course` and `drop_course` (§4.6). Flat across terms rather than keyed by one,
   * so `enrolledIn` is the only place that has to know which term is being asked about.
   */
  enrolled: Enrolment[]
  /** One line per resolved day, in order (§3.4). */
  log: string[]
  /** The resolved days themselves, so a client can render the last one. */
  days: DayResult[]
}

/** The courses filed for one term. */
export const enrolledIn = (state: GameState, term: string): Enrolment[] =>
  state.enrolled.filter((e) => e.term === term)

const zero = (): Record<SubjectTag, number> =>
  Object.fromEntries(SUBJECT_TAGS.map((t) => [t, 0])) as Record<SubjectTag, number>

/** The seed, the term and the syllabi, plus where the character build left each subject. */
export type AcademicSetup = AcademicContext & { startingLevels?: Levels | undefined }

export function replay(
  actions: readonly Action[],
  activities: ActivityIndex,
  rules: DayRules,
  academic?: AcademicSetup,
): GameState {
  const state: GameState = {
    day: 1,
    date: rules.firstDay,
    body: startingBody(rules),
    hoursBySubject: zero(),
    levels: { ...(academic?.startingLevels ?? zeroLevels()) },
    levelHours: zero(),
    enrolled: [],
    coursework: emptyCoursework(),
    academicDays: [],
    log: [],
    days: [],
  }

  for (const action of actions) {
    switch (action.type) {
      case 'plan_day': {
        const result = resolveDay(action, activities, rules, state.body)
        for (const tag of SUBJECT_TAGS) {
          const banked = result.hours.bySubject[tag] ?? 0
          if (banked > 0) {
            state.hoursBySubject[tag] = Math.round((state.hoursBySubject[tag] + banked) * 10) / 10
          }
        }
        // A course-targeted band's hours are not in `bySubject` — `resolveDay` only routes a
        // target it recognises as a tag — so the ledger is where they land, split by demand.
        // The two loops are not double-counting the same hour; they are reading disjoint halves
        // of the day, which is exactly why `bySubject` could stay a `Record<SubjectTag, …>`.
        if (academic) {
          state.academicDays.push(
            foldDay(
              state,
              action.date,
              result.placements,
              state.enrolled.filter((e) => e.term === academic.term.id).map((e) => e.courseCode),
              academic,
            ),
          )
        }
        state.body = nextMorning(result.body, rules, result.slept)
        state.day += 1
        state.date = toISO(nextDay(parseDate(action.date)))
        state.log.push(result.log)
        state.days.push(result)
        break
      }

      // Idempotent on purpose, both of them. Replay must be total — it folds a log that is
      // already committed, so it has no reply channel and cannot refuse anything. Filing a
      // course twice updates the section rather than listing it twice (which is what
      // switching sections *is*), and dropping one you aren't in is a no-op. Whether either
      // was a sensible thing to ask for is the API's question, asked before the action was
      // ever appended (§4.6: the effort cap warns, `isCourseOpen` refuses).
      case 'enrol_course': {
        const existing = state.enrolled.findIndex(
          (e) => e.term === action.term && e.courseCode === action.courseCode,
        )
        const entry: Enrolment = {
          term: action.term,
          courseCode: action.courseCode,
          ...(action.section === undefined ? {} : { section: action.section }),
        }
        if (existing === -1) state.enrolled.push(entry)
        else state.enrolled[existing] = entry
        break
      }

      case 'drop_course': {
        state.enrolled = state.enrolled.filter(
          (e) => !(e.term === action.term && e.courseCode === action.courseCode),
        )
        break
      }
    }
  }

  return state
}

/**
 * Levels **do** move now, in `coursework.ts` — the Tier 2 half the previous revision of this
 * note deferred. §8's definition is unchanged (the derived start plus accumulated movement);
 * what arrived is the conversion, and it is `levelUpCost` spending `levelHours` rather than
 * anything new. Note the asymmetry that follows from having no decay rule: a level, once
 * crossed, is permanent, so a term of neglect costs you the levels you did not gain and never
 * the ones you had.
 */
