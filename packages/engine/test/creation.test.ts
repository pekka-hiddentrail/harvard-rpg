import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CourseHint,
  RequirementGroup,
  Rules,
  Track,
  Trait,
  indexTraits,
  priceTrait,
  resolveLevels,
  shapeOf,
  validateBuild,
  zeroLevels,
  type Trait as TraitT,
} from '../src/index.ts'

/**
 * Unit tests for creation. Deliberately built from hand-written traits rather than the real
 * content files — those are exercised in `packages/content/test`, and mixing the two here
 * would mean a balance tweak breaks a rules test.
 */

const rules = Rules.parse({
  creation: { budget: 10, refundCap: 5, priceTolerance: 1 },
  // Present because `Rules` requires it, and irrelevant to everything below: creation and
  // the day share a rules file but not a single number. `day.test.ts` owns these.
  day: {
    firstDay: '2027-08-30',
    startEnergy: 8,
    startStress: 30,
    startCondition: 55,
    startBandsSinceFood: 2,
    snackDefersBands: 2,
    hunger: [{ after: 5, yieldMult: 0.85, energy: -0.5 }],
    fatigue: [{ atOrBelow: 3, yieldMult: 0.7 }],
    night: { energyPerBand: -2, stressPerBand: 6 },
    sleepEnergyPerBand: 7,
    sleepStressPerBand: 5,
    conditionDailyDrift: -0.8,
  },
  subjectTags: [
    'math', 'stats', 'code', 'writing', 'reading', 'lab', 'discussion',
    'proof', 'visual', 'language', 'fieldwork', 'memorization', 'ethics',
  ],
  schedule: {
    buy: [
      { primary: 1, secondary: 0, points: 1 },
      { primary: 1, secondary: 1, points: 2 },
      { primary: 2, secondary: 1, points: 3 },
    ],
    refund: [
      { primary: 1, secondary: 0, points: 1 },
      { primary: 2, secondary: 1, points: 2 },
    ],
    maxRefundPerTrait: 2,
  },
  // Mirrors content/rules.yaml, including the six tags added by the 7 -> 13 widening. The
  // record is partial, so a missing weight would silently price at 1.0 rather than fail —
  // which is exactly why the fixture carries them all.
  tagWeights: {
    math: 1.3,
    writing: 1.2,
    language: 1.1,
    stats: 1.0,
    code: 1.0,
    proof: 1.0,
    reading: 0.9,
    ethics: 0.9,
    memorization: 0.9,
    discussion: 0.8,
    lab: 0.8,
    visual: 0.7,
    fieldwork: 0.7,
  },
  academics: { semesterEffortCap: 28 },
})

const trait = (over: Partial<TraitT> & { id: string; cost: number }): TraitT =>
  Trait.parse({ name: over.id, ...over })

const pack = (...traits: TraitT[]) => indexTraits(traits)

const base = {
  hometown: 'Espoo, Finland',
  schoolType: 'finnish upper secondary',
  program: 'degree' as const,
}

describe('track course hints', () => {
  it('accepts requirement groups and course lead-in hints for a track', () => {
    const track = Track.parse({
      id: 'cs_mbb',
      name: 'Computer Science — MBB',
      field: 'cs',
      honorsEligible: true,
      thesisRequired: true,
      declareBy: { year: 2, term: 'fall' },
      requirements: [
        RequirementGroup.parse({
          id: 'linear-algebra',
          label: 'Linear algebra',
          kind: 'set',
          need: 1,
          from: ['math21b', 'math22a', 'math23a'],
        }),
      ],
      courseHints: [
        CourseHint.parse({
          id: 'math21b',
          likelyTracks: ['cs_mbb', 'cs_basic'],
          countsToward: ['linear-algebra', 'cs-core'],
          leadsTo: ['cs_mbb'],
          notes: ['default linear algebra route for CS-MBB'],
        }),
      ],
    })

    assert.equal(track.id, 'cs_mbb')
    assert.equal(track.courseHints[0]?.likelyTracks[0], 'cs_mbb')
    assert.equal(track.courseHints[0]?.countsToward[0], 'linear-algebra')
  })
})

describe('shapeOf', () => {
  it('sorts by magnitude and names the primary tag', () => {
    const s = shapeOf(trait({ id: 'a', cost: -3, affects: { stats: 1, math: 2 } }))
    assert.deepEqual(
      { primary: s.primary, secondary: s.secondary, primaryTag: s.primaryTag, direction: s.direction },
      { primary: 2, secondary: 1, primaryTag: 'math', direction: 'buy' },
    )
  })

  it('refuses to shape a trait that pushes both ways', () => {
    // "a trait that both hurts and helps the curriculum is two traits" (§7.8)
    const s = shapeOf(trait({ id: 'a', cost: -1, affects: { math: 2, writing: -1 } }))
    assert.equal(s.direction, 'none')
  })

  it('reports no direction when nothing moves', () => {
    assert.equal(shapeOf(trait({ id: 'a', cost: -4 })).direction, 'none')
  })
})

