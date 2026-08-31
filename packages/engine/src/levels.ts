import type { SubjectTag } from './schema'

/**
 * Level progression: how a subject-tag level moves after creation. Purely hours-banked
 * — passing a course grants nothing on its own, only the hours spent studying do.
 */

/**
 * Hours required to move from level `x` to `x + 1`. Below zero it costs `100 * |x|`
 * (escaping a hindrance is expensive precisely because it's a hindrance); at or above
 * zero it costs `100 * (x + 1)` (each further level costs more than the last). The two
 * branches agree at the boundary — both give 100 at x = -1 and x = 0 — so this is one
 * continuous curve: `100 * max(x + 1, -x)`.
 *
 * Running one tag from 0 to 5 costs 1500 hours total, over a multi-year career, if it's
 * the only thing you ever study.
 */
export function levelUpCost(fromLevel: number): number {
  return 100 * Math.max(fromLevel + 1, -fromLevel)
}

/** Real hours spent studying only partly convert into durable level progress. */
export const BASE_ACCRUAL_RATE = 0.6

/** Isolated study — a tag no enrolled course currently demands — accrues at half rate. */
export const ISOLATED_STUDY_DISCOUNT = 0.5

/**
 * Hours of level progress banked from one real study hour. `relevant` is whether the
 * session was against a course that actually demands this tag; `supportMultiplier`
 * composes on top for tutoring, joint study, and similar boosts (not yet numbered).
 */
export function bankedLevelHours(
  realHours: number,
  relevant: boolean,
  supportMultiplier = 1,
): number {
  const relevance = relevant ? 1 : ISOLATED_STUDY_DISCOUNT
  return realHours * BASE_ACCRUAL_RATE * relevance * supportMultiplier
}

/** Just showing up to a lecture/section/lab/workshop counts as studying — at a bonus,
 * since it's guaranteed contact with the material rather than self-directed effort. */
export const ATTENDANCE_SUPPORT_MULTIPLIER = 1.25

/**
 * One real hour banks in full to the course's milestone pool *and*, simultaneously, splits
 * across every tag the course demands — weighted the same way `effectiveHoursMultiplier`
 * prices a gap, by demand level. A CS50 hour (code:2, math:1) is 0.67h of `code` study and
 * 0.33h of `math` study for leveling purposes, even on a pset whose own hours never touch
 * the milestone pool at all (§4.1) — leveling and grading are two separate ledgers fed by
 * the same real hour.
 */
export function splitHoursByDemand(
  demands: Partial<Record<SubjectTag, number>>,
  hours: number,
): Partial<Record<SubjectTag, number>> {
  const entries = Object.entries(demands) as [SubjectTag, number][]
  const totalDemand = entries.reduce((sum, [, level]) => sum + level, 0)
  if (totalDemand === 0) return {}
  return Object.fromEntries(entries.map(([tag, level]) => [tag, (level / totalDemand) * hours]))
}
