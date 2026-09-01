import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { courseGaps, previewCourse, summarizeCart } from '../src/shopping.ts'
import { zeroLevels } from '../src/schema.ts'
import type { Assignment, Levels, Syllabus } from '../src/schema.ts'

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  )

// Two psets, 6h each, spanning weeks 1-3 -> 12/3 = 4h/week of coursework.
const psets: Assignment[] = [
  { id: 'ps1', kind: 'pset', assigned: { week: 1, session: 1 }, due: { week: 2, session: 1 }, estHours: 6, weight: 0.25, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps2', kind: 'pset', assigned: { week: 2, session: 1 }, due: { week: 3, session: 1 }, estHours: 6, weight: 0.25, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
]

/** Shaped after the §4.6 r11 worked example: CS 50 asking `code 2, math 1`. */
const cs50: Syllabus = {
  id: '050',
  courseCode: 'cs50',
  title: 'Introduction to Computer Science',
  demand: 7,
  demands: { code: 2, math: 1 },
  // 09:00-10:30 x Mon/Wed = 3h/week of contact time.
  meetings: [{ type: 'lecture', days: ['Mon', 'Wed'], time: '09:00-10:30', size: 850, attendance: 'flexible', sections: false }],
  officeHours: [],
  sessions: [{ n: 1, topic: 'x' }],
  assignments: psets,
}

/** r11's other example: Math 21b asking `math 3`, which a math −2 player cannot take. */
const math21b: Syllabus = {
  ...cs50,
  id: '121',
  courseCode: 'math21b',
  title: 'Linear Algebra',
  demand: 8,
  demands: { math: 3 },
}

const at = (overrides: Partial<Levels>): Levels => ({ ...zeroLevels(), ...overrides })

describe('courseGaps', () => {
  it('prices every demanded tag, weighting each share by its own demand level', () => {
    const gaps = courseGaps(cs50, at({ code: 2, math: -2 }))
    assert.deepEqual(gaps.map((g) => g.tag), ['code', 'math'])

    const [code, math] = gaps
    assert.equal(code?.gap, 0) // asks 2, has 2
    close(code!.share, 2 / 3) // 2 of 3 total demand points
    assert.equal(code?.multiplier, 1.0)

    assert.equal(math?.gap, 3) // asks 1, has -2
    close(math!.share, 1 / 3)
    assert.equal(math?.multiplier, 2.4)
  })

  it('reports a not-survivable tag as a gap row with no multiplier, not as an omission', () => {
    // The whole point of §9.3: a closed course still has to be able to say why it is closed.
    const [math] = courseGaps(math21b, at({ math: -2 }))
    assert.equal(math?.gap, 5)
    assert.equal(math?.multiplier, undefined)
  })
})

describe('previewCourse', () => {
  it('multiplies coursework by the gap and leaves contact time alone', () => {
    const preview = previewCourse(cs50, at({ code: 2, math: -2 }))
    // 3h contact, no exams -> 3h fixed; 4h/week of psets.
    assert.equal(preview.fixedHours, 3)
    assert.equal(preview.baseCourseworkHours, 4)
    assert.equal(preview.baseWeeklyHours, 7)

    // code is at gap 0 (x1.0, so no extra); math is at gap +3 (x2.4) over its 1/3 share:
    // 4 + 4 * (1/3) * 1.4 = 5.8666... -> 5.9
    assert.equal(preview.personalCourseworkHours, 5.9)
    // ...and the 3 fixed hours pass through untouched: 3 + 5.9. If the multiplier were
    // applied to the weekly total instead, this would read 10.3.
    assert.equal(preview.personalWeeklyHours, 8.9)
  })

  it('charges nothing extra to a player who meets every ask, and names no reason', () => {
    const preview = previewCourse(cs50, at({ code: 2, math: 1 }))
    assert.equal(preview.personalWeeklyHours, preview.baseWeeklyHours)
    assert.equal(preview.drivingTag, undefined)
  })

  it('discounts a player who is ahead of every ask', () => {
    // Both tags at gap -1 -> x0.85 across the whole 4h: 4 * 0.85 = 3.4, plus 3h contact.
    const preview = previewCourse(cs50, at({ code: 3, math: 2 }))
    assert.equal(preview.personalCourseworkHours, 3.4)
    assert.equal(preview.drivingTag, undefined) // being ahead is not a "reason"
  })

  it('names the tag actually costing the hours, not the one with the highest level', () => {
    // `code` is the bigger ask (2 vs 1) and the bigger share of the work, but it is met.
    // The reason this course is expensive is the one point of math, and the screen has to
    // say "math" -- that is r11's "the programming is fine, the problem sets are not".
    assert.equal(previewCourse(cs50, at({ code: 2, math: -2 })).drivingTag, 'math')
  })

  it('closes a course at a not-survivable gap without inventing hours for it', () => {
    const preview = previewCourse(math21b, at({ math: -2 }))
    assert.equal(preview.open, false)
    assert.equal(preview.drivingTag, 'math')
    // Base hours still render, so the row can show what the course *is*; the personal
    // figure is not inflated to Infinity for a UI to try to format.
    assert.equal(preview.personalCourseworkHours, preview.baseCourseworkHours)
    assert.ok(Number.isFinite(preview.personalWeeklyHours))
    assert.equal(preview.gaps.length, 1)
  })

  it('counts a representative section length as contact time, never as coursework', () => {
    // CS50's real 2h45m section is most of its contact time; a syllabus alone never pins one.
    const preview = previewCourse(cs50, at({ code: 2, math: -2 }), 2.75)
    assert.equal(preview.fixedHours, 5.8) // 3 + 2.75, rounded once
    assert.equal(preview.personalCourseworkHours, 5.9) // unchanged by the section
    // The parts add up to the total exactly, which is the property r11 leans on -- not
    // round1(5.75 + 5.8666) = 11.6, which would leave the screen's own arithmetic wrong.
    assert.equal(preview.personalWeeklyHours, 11.7)
    assert.equal(preview.fixedHours + preview.personalCourseworkHours, preview.personalWeeklyHours)
  })

  it('amortizes exam sit-time into fixed hours rather than pricing it by gap', () => {
    // A 3h final over a 3-week assignment span -> 1h/week, at everyone's price.
    const withFinal: Syllabus = {
      ...cs50,
      assignments: [
        ...psets,
        { id: 'final', kind: 'final', date: { week: 3, day: 'Wed' }, time: '09:00-12:00', weight: 0.5, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
      ],
    }
    const preview = previewCourse(withFinal, at({ code: 2, math: -2 }))
    assert.equal(preview.fixedHours, 4) // 3h contact + 3h/3wk
    assert.equal(preview.personalCourseworkHours, 5.9)
  })

  it('leaves a course demanding nothing at its base hours for any player', () => {
    const noDemands: Syllabus = { ...cs50, demands: {} }
    const preview = previewCourse(noDemands, at({ code: -3 }))
    assert.equal(preview.open, true)
    assert.equal(preview.gaps.length, 0)
    assert.equal(preview.personalWeeklyHours, preview.baseWeeklyHours)
  })
})

describe('summarizeCart', () => {
  const levels = at({ code: 2, math: -2 })

  it('sums effort and reports the cap as a line, not a wall', () => {
    // 7 + 8 + 7 + 8 = 30, over a cap of 28 by 2 -- and still a summary, not a refusal.
    const cart = [cs50, math21b, cs50, math21b].map((c) => previewCourse(c, levels))
    const summary = summarizeCart(cart, 28)
    assert.equal(summary.effortTotal, 30)
    assert.equal(summary.over, true)
    assert.equal(summary.overBy, 2)
  })

  it('is not over at exactly the cap', () => {
    const summary = summarizeCart([previewCourse(cs50, levels)], 7)
    assert.equal(summary.over, false)
    assert.equal(summary.overBy, 0)
  })

  it('lists closed courses separately from being over the cap', () => {
    // One survivable course, one shut: under the cap, but the set still is not enrollable.
    const summary = summarizeCart([cs50, math21b].map((c) => previewCourse(c, levels)), 28)
    assert.equal(summary.over, false)
    assert.deepEqual(summary.closed, ['math21b'])
  })

  it('sums both the base and the personal weekly totals', () => {
    const summary = summarizeCart([previewCourse(cs50, levels)], 28)
    assert.equal(summary.baseWeeklyHours, 7)
    assert.equal(summary.personalWeeklyHours, 8.9)
  })

  it('is all zeroes and no complaints for an empty cart', () => {
    const summary = summarizeCart([], 28)
    assert.equal(summary.effortTotal, 0)
    assert.equal(summary.over, false)
    assert.deepEqual(summary.closed, [])
  })
})
