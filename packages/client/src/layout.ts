/**
 * The canvas.
 *
 * This is an old-school text interface, and old-school text interfaces are drawn on a
 * *fixed* canvas. Reflowing to fit the terminal sounds accommodating and is in fact the
 * source of every layout glitch: a column that shrinks by four characters silently truncates
 * a trait name, and a pane that grows by two lines shoves the keybindings off the bottom.
 *
 * So: one size, declared here, enforced everywhere. The window is opened at this size
 * (`scripts/play.ts`), the app refuses to draw below it, and every pane has a fixed height
 * so that nothing below a pane moves when its contents change.
 *
 * 100 × 34 rather than the iconic 80 × 25, because of the screen that comes next. The Tier 1
 * day planner needs eleven band rows plus chrome vertically, and horizontally it needs a
 * band label, the activity, a duration, an effect hint *and* a status pane beside them —
 * which is ~94 columns. 80 would mean dropping the side pane, and the side pane is where
 * the hunger clock and the banked hours live. Better to pick the width the hard screen needs
 * once than to redesign it later.
 */
export const CANVAS = { cols: 100, rows: 34 } as const

/**
 * The drawable area, one short in each direction. Writing a glyph into the last column
 * triggers autowrap and the row bleeds into the next one; the spare row absorbs the newline
 * Ink emits after the tree, which would otherwise scroll the whole screen by one.
 */
export const FRAME = { cols: CANVAS.cols - 1, rows: CANVAS.rows - 1 } as const

export const rule = (ch = '─'): string => ch.repeat(FRAME.cols)

/**
 * A rule with a label set into it at a fixed column, so a column heading costs zero rows:
 * `──────────────── gap  yield  energy ────`. The label is placed verbatim; pad it yourself.
 */
export const ruleLabel = (label: string, at: number, ch = '─'): string => {
  const start = Math.max(0, Math.min(at, FRAME.cols - label.length))
  return ch.repeat(start) + label + ch.repeat(Math.max(0, FRAME.cols - start - label.length))
}

/** Creation's two columns. The list is wide enough for the longest trait name plus a cost. */
export const COLUMNS = { list: 52, gap: 2 } as const

/**
 * Fixed pane heights. `list` is 14 because it must also hold the eleven time bands plus a
 * header and a total when Tier 1 reuses this shape for the day planner.
 *
 * The day planner's three panes (Tier 1): eleven band rows, then the numbered options for
 * whichever half-band the cursor is on, then the problems. Eleven is not negotiable — it is
 * the day — so `options` is the pane that gets squeezed if anything else needs room, and
 * `layout.test.ts` is where that stays honest.
 */
export const PANES = { list: 14, detail: 5, problems: 3, bands: 11, options: 8 } as const

/**
 * The day planner's columns, left to right. Sums to under `FRAME.cols`.
 *
 * `trace` is the side pane this canvas was widened for (see `CANVAS` above): the gap clock,
 * the yield multiplier it cost and the energy left, printed on the band row where they
 * happened rather than summarised once at the bottom.
 */
export const DAY_COLUMNS = {
  cursor: 2,
  index: 3,
  clock: 16,
  activity: 30,
  duration: 9,
  hours: 9,
  halves: 4,
  trace: 20,
} as const

/** Pad *and* truncate. A row that is exactly the column width can't push its neighbour. */
export const pad = (s: string, w: number): string => s.padEnd(w).slice(0, w)

export const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`)
