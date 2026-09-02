import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BANDS, BAND_COUNT, bandsForMinutes, bandsForTimeRange, minutesOfClock } from '../src/bands.ts'

describe('minutesOfClock', () => {
  it('reads a published time', () => {
    assert.equal(minutesOfClock('09:00'), 540)
    assert.equal(minutesOfClock('00:00'), 0)
    assert.equal(minutesOfClock('9:05'), 545) // the registrar is not always zero-padded
    assert.equal(minutesOfClock(' 16:30 '), 990)
  })

  it('throws rather than returning NaN', () => {
    // The reason this matters: `NaN` would propagate silently into a band range and place a
    // class nowhere at all, which looks like a free afternoon.
    for (const bad of ['', 'noon', '9', '09-00', '25:00', '09:75', '09:0']) {
      assert.throws(() => minutesOfClock(bad), /not a clock time/, `accepted \`${bad}\``)
    }
  })
})

describe('bandsForMinutes', () => {
  it('counts a band occupied when the class overlaps it at all', () => {
    // Band 2 is 09:00-10:15, band 3 is 10:30-11:45. A class running 09:00-11:45 covers both
    // *and* the fifteen minutes between them — which you cannot study in, so rounding the
    // other way would hand back a band the player does not have.
    assert.deepEqual(bandsForMinutes(540, 705), { startBand: 2, endBand: 4 })
    // 09:00-10:30 ends exactly where band 3 starts, so band 3 is untouched.
    assert.deepEqual(bandsForMinutes(540, 630), { startBand: 2, endBand: 3 })
    // A 50-minute MWF lecture sits inside one band.
    assert.deepEqual(bandsForMinutes(540, 590), { startBand: 2, endBand: 3 })
  })

  it('places a class that starts inside a gap in the band it runs into', () => {
    // 10:20 is after band 2 ends (10:15) and before band 3 begins (10:30). The first band
    // whose end is past the start is band 3, which is where the class actually is.
    assert.deepEqual(bandsForMinutes(620, 700), { startBand: 3, endBand: 4 })
  })

  it('runs Night to the end of the day', () => {
    const night = BANDS[BAND_COUNT - 1]!
    assert.equal(night.name, 'night')
    assert.deepEqual(bandsForMinutes(1300, 1440), { startBand: 10, endBand: 11 })
  })

  it('refuses an empty or backwards range, and one off the end of the day', () => {
    assert.throws(() => bandsForMinutes(540, 540), /empty clock range/)
    assert.throws(() => bandsForMinutes(700, 600), /empty clock range/)
    // Before the wakeup band begins: nothing on the grid holds a 03:00 class.
    assert.throws(() => bandsForMinutes(0, 60), /outside the day/)
  })

  it('leaves no minute of the school day unplaceable', () => {
    // Every band's own extent must map back to itself — the grid has to be total over itself,
    // or some published time lands nowhere.
    for (const b of BANDS) {
      const { startBand, endBand } = bandsForMinutes(b.startMin, b.endMin)
      assert.equal(startBand, b.index, `band ${b.index} (${b.name}) did not map to itself`)
      assert.equal(endBand, b.index + 1, `band ${b.index} (${b.name}) spilled`)
    }
  })
})

describe('bandsForTimeRange', () => {
  it('accepts either a hyphen or an en dash', () => {
    // Content is authored with hyphens; `BANDS[].label` uses en dashes.
    assert.deepEqual(bandsForTimeRange('09:00-10:30'), { startBand: 2, endBand: 3 })
    assert.deepEqual(bandsForTimeRange('09:00 – 10:30'), { startBand: 2, endBand: 3 })
  })

  it('refuses anything that is not exactly two times', () => {
    for (const bad of ['09:00', '09:00-10:30-11:00', '']) {
      assert.throws(() => bandsForTimeRange(bad), Error, `accepted \`${bad}\``)
    }
  })
})
