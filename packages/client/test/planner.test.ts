import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DAY_COLUMNS, FRAME, ruleLabel } from '../src/layout.ts'
import {
  LEFT,
  TRACE_HEADER,
  bandLine,
  halfCell,
  optionLine,
  statusLine,
  traceCell,
  type ActivityView,
  type BandView,
  type DayView,
} from '../src/Planner.tsx'

/**
 * The day planner's line builders.
 *
 * They are exported as pure functions precisely so this file can exist: ARCHITECTURE §11 puts
 * Tier 1's whole interface risk on this screen, and "does the afternoon that a missing lunch
 * ruins actually show up on the afternoon's row" is a question about a string, not about Ink.
 * Nothing here renders a component; `scripts/screen.ts` is for looking at the result.
 *
 * The fixture is hand-built rather than fetched, because these are claims about the *drawing*.
 * `packages/server/test/slice.test.ts` owns the claim that the server sends this shape.
 */

const PER = 2

const band = (index: number, label: string, anchor: string | null = null): BandView => ({
  index,
  label,
  name: `band ${index}`,
  anchor,
})

/** Twenty-two halves of gap clock, resetting at `mealAt` and never otherwise. */
const trace = (mealAt: number | null, mult = 1): DayView['trace'] => {
  const out: DayView['trace'] = []
  let gapHalves = 4
  for (let h = 0; h < 22; h++) {
    gapHalves = mealAt !== null && h === mealAt ? 0 : gapHalves + 1
    out.push({ gap: gapHalves / PER, energy: 6, stress: 20, mult })
  }
  return out
}

const view = (over: Partial<DayView> = {}): DayView => ({
  day: 1,
  date: '2027-08-30',
  dateLong: 'Monday, 30 August 2027',
  grid: new Array<number | null>(22).fill(null),
  placements: [],
  hours: { total: 0, bySubject: {} },
  freeHalves: 22,
  body: { energy: 6, stress: 20, condition: 55, halvesSinceFood: 4 },
  bandsSinceFood: 2,
  peakGap: 2,
  trace: trace(null),
  meals: 0,
  slept: false,
  problems: [],
  ok: true,
  log: 'a line',
  ...over,
})

/** One placement, plus the grid entries that own it — the server sends both; so must the fixture. */
const withPlacement = (
  p: DayView['placements'][number],
  over: Partial<DayView> = {},
): DayView => {
  const grid = new Array<number | null>(22).fill(null)
  for (let h = p.start; h < p.start + p.halves; h++) grid[h] = 0
  return view({ placements: [p], grid, ...over })
}

const study = (start: number, halves: number, hours: number): DayView['placements'][number] => ({
  start,
  halves,
  activity: 'study',
  name: 'Study',
  target: 'math',
  hours,
  gross: hours,
  mult: 1,
  band: Math.floor(start / PER),
})

const banksHours = (id: string) => id === 'study' || id === 'read'

describe('halfCell', () => {
  const grid = (...owned: number[]): (number | null)[] => {
    const g = new Array<number | null>(22).fill(null)
    for (const h of owned) g[h] = 0
    return g
  }

  it('shows a half-band session as half a cell', () => {
    // The point of the whole grid: a 1.5-band session leaves a real, visible, usable half.
    assert.equal(halfCell(grid(4, 5, 6), 3, PER, 0), ' ▓· ')
    assert.equal(halfCell(grid(4, 5, 6), 2, PER, 0), ' ▓▓ ')
    assert.equal(halfCell(grid(), 2, PER, 0), ' ·· ')
  })

  it('marks which half the cursor is on', () => {
    assert.equal(halfCell(grid(), 3, PER, 6), '[··]')
    assert.equal(halfCell(grid(), 3, PER, 7), ' ··<')
    assert.equal(halfCell(grid(), 3, PER, 8), ' ·· ')
  })
})

