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

export type GameState = {
  /** 1-based. Day 1 is `rules.day.firstDay`. */
  day: number
  /** The date the player is about to plan. */
  date: string
  body: Body
  /** Banked study hours per subject tag. What Tier 2 points at assessments. */
  hoursBySubject: Record<SubjectTag, number>
  /** One line per resolved day, in order (§3.4). */
  log: string[]
  /** The resolved days themselves, so a client can render the last one. */
  days: DayResult[]
}

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
    }
  }

  return state
}

/**
 * Levels do **not** move here yet. §8 defines a level as the derived start plus accumulated
 * movement, and the hours-to-level rule belongs with the demand gap it feeds — which is
 * Tier 2. Banking the hours without inventing that conversion is the honest half.
 */
