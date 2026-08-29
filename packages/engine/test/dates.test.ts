import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  daysInMonth,
  formatLong,
  formatShort,
  isLeap,
  nextDay,
  parseDate,
  toISO,
  weekdayName,
} from '@harvard/engine'

/**
 * Calendar arithmetic, done by hand because `new Date` is banned in the engine (§3.3: the
 * engine may not read a clock, and `new Date('2027-08-30')` is one typo away from reading
 * the machine's timezone into a save).
 *
 * The weekday matters more than it looks. The freshman calendar (§9.5) is written in
 * weekdays — sections on Tuesdays, problem sets due Fridays — so an off-by-one in Sakamoto's
 * method would quietly shift every deadline in the term by a day.
 */

describe('parsing', () => {
  it('reads an ISO date', () => {
    assert.deepEqual(parseDate('2027-08-30'), { y: 2027, m: 8, d: 30 })
  })

  it('refuses anything else', () => {
    for (const bad of ['2027-8-30', '30/08/2027', '2027-13-01', '2027-02-30', '', 'today']) {
      assert.throws(() => parseDate(bad), new RegExp(''), `should have refused ${bad}`)
    }
  })

  it('round-trips through toISO', () => {
    assert.equal(toISO(parseDate('2027-01-05')), '2027-01-05')
  })
})

describe('leap years', () => {
  it('knows the century rule', () => {
    assert.equal(isLeap(2028), true)
    assert.equal(isLeap(2027), false)
    assert.equal(isLeap(2100), false)
    assert.equal(isLeap(2000), true)
  })

  it('gives February the right length', () => {
    assert.equal(daysInMonth(2028, 2), 29)
    assert.equal(daysInMonth(2027, 2), 28)
    assert.equal(daysInMonth(2027, 12), 31)
  })
})

describe('weekdays', () => {
  it('places the two dates the freshman calendar is anchored to', () => {
    // §9.5: move-in is Thursday 26 August 2027, so the first Monday of the term is the 30th.
    // These two are asserted rather than derived because `rules.day.firstDay` is authored
    // content — if the content ever names a Saturday, this test is where it shows up.
    assert.equal(weekdayName(parseDate('2027-08-26')), 'Thursday')
    assert.equal(weekdayName(parseDate('2027-08-30')), 'Monday')
  })

  it('agrees with itself across a leap-year boundary', () => {
    assert.equal(weekdayName(parseDate('2028-02-28')), 'Monday')
    assert.equal(weekdayName(parseDate('2028-02-29')), 'Tuesday')
    assert.equal(weekdayName(parseDate('2028-03-01')), 'Wednesday')
  })
})

describe('nextDay', () => {
  it('rolls the month, the year and the leap day', () => {
    assert.equal(toISO(nextDay(parseDate('2027-08-30'))), '2027-08-31')
    assert.equal(toISO(nextDay(parseDate('2027-08-31'))), '2027-09-01')
    assert.equal(toISO(nextDay(parseDate('2027-12-31'))), '2028-01-01')
    assert.equal(toISO(nextDay(parseDate('2028-02-28'))), '2028-02-29')
    assert.equal(toISO(nextDay(parseDate('2027-02-28'))), '2027-03-01')
  })

  it('walks a full year and lands where it started, plus one', () => {
    let d = parseDate('2027-01-01')
    for (let i = 0; i < 365; i++) d = nextDay(d)
    assert.equal(toISO(d), '2028-01-01')
  })
})

describe('formatting', () => {
  it('writes the planner header and the log line', () => {
    assert.equal(formatLong(parseDate('2027-08-30')), 'Monday, 30 August 2027')
    assert.equal(formatShort(parseDate('2027-08-30')), 'Mon 30 Aug')
  })
})
