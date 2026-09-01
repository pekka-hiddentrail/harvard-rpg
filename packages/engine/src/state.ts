import { SUBJECT_TAGS, type Action, type DayRules, type SubjectTag } from './schema.ts'
import { nextMorning, resolveDay, startingBody, type ActivityIndex, type Body, type DayResult } from './day.ts'
import { nextDay, parseDate, toISO } from './dates.ts'

/**
 * `GameState = replay(seed, actions[])` (ARCHITECTURE §3).
 *
 * The database stores the seed and the action log; this is the fold that turns them back
 * into a game. Tier 1 has one action type and no draws, so `seed` is not a parameter yet —
 * it becomes one at Tier 2, when grading needs it (§3.3), and the signature is the only
 * thing that changes.
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
  /** Banked study hours per subject tag. What Tier 2 points at assessments. */
  hoursBySubject: Record<SubjectTag, number>
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

export function replay(
  actions: readonly Action[],
  activities: ActivityIndex,
  rules: DayRules,
): GameState {
  const state: GameState = {
    day: 1,
    date: rules.firstDay,
    body: startingBody(rules),
    hoursBySubject: zero(),
    enrolled: [],
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
 * Levels do **not** move here yet. §8 defines a level as the derived start plus accumulated
 * movement, and the hours-to-level rule belongs with the demand gap it feeds — which is
 * Tier 2. Banking the hours without inventing that conversion is the honest half.
 */
