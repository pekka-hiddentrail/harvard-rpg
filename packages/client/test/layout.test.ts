import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CANVAS, COLUMNS, DAY_COLUMNS, FRAME, PANES, pad, rule, sign } from '../src/layout.ts'

/**
 * The canvas has to hold the screens that are coming, not just the one that exists. These
 * tests are where that reasoning lives: if a future pane doesn't fit, this file fails rather
 * than the layout quietly reflowing and looking broken.
 */

describe('the canvas', () => {
  it('never writes the last column', () => {
    // A glyph in the final column triggers autowrap and the row bleeds into the next.
    assert.ok(FRAME.cols < CANVAS.cols)
    assert.equal(rule().length, FRAME.cols)
  })

  it('leaves a row for the newline Ink emits after the tree', () => {
    assert.ok(FRAME.rows < CANVAS.rows)
  })

  it('fits the creation screen with room to spare', () => {
    // header, rule, list, rule, detail, rule, two identity rows, problems + its margin,
    // rule, keys.
    const used = 1 + 1 + PANES.list + 1 + PANES.detail + 1 + 2 + (PANES.problems + 1) + 1 + 1
    assert.ok(used <= FRAME.rows, `creation needs ${used} rows, frame has ${FRAME.rows}`)
  })

  it('fits the Tier 1 day planner, which is why it is this size', () => {
    // The screen the canvas was sized for, counted row by row against `Planner.tsx`:
    // header, rule, eleven bands, rule, the option prompt + its list, rule, problems, rule,
    // the status line, rule, keys.
    const used =
      1 + 1 + PANES.bands + 1 + (1 + PANES.options) + 1 + PANES.problems + 1 + 1 + 1 + 1
    assert.ok(used <= FRAME.rows, `the planner needs ${used} rows, frame has ${FRAME.rows}`)
  })

  it('keeps the eleven band rows, because they are the day', () => {
    // Eleven fixed bands is the design (GAME_DESIGN §3.1), not a layout preference. If
    // something new needs vertical room, `options` is what gives — never this.
    assert.equal(PANES.bands, 11)
  })

  it('fits the band row across, with the half-band cell on the end', () => {
    const row = Object.values(DAY_COLUMNS).reduce((s, w) => s + w, 0)
    assert.ok(row <= FRAME.cols, `the band row needs ${row} columns, frame has ${FRAME.cols}`)
    // The two-character occupancy cell plus its cursor brackets — `[▓▓]`.
    assert.ok(DAY_COLUMNS.halves >= 4)
    // Room for the longest activity label the shipped pack can produce, plus a subject:
    // 'Reading · discussion' is 20.
    assert.ok(DAY_COLUMNS.activity >= 24)
  })

  it('keeps the side pane the canvas was widened for', () => {
    // `CANVAS` above justifies 100 columns by needing "a status pane beside them ... where the
    // hunger clock and the banked hours live". This is that pane: the gap in bands, the yield
    // multiplier it cost, and the energy left — `  4½  ×0.85  e  5.0`.
    assert.ok(DAY_COLUMNS.trace >= 20, 'the trace pane cannot hold gap, multiplier and energy')
    const left = Object.entries(DAY_COLUMNS)
      .filter(([k]) => k !== 'trace')
      .reduce((s, [, w]) => s + w, 0)
    assert.ok(left + DAY_COLUMNS.trace <= FRAME.cols)
  })

  it('fits the widest option row: name, note, and the whole price ladder', () => {
    // Study runs to six halves, so its ladder is six rungs of `1½=1.7` joined by spaces.
    const ladder = 6 * 6 + 5
    const option = 4 + 16 + 18 + ladder
    assert.ok(option <= FRAME.cols, `an option row needs ${option} columns`)
  })

  it('leaves the list column room for its widest row', () => {
    // '[x] ' + a 30-character name + a 4-character cost + a language.
    assert.ok(4 + 30 + 4 + 12 <= COLUMNS.list)
    assert.ok(COLUMNS.list + COLUMNS.gap < FRAME.cols)
  })
})

describe('pad', () => {
  it('pads and truncates, so a row can never push its neighbour', () => {
    assert.equal(pad('abc', 5), 'abc  ')
    assert.equal(pad('abcdefg', 5), 'abcde')
    assert.equal(pad('', 3).length, 3)
  })
})

describe('sign', () => {
  it('marks refunds and leaves spends alone', () => {
    assert.equal(sign(3), '+3')
    assert.equal(sign(-3), '-3')
    assert.equal(sign(0), '0')
  })
})
