/**
 * The hidden draw (GAME_DESIGN §4.4). Pure primitives only — this file has no notion of
 * "today" or "which activity you just did"; the day/calendar layer decides *when* to call
 * `drawCards` and `applyBumps`, this only computes what they produce. No `Math.random`,
 * no `Date.now` — draws are deterministic from `(saveSeed, assessmentId)` so a reload can
 * never reroll a bad grade (§4.4, ARCHITECTURE §11.1).
 */

import { weightedAverageGap } from './demands'
import type { Levels, SubjectTag } from './schema'

export type Band = 'narrow' | 'moderate' | 'wide'

/** The two authored thresholds from `deriveBrackets` (effort.ts) — no third cutoff. */
export function bandFor(hoursBanked: number, brackets: { moderate: number; narrow: number }): Band {
  if (hoursBanked >= brackets.narrow) return 'narrow'
  if (hoursBanked >= brackets.moderate) return 'moderate'
  return 'wide'
}

/** Half a letter grade, a full one, or up to two — the band's width, said in words. */
export const CONFIDENCE_LABEL: Record<Band, string> = {
  narrow: 'give or take half a letter grade',
  moderate: 'give or take a full letter grade',
  wide: 'could swing one and a half to two letter grades either way',
}

// ── the draw ──────────────────────────────────────────────────────────────────────────

/** Each card's range, by band. `wide` absorbs both the ±3 and ±4 magnitudes — one band,
 * not two, since splitting them added a threshold nothing else needed. */
const CARD_RANGE: Record<Band, number> = { narrow: 1, moderate: 2, wide: 4 }

