import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyBumps,
  bandFor,
  courseGradePercentage,
  drawCards,
  isDrawTriggered,
  leanFor,
  letterFor,
  psetGradePercentage,
  scorePercentage,
} from '../src/grading.ts'
import { zeroLevels } from '../src/schema.ts'

describe('bandFor', () => {
  const brackets = { moderate: 63, narrow: 101 }
  it('narrow at or above the narrow threshold', () => {
    assert.equal(bandFor(101, brackets), 'narrow')
    assert.equal(bandFor(150, brackets), 'narrow')
  })
  it('moderate between the two thresholds', () => {
    assert.equal(bandFor(63, brackets), 'moderate')
    assert.equal(bandFor(100, brackets), 'moderate')
  })
  it('wide below the moderate threshold', () => {
    assert.equal(bandFor(0, brackets), 'wide')
    assert.equal(bandFor(62, brackets), 'wide')
  })
})

describe('drawCards', () => {
  it('is deterministic from (saveSeed, assessmentId)', () => {
    const a = drawCards('seed-1', 'cs50.final_project', 'moderate', 12)
    const b = drawCards('seed-1', 'cs50.final_project', 'moderate', 12)
    assert.deepEqual(a, b)
  })

  it('a different assessment id draws differently', () => {
    const a = drawCards('seed-1', 'cs50.ps0', 'moderate', 12)
    const b = drawCards('seed-1', 'cs50.final_project', 'moderate', 12)
    assert.notDeepEqual(a, b)
  })

  it('stays within the band range', () => {
    for (const [band, range] of [['narrow', 1], ['moderate', 2], ['wide', 4]] as const) {
      const cards = drawCards('seed-1', 'x', band, 500)
      assert.ok(cards.every((c) => c >= -range && c <= range))
      // with 500 draws, every value in range should show up at least once
      for (let v = -range; v <= range; v++) assert.ok(cards.includes(v), `missing ${v} in ${band}`)
    }
  })
})

describe('scorePercentage', () => {
  it('all zeros is 100%', () => {
    assert.equal(scorePercentage([0, 0, 0, 0]), 100)
  })
  it('matches the expected value for each band, roughly', () => {
    // narrow: (1 + 0.75*2)/3 = 0.8333 -> 83
    assert.equal(scorePercentage([-1, 0, 1]), 83)
    // moderate: (1+1.5+1.0)/5 = 0.70 -> 70
    assert.equal(scorePercentage([-2, -1, 0, 1, 2]), 70)
    // wide: (1+1.5+1.0+0+0)/9 = 0.3889 -> 39
    assert.equal(scorePercentage([-4, -3, -2, -1, 0, 1, 2, 3, 4]), 39)
  })
  it('is 0 for an empty draw rather than NaN', () => {
    assert.equal(scorePercentage([]), 0)
  })
})

describe('applyBumps', () => {
  it('bumps magnitude-3-or-less cards before touching a 4, largest magnitude first', () => {
    const cards = [4, 3, -2, 1]
    // First bump should hit the 3 (biggest immediate point gain), not the 4.
    const afterOne = applyBumps(cards, 2)
    assert.deepEqual(afterOne, [4, 2, -2, 1])
  })

  it('bumps a 4 only once no magnitude-3-or-less card is competing for the same hours', () => {
    // Alongside a 1 (immediately productive), the 4 waits its turn.
    assert.deepEqual(applyBumps([4, 1], 2), [4, 0])
    // On its own, with nothing else to spend on, it's the only option and does move.
    assert.deepEqual(applyBumps([4], 2), [3])
  })

  it('never goes past zero, and stops spending hours once everything is zero', () => {
    const cards = [1, -1]
    assert.deepEqual(applyBumps(cards, 100), [0, 0])
  })

  it('2 hours per bump, rounding down leftover hours', () => {
    const cards = [2]
    assert.deepEqual(applyBumps(cards, 3), [1]) // 3h -> 1 bump, 1h wasted
    assert.deepEqual(applyBumps(cards, 4), [0]) // 4h -> 2 bumps
  })
})

describe('isDrawTriggered', () => {
  it('fires at 48 hours out, and never earlier -- a practice exam is just a high-multiplier study session, not a trigger', () => {
    assert.equal(isDrawTriggered(48), true)
    assert.equal(isDrawTriggered(49), false)
    assert.equal(isDrawTriggered(400), false)
  })
})

describe('psetGradePercentage', () => {
  it('full credit at or above the effective hour cost', () => {
    assert.equal(psetGradePercentage(6, 6, false), 100)
    assert.equal(psetGradePercentage(9, 6, false), 100) // extra hours don't overshoot 100
  })
  it('partial credit below it', () => {
    assert.equal(psetGradePercentage(3, 6, false), 50)
  })
  it('copied work flatlines at a C (67), regardless of hours', () => {
    assert.equal(psetGradePercentage(6, 6, true), 67)
    assert.equal(psetGradePercentage(0, 6, true), 67)
  })
})

describe('courseGradePercentage', () => {
  it('is the weighted average of every graded item, on one scale', () => {
    // 5 psets at 10% each + a final project at 50%
    const items = [
      { percentage: 87, weight: 0.1 },
      { percentage: 67, weight: 0.1 },
      { percentage: 99, weight: 0.1 },
      { percentage: 83, weight: 0.1 },
      { percentage: 38, weight: 0.1 },
      { percentage: 88, weight: 0.5 },
    ]
    assert.equal(courseGradePercentage(items), 81.4)
  })
  it('is 0 for no graded items rather than NaN', () => {
    assert.equal(courseGradePercentage([]), 0)
  })
})

describe('letterFor', () => {
  it('matches the evenly-spaced table', () => {
    assert.equal(letterFor(100), 'A')
    assert.equal(letterFor(95), 'A')
    assert.equal(letterFor(94), 'A-')
    assert.equal(letterFor(50), 'D')
    assert.equal(letterFor(49), 'F')
    assert.equal(letterFor(0), 'F')
  })
})

describe('leanFor', () => {
  it('leans top when the player is ahead of the demand', () => {
    const levels = { ...zeroLevels(), code: 4 }
    assert.equal(leanFor({ code: 2 }, levels), 'top') // gap = 2-4 = -2
  })
  it('leans bottom when behind', () => {
    const levels = { ...zeroLevels(), code: -2 }
    assert.equal(leanFor({ code: 2 }, levels), 'bottom') // gap = 2-(-2) = 4
  })
  it('is even right at the demand level', () => {
    assert.equal(leanFor({ code: 2 }, { ...zeroLevels(), code: 2 }), 'even')
  })
})