describe('priceTrait', () => {
  it('rounds costs up and refunds down', () => {
    // buy 2/1 on math: 3 × 1.3 = 3.9 → 4 charged
    const buy = priceTrait(trait({ id: 'a', cost: -4, affects: { math: 2, stats: 1 } }), rules)
    assert.equal(buy.points, -4)
    // refund 2/1 on math: 2 × 1.3 = 2.6 → 2 paid out, not 3
    const refund = priceTrait(trait({ id: 'b', cost: 2, affects: { math: -2, stats: -1 } }), rules)
    assert.equal(refund.points, 2)
  })

  it('declines to price structural traits, and says so', () => {
    const p = priceTrait(
      trait({ id: 'a', cost: -4, structural: true, why: 'moves plan adherence, not a level' }),
      rules,
    )
    assert.equal(p.points, null)
    assert.match('reason' in p ? p.reason : '', /structural/)
  })

  it('declines shapes that are not on the schedule', () => {
    const p = priceTrait(trait({ id: 'a', cost: -6, affects: { math: 3, stats: 2 } }), rules)
    assert.equal(p.points, null)
  })
})

describe('the schedule itself', () => {
  const perLevel = (r: { primary: number; secondary: number; points: number }) =>
    r.points / (r.primary + r.secondary)

  it('never sells a +3 primary', () => {
    // r11: three levels in one subject is not purchasable at creation, at any price.
    assert.equal(Math.max(...rules.schedule.buy.map((r) => r.primary)), 2)
  })

  it('pays a concave refund — the second level of damage is worth less', () => {
    // A rising rate would be a points farm: take the worst hindrance, buy two goods.
    const rates = [...rules.schedule.refund]
      .sort((a, b) => a.primary + a.secondary - (b.primary + b.secondary))
      .map(perLevel)
    for (let i = 1; i < rates.length; i++) assert.ok(rates[i]! < rates[i - 1]!)
  })

  it('charges a non-decreasing rate for buying', () => {
    const rates = [...rules.schedule.buy]
      .sort((a, b) => a.primary + a.secondary - (b.primary + b.secondary))
      .map(perLevel)
    for (let i = 1; i < rates.length; i++) assert.ok(rates[i]! >= rates[i - 1]!)
  })

  it('caps what one trait may refund', () => {
    assert.ok(
      rules.schedule.refund.every((r) => r.points <= rules.schedule.maxRefundPerTrait),
      'a refund row exceeds maxRefundPerTrait',
    )
  })
})