function hashSeed(saveSeed: string, assessmentId: string): number {
  const str = `${saveSeed}:${assessmentId}`
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — small, seeded, deterministic. Not cryptographic; doesn't need to be. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * `count` cards, each an integer drawn uniformly from the band's `-range..range`. Fixed
 * forever once drawn (§4.4) — the caller draws exactly once per assessment and never
 * again, even if the player's band later changes.
 */
export function drawCards(saveSeed: string, assessmentId: string, band: Band, count: number): number[] {
  const range = CARD_RANGE[band]
  const span = 2 * range + 1
  const rand = mulberry32(hashSeed(saveSeed, assessmentId))
  return Array.from({ length: count }, () => Math.floor(rand() * span) - range)
}

// ── scoring ───────────────────────────────────────────────────────────────────────────

/** 0 scores full points; ±1 and ±2 score partial; ±3 and ±4 score nothing (yet — see
 * `applyBumps`, which is why a 4 always gets bumped toward 3 last, not first). */
function cardPoints(card: number): number {
  const magnitude = Math.abs(card)
  if (magnitude === 0) return 1
  if (magnitude === 1) return 0.75
  if (magnitude === 2) return 0.5
  return 0
}

/** The average of every card's points, linearly onto a 0-100 percentage. No mean-shift,
 * no curve — the band already did all the work by setting how wide the cards can be. */
export function scorePercentage(cards: readonly number[]): number {
  if (cards.length === 0) return 0
  const avg = cards.reduce((sum, c) => sum + cardPoints(c), 0) / cards.length
  return Math.round(avg * 100)
}

// ── bumping (the final 48 hours, §4.4 step 5, made literal) ─────────────────────────────

function bumpTowardZero(card: number): number {
  if (card > 0) return card - 1
  if (card < 0) return card + 1
  return 0
}

/**
 * Which card the next bump should hit. A card at magnitude 3, 2 or 1 always scores more
 * points once bumped — those go first, largest magnitude first, since that's the biggest
 * single gain available. A card at magnitude 4 scores nothing until it *reaches* 3, so
 * bumping one is a wasted step unless nothing productive is left.
 */
function pickBumpTarget(cards: readonly number[]): number | undefined {
  const nonzero = cards.map((c, i) => ({ i, magnitude: Math.abs(c) })).filter((c) => c.magnitude > 0)
  if (nonzero.length === 0) return undefined
  const productive = nonzero.filter((c) => c.magnitude <= 3)
  const pool = productive.length > 0 ? productive : nonzero
  pool.sort((a, b) => b.magnitude - a.magnitude)
  return pool[0]!.i
}

/** Every 2 real hours studied after the draw moves one card one step toward 0. Capped —
 * once every card is at 0, further hours do nothing further for this item. */
export function applyBumps(cards: readonly number[], extraHours: number): number[] {
  let bumps = Math.floor(extraHours / 2)
  const result = [...cards]
  while (bumps > 0) {
    const target = pickBumpTarget(result)
    if (target === undefined) break
    result[target] = bumpTowardZero(result[target])
    bumps--
  }
  return result
}

// ── when the draw happens ────────────────────────────────────────────────────────────

/**
 * T-48h, always — no exception. A practice exam or a 1-on-1 review isn't a way to see the
 * draw sooner; it's just a study session with the highest support multiplier available
 * (see `PRACTICE_MULTIPLIER` in levels.ts), banking effective hours toward the pool like
 * any other. Triggering the draw earlier than T-48h would only leave less runway to bump
 * with afterward — worse for the player, not better — so there is no early path at all.
 * Once fired, it never fires again for the same assessment; the caller owns that one-shot
 * bookkeeping, this only answers "should it fire on this check."
 */
export function isDrawTriggered(hoursUntilDue: number): boolean {
  return hoursUntilDue <= 48
}

// ── letter table ──────────────────────────────────────────────────────────────────────

const LETTER_TABLE: readonly { min: number; letter: string }[] = [
  { min: 95, letter: 'A' },
  { min: 90, letter: 'A-' },
  { min: 85, letter: 'B+' },
  { min: 80, letter: 'B' },
  { min: 75, letter: 'B-' },
  { min: 70, letter: 'C+' },
  { min: 65, letter: 'C' },
  { min: 60, letter: 'C-' },
  { min: 55, letter: 'D+' },
  { min: 50, letter: 'D' },
  { min: 0, letter: 'F' },
]

export function letterFor(percentage: number): string {
  return LETTER_TABLE.find((row) => percentage >= row.min)!.letter
}

// ── psets: completion-graded, never drawn (§4.1) ────────────────────────────────────────

/** A copied submission still completes the assignment, banks zero pool hours (already
 * decided), and grades flat at a C — not scaled by how little real work went into it. */
const COPIED_WORK_PERCENTAGE = 67 // midpoint of the C band (65-69)

/**
 * A pset's own grade, on the same 0-100 scale as everything else. `effectiveEstHours` is
 * the authored cost run through this player's demand-gap (and, once stacked, attendance)
 * multipliers — never the raw authored number.
 */
export function psetGradePercentage(
  realHours: number,
  effectiveEstHours: number,
  copied: boolean,
): number {
  if (copied) return COPIED_WORK_PERCENTAGE
  return Math.round(Math.min(1, realHours / effectiveEstHours) * 100)
}

// ── the course grade ──────────────────────────────────────────────────────────────────

/**
 * One weighted average across every graded item, pset and milestone alike — everything
 * already lives on the same 0-100 scale, so there is no separate combination step per kind.
 */
export function courseGradePercentage(items: readonly { percentage: number; weight: number }[]): number {
  const weightTotal = items.reduce((sum, i) => sum + i.weight, 0)
  if (weightTotal === 0) return 0
  const weighted = items.reduce((sum, i) => sum + i.percentage * i.weight, 0)
  return Math.round((weighted / weightTotal) * 10) / 10
}

// ── lean (display-only, §4.5's demand gap reused for the forecast) ──────────────────────

export type Lean = 'top' | 'bottom' | 'even'

/** A dead band around zero, so a near-exact match reads as "even" rather than flip-flopping
 * on a rounding artifact. */
const LEAN_THRESHOLD = 0.5

export function leanFor(demands: Partial<Record<SubjectTag, number>>, levels: Levels): Lean {
  const gap = weightedAverageGap(demands, levels)
  if (gap <= -LEAN_THRESHOLD) return 'top'
  if (gap >= LEAN_THRESHOLD) return 'bottom'
  return 'even'
}
