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