describe('bandLine', () => {
  it('names the activity, its length and what it banked', () => {
    const v = withPlacement(study(4, 2, 1.0))
    const text = bandLine(band(2, '09:00 – 10:15'), v, 0, PER, 9, banksHours).text
    assert.match(text, /Study · math/)
    assert.match(text, /1 band/)
    assert.match(text, /1\.0 h/)
  })

  it('prints a zero for a session that banked nothing, and nothing for a meal', () => {
    // `0.0 h` and blank are different facts. A half-band of study banks nothing and the player
    // has to see that zero; a meal was never going to bank anything and a zero would be a lie.
    const spun = withPlacement(study(4, 1, 0))
    assert.match(bandLine(band(2, '09:00'), spun, 0, PER, 9, banksHours).text, /0\.0 h/)
    const meal = withPlacement({
      start: 8,
      halves: 2,
      activity: 'lunch',
      name: 'Lunch',
      hours: 0,
      gross: 0,
      mult: 1,
      band: 4,
    })
    assert.ok(!/0\.0 h/.test(bandLine(band(4, '12:00'), meal, 0, PER, 9, banksHours).text))
  })

  it('carries a long session into the bands it covers', () => {
    // A three-band block is one placement and three rows; the rows it does not start have to
    // say so, or the grid reads as an empty afternoon with a total attached.
    const v = withPlacement(study(4, 6, 2.3))
    assert.match(bandLine(band(3, '10:30'), v, 0, PER, 9, banksHours).text, /⋮ Study/)
    assert.ok(!/⋮/.test(bandLine(band(2, '09:00'), v, 0, PER, 9, banksHours).text))
  })

  it('dims a free band and flags an unfilled meal anchor', () => {
    const v = view()
    assert.equal(bandLine(band(6, '15:00'), v, 0, PER, 9, banksHours).dim, true)
    assert.equal(bandLine(band(4, '12:00', 'meal'), v, 0, PER, 9, banksHours).color, 'yellow')
    // Fill the anchor and the warning goes away.
    const fed = withPlacement({
      start: 8,
      halves: 2,
      activity: 'lunch',
      name: 'Lunch',
      hours: 0,
      gross: 0,
      mult: 1,
      band: 4,
    })
    assert.equal(bandLine(band(4, '12:00', 'meal'), fed, 0, PER, 9, banksHours).color, undefined)
  })

  it('marks the cursor band and fits inside the frame', () => {
    const v = withPlacement(study(4, 6, 2.3))
    const here = bandLine(band(2, '09:00 – 10:15'), v, 4, PER, 2, banksHours).text
    assert.equal(here.startsWith('>'), true)
    assert.equal(bandLine(band(3, '10:30'), v, 4, PER, 2, banksHours).text.startsWith('>'), false)
    for (const b of [0, 5, 10]) {
      const text = bandLine(band(b, '00:00 – 00:00'), v, 4, PER, 2, banksHours).text
      assert.ok(text.length <= FRAME.cols, `band ${b} is ${text.length} columns`)
    }
  })
})

describe('the trace pane', () => {
  it('prints the gap on the row where it happened, not once at the bottom', () => {
    // §3.5: the cost of a skipped meal lands on the bands you were stealing. A single
    // end-of-day number cannot show that, which is the entire reason this pane exists.
    // The meal lands on half 9, so band 5 (halves 10-11) is the first band after it.
    const fed = view({ trace: trace(9) })
    const hungry = view({ trace: trace(null) })
    assert.match(traceCell(fed, 5, PER), /\s1\s/) // one band since eating
    assert.match(traceCell(hungry, 5, PER), /\s8\s/) // ...and eight without
    // And it keeps climbing from wherever it was left: band 8 is four bands past the meal.
    assert.match(traceCell(fed, 8, PER), /\s4\s/)
  })

  it('writes half-bands as a glyph rather than a decimal', () => {
    const v = view({ trace: trace(null).map((t, h) => (h === 5 ? { ...t, gap: 4.5 } : t)) })
    assert.match(traceCell(v, 2, PER), /4½/)
  })

  it('shows a multiplier only when it is not 1, and averages it over the band', () => {
    assert.ok(!traceCell(view({ trace: trace(null, 1) }), 4, PER).includes('×'))
    assert.match(traceCell(view({ trace: trace(null, 0.85) }), 4, PER), /×0\.85/)
    const mixed = view({
      trace: trace(null, 1).map((t, h) => (h === 9 ? { ...t, mult: 0.8 } : t)),
    })
    assert.match(traceCell(mixed, 4, PER), /×0\.90/)
  })

  it('is exactly as wide as the column it was given, and its heading lines up', () => {
    const v = view({ trace: trace(null, 0.85) })
    for (let b = 0; b < 11; b++) {
      assert.equal(traceCell(v, b, PER).length, DAY_COLUMNS.trace, `band ${b} cell is off-width`)
    }
    // The blank-multiplier case has to hold the same width, or the energy column staircases.
    assert.equal(traceCell(view(), 0, PER).length, DAY_COLUMNS.trace)
    assert.equal(TRACE_HEADER.length, DAY_COLUMNS.trace)
    assert.equal(LEFT + DAY_COLUMNS.trace <= FRAME.cols, true)
  })

  it('says nothing at all when there is no trace to say it from', () => {
    assert.equal(traceCell(view({ trace: [] }), 4, PER), '')
  })
})

