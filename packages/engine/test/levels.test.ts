import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bankedLevelHours, levelUpCost } from '../src/levels.ts'

describe('levelUpCost', () => {
  it('costs 100 * (x+1) at or above zero', () => {
    assert.equal(levelUpCost(0), 100)
    assert.equal(levelUpCost(1), 200)
    assert.equal(levelUpCost(2), 300)
    assert.equal(levelUpCost(3), 400)
    assert.equal(levelUpCost(4), 500)
  })

  it('costs 100 * |x| below zero', () => {
    assert.equal(levelUpCost(-1), 100)
    assert.equal(levelUpCost(-2), 200)
  })

  it('agrees at the zero boundary either way it is approached', () => {
    assert.equal(levelUpCost(-1), levelUpCost(0))
  })

  it('running 0 to 5 costs 1500 hours total', () => {
    const total = [0, 1, 2, 3, 4].reduce((sum, x) => sum + levelUpCost(x), 0)
    assert.equal(total, 1500)
  })
})

describe('bankedLevelHours', () => {
  it('banks at the 0.6 base rate for relevant study', () => {
    assert.ok(Math.abs(bankedLevelHours(10, true) - 6) < 1e-9)
  })

  it('halves again for isolated, irrelevant study', () => {
    assert.ok(Math.abs(bankedLevelHours(10, false) - 3) < 1e-9)
  })

  it('composes with a support multiplier, e.g. a tutor', () => {
    assert.ok(Math.abs(bankedLevelHours(10, true, 1.5) - 9) < 1e-9)
  })
})
