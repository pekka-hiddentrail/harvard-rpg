import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  demandGap,
  demandGapMultiplier,
  effectiveHours,
  effectiveHoursMultiplier,
  isCourseOpen,
  NOT_SURVIVABLE_GAP,
} from '../src/demands.ts'
import { zeroLevels } from '../src/schema.ts'

describe('demandGapMultiplier', () => {
  it('matches the authored table exactly, GAME_DESIGN §4.5', () => {
    assert.equal(demandGapMultiplier(-2), 0.75)
    assert.equal(demandGapMultiplier(-1), 0.85)
    assert.equal(demandGapMultiplier(0), 1.0)
    assert.equal(demandGapMultiplier(1), 1.25)
    assert.equal(demandGapMultiplier(2), 1.7)
    assert.equal(demandGapMultiplier(3), 2.4)
    assert.equal(demandGapMultiplier(4), 3.5)
  })

  it('floors at -2-or-better rather than continuing to shrink', () => {
    assert.equal(demandGapMultiplier(-5), 0.75)
  })

  it('throws past the not-survivable line rather than returning a number', () => {
    assert.throws(() => demandGapMultiplier(NOT_SURVIVABLE_GAP))
    assert.throws(() => demandGapMultiplier(9))
  })
})

describe('isCourseOpen', () => {
  it('closes the moment any one demanded tag reaches a +5 gap', () => {
    const levels = { ...zeroLevels(), math: -2 }
    assert.equal(isCourseOpen({ math: 3 }, levels), false) // gap = 5
    assert.equal(isCourseOpen({ math: 2 }, levels), true) // gap = 4, survivable
  })
})

describe('effectiveHoursMultiplier — the CS50 code/math worked example', () => {
  it('blends per-tag multipliers weighted by demand level', () => {
    // CS50: code 2, math 1. Player: code 3 (gap -1, x0.85), math 2 (gap -1, x0.85).
    const levels = { ...zeroLevels(), code: 3, math: 2 }
    const mult = effectiveHoursMultiplier({ code: 2, math: 1 }, levels)
    assert.ok(Math.abs(mult - 0.85) < 1e-9)
  })

  it('gives different answers for code2/math3 vs code3/math2 against the same course', () => {
    const demands = { code: 2, math: 1 }
    const codeHeavy = effectiveHoursMultiplier(demands, { ...zeroLevels(), code: 3, math: 2 })
    const mathHeavy = effectiveHoursMultiplier(demands, { ...zeroLevels(), code: 2, math: 3 })
    // code-heavy overachievement lands on the tag CS50 weighs more (code:2 vs math:1),
    // so it should be cheaper than overachieving on the lighter-weighted tag instead.
    assert.ok(codeHeavy < mathHeavy)
  })

  it('is 1 for a course with no demands at all', () => {
    assert.equal(effectiveHoursMultiplier({}, zeroLevels()), 1)
  })

  it('returns Infinity rather than throwing for a closed course, so a shopping-week preview looping over every candidate can still render a row for it', () => {
    const levels = { ...zeroLevels(), math: -2 }
    // gap = 3 - (-2) = 5, not survivable
    assert.equal(effectiveHoursMultiplier({ math: 3 }, levels), Infinity)
  })
})

describe('effectiveHours', () => {
  it('scales estHours by the blended multiplier', () => {
    const hours = effectiveHours(6, { code: 1 }, { ...zeroLevels(), code: -1 })
    // gap = 1 - (-1) = 2 -> x1.7
    assert.ok(Math.abs(hours - 6 * 1.7) < 1e-9)
  })

  it('stacks a missed-attendance multiplier multiplicatively, not additively', () => {
    const hours = effectiveHours(6, { code: 1 }, { ...zeroLevels(), code: -1 }, 1.4)
    assert.ok(Math.abs(hours - 6 * 1.7 * 1.4) < 1e-9)
  })

  it('defaults the attendance multiplier to 1 -- nothing missed', () => {
    const withDefault = effectiveHours(6, { code: 1 }, { ...zeroLevels(), code: -1 })
    const explicit = effectiveHours(6, { code: 1 }, { ...zeroLevels(), code: -1 }, 1)
    assert.equal(withDefault, explicit)
  })
})

describe('demandGap', () => {
  it('is course level minus player level', () => {
    assert.equal(demandGap(3, -2), 5)
    assert.equal(demandGap(1, 4), -3)
  })
})