describe('validateBuild', () => {
  const index = pack(
    trait({ id: 'spend10', name: 'a ten-point habit', cost: -10 }),
    trait({ id: 'spend8', name: 'an eight-point habit', cost: -8 }),
    trait({ id: 'spend13', name: 'a thirteen-point habit', cost: -13 }),
    trait({ id: 'spend14', name: 'a fourteen-point habit', cost: -14 }),
    trait({ id: 'spend16', name: 'a sixteen-point habit', cost: -16 }),
    trait({ id: 'refund2', name: 'bad with numbers', cost: 2, affects: { math: -2, stats: -1 } }),
    trait({ id: 'refund3', name: 'international student', cost: 3, requiresOneOf: ['kidA', 'kidB'] }),
    trait({ id: 'refund6', name: 'a six-point ruin', cost: 6 }),
    trait({ id: 'kidA', name: 'Nordic', cost: -3, grantsLanguageFrom: ['Finnish', 'Swedish'] }),
    trait({ id: 'kidB', name: 'Anglophone', cost: 1 }),
    trait({ id: 'townie', name: 'hometown US', cost: -1, excludes: ['refund3'] }),
    trait({ id: 'olympiad', name: 'olympiad', cost: -4, requiresAnyOf: ['spend8', 'spend10'] }),
  )
  const ok = (r: ReturnType<typeof validateBuild>) => {
    assert.ok(r.ok, r.ok ? '' : r.problems.map((p) => p.message).join('; '))
    return r
  }
  const codes = (r: ReturnType<typeof validateBuild>) =>
    r.ok ? [] : r.problems.map((p) => p.code)

  it('accepts a build that spends the budget exactly', () => {
    const r = ok(validateBuild({ ...base, traits: [{ id: 'spend10' }] }, index, rules))
    assert.equal(r.spent, 10)
    assert.equal(r.refunded, 0)
  })

  it('requires the budget be spent exactly, not merely respected', () => {
    assert.deepEqual(
      codes(validateBuild({ ...base, traits: [{ id: 'spend8' }] }, index, rules)),
      ['budget'],
    )
    assert.deepEqual(
      codes(validateBuild({ ...base, traits: [{ id: 'spend13' }] }, index, rules)),
      ['budget'],
    )
  })

  it('reports spent, refunded and levels even while the budget is unbalanced', () => {
    // A live-editing screen needs real numbers on every choice, not only once the build
    // finally balances — otherwise the readout sits at zero for most of the session.
    const r = validateBuild({ ...base, traits: [{ id: 'refund2' }] }, index, rules)
    assert.equal(r.ok, false)
    assert.equal(r.spent, 0)
    assert.equal(r.refunded, 2)
    assert.equal(r.levels.math, -2)
  })

  it('nets refunds against spend', () => {
    // 14 spent, 3 + 1 refunded → net 10.
    const r = ok(
      validateBuild(
        { ...base, traits: [{ id: 'spend14' }, { id: 'refund3' }, { id: 'kidB' }] },
        index,
        rules,
      ),
    )
    assert.equal(r.spent, 14)
    assert.equal(r.refunded, 4)
    assert.equal(r.spent - r.refunded, rules.creation.budget)
  })

  it('enforces the refund cap on the total, not the count', () => {
    assert.ok(codes(validateBuild({ ...base, traits: [{ id: 'spend16' }, { id: 'refund6' }] }, index, rules)).includes('refund_cap'))
  })

  it('rejects an unknown trait before doing arithmetic on it', () => {
    assert.deepEqual(codes(validateBuild({ ...base, traits: [{ id: 'nope' }] }, index, rules)), [
      'unknown_trait',
    ])
  })

  it('rejects the same trait twice', () => {
    assert.deepEqual(
      codes(validateBuild({ ...base, traits: [{ id: 'spend10' }, { id: 'spend10' }] }, index, rules)),
      ['duplicate_trait'],
    )
  })

  it('honours exclusions in either order', () => {
    const a = codes(
      validateBuild(
        { ...base, traits: [{ id: 'townie' }, { id: 'refund3' }, { id: 'kidB' }, { id: 'spend13' }] },
        index,
        rules,
      ),
    )
    const b = codes(
      validateBuild(
        { ...base, traits: [{ id: 'refund3' }, { id: 'townie' }, { id: 'kidB' }, { id: 'spend13' }] },
        index,
        rules,
      ),
    )
    assert.ok(a.includes('excluded'))
    assert.deepEqual(a, b, 'exclusion must be order-independent')
  })

  it('demands exactly one mandatory child — not zero', () => {
    assert.ok(
      codes(validateBuild({ ...base, traits: [{ id: 'spend13' }, { id: 'refund3' }], }, index, rules)).includes(
        'requires_one',
      ),
    )
  })

  it('demands exactly one mandatory child — not two', () => {
    const c = codes(
      validateBuild(
        {
          ...base,
          traits: [
            { id: 'refund3' },
            { id: 'kidA', language: 'Swedish' },
            { id: 'kidB' },
            { id: 'spend10' },
          ],
        },
        index,
        rules,
      ),
    )
    assert.ok(c.includes('requires_one'))
  })

  it('accepts the parent once its child is chosen', () => {
    const r = ok(
      validateBuild(
        { ...base, traits: [{ id: 'refund3' }, { id: 'kidA', language: 'Finnish' }, { id: 'spend10' }] },
        index,
        rules,
      ),
    )
    assert.deepEqual(r.languages, ['Finnish'])
  })

  it('checks requiresAnyOf', () => {
    // 4 + 10 spent, 3 + 1 refunded → net 10, and the prerequisite is present.
    ok(
      validateBuild(
        {
          ...base,
          traits: [{ id: 'olympiad' }, { id: 'spend10' }, { id: 'refund3' }, { id: 'kidB' }],
        },
        index,
        rules,
      ),
    )
    assert.ok(
      codes(validateBuild({ ...base, traits: [{ id: 'olympiad' }, { id: 'refund6' }] }, index, rules)).includes(
        'requires_any',
      ),
    )
  })

  it('insists a language-granting trait has a valid language', () => {
    const unchosen = codes(
      validateBuild({ ...base, traits: [{ id: 'refund3' }, { id: 'kidA' }, { id: 'spend10' }] }, index, rules),
    )
    assert.ok(unchosen.includes('language_unchosen'))
    const wrong = codes(
      validateBuild(
        { ...base, traits: [{ id: 'refund3' }, { id: 'kidA', language: 'Klingon' }, { id: 'spend10' }] },
        index,
        rules,
      ),
    )
    assert.ok(wrong.includes('language_invalid'))
    const unexpected = codes(
      validateBuild({ ...base, traits: [{ id: 'spend10', language: 'Finnish' }] }, index, rules),
    )
    assert.ok(unexpected.includes('language_unexpected'))
  })
})

describe('resolveLevels', () => {
  it('folds affects across the picks and leaves untouched tags at zero', () => {
    const index = pack(
      trait({ id: 'maths', cost: -4, affects: { math: 2, stats: 1 } }),
      trait({ id: 'numb', cost: 2, affects: { math: -2, stats: -1 } }),
      trait({ id: 'essays', cost: -3, affects: { writing: 1, reading: 1 } }),
    )
    assert.deepEqual(resolveLevels([{ id: 'maths' }, { id: 'essays' }], index), {
      ...zeroLevels(),
      math: 2,
      stats: 1,
      writing: 1,
      reading: 1,
    })
    // A build that buys and then sells the same thing nets to nothing. Legal, and pointless
    // — the budget check is what makes it pointless, not a special rule.
    assert.deepEqual(resolveLevels([{ id: 'maths' }, { id: 'numb' }], index), zeroLevels())
  })
})
