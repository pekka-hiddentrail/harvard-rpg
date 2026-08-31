import type { Levels, SubjectTag } from './schema'

/**
 * The demand gap: how many levels behind (positive) or ahead (negative) of a course's
 * ask you are on one subject tag. GAME_DESIGN §4.5.
 */
export function demandGap(courseLevel: number, playerLevel: number): number {
  return courseLevel - playerLevel
}

/**
 * A course is closed to you the moment any one demanded tag's gap reaches +5 — "not
 * survivable" (§4.5). Levels move over the term (see `levels.ts`), so this is a
 * statement about right now, not forever.
 */
export const NOT_SURVIVABLE_GAP = 5

/**
 * The hours multiplier for a single tag's gap. Hand-authored in GAME_DESIGN §4.5, not
 * derived from a formula — the deltas between steps aren't uniform (0.10, 0.15, 0.25,
 * 0.45, 0.70, 1.10), so this is a lookup table, not math. Floored at -2-or-better and
 * undefined at +5-or-more, where the course is closed rather than merely expensive.
 */
const GAP_MULTIPLIER: Record<number, number> = {
  [-1]: 0.85,
  0: 1.0,
  1: 1.25,
  2: 1.7,
  3: 2.4,
  4: 3.5,
}

export function demandGapMultiplier(gap: number): number {
  if (gap >= NOT_SURVIVABLE_GAP) {
    throw new Error(`demandGapMultiplier: gap ${gap} is not survivable (§4.5) — check isCourseOpen() first`)
  }
  const clamped = Math.max(-2, Math.min(4, gap))
  return clamped <= -2 ? 0.75 : (GAP_MULTIPLIER[clamped] ?? 1.0)
}

/** Whether every tag a course demands is currently survivable for this player. */
export function isCourseOpen(demands: Partial<Record<SubjectTag, number>>, levels: Levels): boolean {
  return Object.entries(demands).every(
    ([tag, courseLevel]) => demandGap(courseLevel as number, levels[tag as SubjectTag]) < NOT_SURVIVABLE_GAP,
  )
}

/**
 * Multi-tag composition (§4.5, the CS50 code/math worked example): a course's hours
 * aren't priced by one tag's gap. Each demanded tag prices the slice of hours it's
 * presumed to account for — weighted by that tag's own demand level, since a course
 * demanding `code: 2, math: 1` is presumed two-thirds code-shaped, one-third math-shaped
 * — and the slices are summed.
 *
 * This is a working assumption, not a locked rule: nothing authors the real per-tag
 * hour split yet, so demand-level ratio stands in for it until content says otherwise.
 */
export function effectiveHoursMultiplier(
  demands: Partial<Record<SubjectTag, number>>,
  levels: Levels,
): number {
  const entries = Object.entries(demands) as [SubjectTag, number][]
  const totalDemand = entries.reduce((sum, [, level]) => sum + level, 0)
  if (totalDemand === 0) return 1
  return entries.reduce((mult, [tag, courseLevel]) => {
    const weight = courseLevel / totalDemand
    const gap = demandGap(courseLevel, levels[tag])
    return mult + weight * demandGapMultiplier(gap)
  }, 0)
}

/** An assignment's personalized cost: the authored hours, run through this player's gaps. */
export function effectiveHours(
  estHours: number,
  demands: Partial<Record<SubjectTag, number>>,
  levels: Levels,
): number {
  return estHours * effectiveHoursMultiplier(demands, levels)
}