describe('ruleLabel', () => {
  it('sets a heading into the rule without costing a row', () => {
    const line = ruleLabel(' gap ', 10)
    assert.equal(line.length, FRAME.cols)
    assert.equal(line.slice(10, 15), ' gap ')
    assert.equal(line[9], '─')
  })

  it('clamps a label that would run off the end', () => {
    const line = ruleLabel(' gap ', FRAME.cols)
    assert.equal(line.length, FRAME.cols)
    assert.ok(line.endsWith(' gap '))
  })
})

describe('optionLine', () => {
  const activity = (over: Partial<ActivityView>): ActivityView => ({
    id: 'x',
    name: 'Thing',
    blurb: '',
    kind: 'other',
    targets: 'none',
    minHalves: 1,
    maxHalves: 4,
    fixed: false,
    allowedBands: [],
    food: 'none',
    sleep: false,
    prices: [{ halves: 1, label: '1 band', hours: null }],
    ...over,
  })

  it('prints the whole ladder for anything that banks hours', () => {
    // §12: options show their price, never their outcome — and for study the *shape* of the
    // ladder is the price. One rung would leave "continuity beats duration" a secret.
    const line = optionLine(
      activity({
        name: 'Study',
        targets: 'subject',
        minHalves: 1,
        maxHalves: 6,
        prices: [
          { halves: 1, label: '', hours: 0 },
          { halves: 2, label: '', hours: 1 },
          { halves: 3, label: '', hours: 1.7 },
        ],
      }),
      0,
      PER,
    )
    assert.match(line.text, /½=0\.0 1=1\.0 1½=1\.7/)
    assert.match(line.text, /aim it with t/)
    assert.ok(line.text.length <= FRAME.cols)
  })

  it('gives a range rather than a ladder when nothing is banked', () => {
    // Half a band to two bands — and it says `½`, not `0.5`, because the half-band is the atom.
    const line = optionLine(
      activity({
        minHalves: 1,
        maxHalves: 4,
        prices: [
          { halves: 1, label: '1 band', hours: null },
          { halves: 2, label: '1 band', hours: null },
        ],
      }),
      1,
      PER,
    )
    assert.match(line.text, /½–2 bands/)
  })

  it('names the one thing each option does to the clock', () => {
    assert.match(optionLine(activity({ food: 'meal' }), 0, PER).text, /resets the clock/)
    assert.match(optionLine(activity({ food: 'snack' }), 0, PER).text, /defers the clock/)
    assert.match(optionLine(activity({ sleep: true }), 0, PER).text, /ends the day/)
    assert.match(optionLine(activity({ fixed: true }), 0, PER).text, /fixed length/)
  })
})

describe('statusLine', () => {
  it('reports the totals', () => {
    const line = statusLine(
      view({ hours: { total: 4, bySubject: { math: 4, code: 0 } }, meals: 3, slept: true }),
    )
    assert.match(line.text, /banked 4\.0 h \(math 4\.0\)/)
    assert.ok(!line.text.includes('code'), 'a subject with no hours should not be listed')
    assert.match(line.text, /3 meals, gap peaked/)
    assert.match(line.text, /stress 20 · condition 55/)
  })

  it('survives the worst day anyone can plan without losing its tail', () => {
    // This row was 108 columns and was being silently truncated — the meal count fell off the
    // end of the frame and nobody noticed, because `pad` cuts without complaining. So: the
    // widest input the game can produce, and the last fact still has to be on the row.
    const every = {
      discussion: 12,
      writing: 12,
      reading: 12,
      math: 12,
      stats: 12,
      code: 12,
      lab: 12,
    }
    const line = statusLine(
      view({
        hours: { total: 84, bySubject: every },
        meals: 3,
        peakGap: 11,
        body: { energy: 0, stress: 100, condition: 100, halvesSinceFood: 22 },
      }),
    )
    assert.equal(line.text.length, FRAME.cols)
    assert.ok(line.text.trimEnd().endsWith('condition 100'), line.text)
    // As many subjects as fit, and a count of the rest. `discussion 12.0` alone is fifteen
    // columns; two of those would cost the tail.
    assert.match(line.text, /\+6\)/)
  })
})
