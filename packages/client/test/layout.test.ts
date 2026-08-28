import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CANVAS, COLUMNS, FRAME, PANES, pad, rule, sign } from '../src/layout.ts'

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
    // Eleven bands (GAME_DESIGN §3) plus a header row and a totals row, in the list pane.
    assert.ok(PANES.list >= 11 + 2, `the eleven bands need ${13} rows, pane has ${PANES.list}`)
    // And the planner's widest row: band label, activity, duration, effect hint, side pane.
    const planner = 10 + 3 + 26 + 1 + 5 + 1 + 18
    assert.ok(planner + COLUMNS.gap + 30 <= FRAME.cols, 'the day planner will not fit')
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
