import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { priceTrait, validateBuild } from '@harvard/engine'
import { loadContent } from '../src/index.ts'

/**
 * These tests read the real content files. They are the ones that break when a trait is
 * mispriced or a preset drifts — which is the point: content is authored, and authoring is
 * where the mistakes are (§4.9).
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..', 'content')
const content = loadContent(root)

describe('the content loads', () => {
  it('puts core first and has the seven tags', () => {
    assert.equal(content.packs[0]?.id, 'core')
    assert.equal(content.rules.subjectTags.length, 7)
  })

  it('hashes stably', () => {
    assert.equal(content.hash.length, 16)
    // The hash is what a save pins itself to, so two loads of the same tree must agree —
    // including across a checkout with different line endings.
    assert.equal(loadContent(root).hash, content.hash)
  })
})

describe('every preset is a legal build', () => {
  for (const preset of content.presets) {
    it(`${preset.id} spends the budget exactly`, () => {
      const { id: _id, name: _name, ...build } = preset
      const result = validateBuild(build, content.index, content.rules)
      assert.ok(result.ok, result.ok ? '' : result.problems.map((p) => p.message).join('\n'))
      assert.equal(result.spent - result.refunded, content.rules.creation.budget)
      assert.ok(result.refunded <= content.rules.creation.refundCap)
    })
  }

  it('ships Pekka, since he is the reason any of this exists', () => {
    const pekka = content.presets.find((p) => p.id === 'pekka')
    assert.ok(pekka, 'content/presets/pekka.yaml is missing')
    const { id: _id, name: _name, ...build } = pekka
    const result = validateBuild(build, content.index, content.rules)
    assert.ok(result.ok)
    // He came out of Finland with real mathematics behind him and no gift for group work.
    assert.ok(result.levels.math > 0)
    assert.ok(result.levels.discussion < 0)
    assert.deepEqual(result.languages, ['Swedish'])
  })
})

describe('authored costs match the schedule', () => {
  const tolerance = content.rules.creation.priceTolerance

  it('within the stated tolerance, for every priceable trait', () => {
    const offences: string[] = []
    for (const trait of content.traits) {
      const priced = priceTrait(trait, content.rules)
      if (priced.points === null) continue
      const drift = Math.abs(priced.points - trait.cost)
      if (drift > tolerance) {
        offences.push(
          `${trait.id}: authored ${trait.cost}, schedule says ${priced.points} (off by ${drift})`,
        )
      }
    }
    assert.deepEqual(offences, [], `\n${offences.join('\n')}\n`)
  })

  it('leans on the tolerance rather than pretending it is unused', () => {
    // `long mathematics` is authored at −3 and prices at 3 × 1.3 = 3.9 → 4. The tolerance is
    // load-bearing, and it should be visible that it is: the alternative is a schedule that
    // dictates content, which §7.8 explicitly rejected. It validates, it does not generate.
    const t = content.index.get('long_mathematics')
    assert.ok(t)
    const priced = priceTrait(t, content.rules)
    assert.equal(t.cost, -3)
    assert.equal(priced.points, -4)
    assert.equal(Math.abs(priced.points! - t.cost), tolerance)
  })

  it('prices the headline hindrance exactly', () => {
    const t = content.index.get('bad_with_numbers')
    assert.ok(t)
    assert.equal(priceTrait(t, content.rules).points, t.cost)
  })

  it('makes every structural trait say why it is exempt', () => {
    for (const t of content.traits) {
      if (!t.structural) continue
      assert.ok(t.why && t.why.length > 0, `${t.id} is structural without a \`why\``)
    }
  })
})

describe('the trait graph is sound', () => {
  it('gives international student a mandatory child, and no default', () => {
    const t = content.index.get('international_student')
    assert.ok(t)
    assert.ok(t.requiresOneOf.length >= 2)
    // Anglophone is the one that costs nothing to be — arriving from Toronto is not the same
    // handicap as arriving from Helsinki, and the schedule says so out loud.
    const anglophone = content.index.get('anglophone')
    assert.ok(anglophone && anglophone.cost > 0)
  })

  it('never lets a trait exclude something it also requires', () => {
    for (const t of content.traits) {
      for (const id of [...t.requiresAnyOf, ...t.requiresOneOf]) {
        assert.ok(
          !t.excludes.includes(id),
          `${t.id} both requires and excludes ${id} — unbuildable`,
        )
      }
    }
  })

  it('keeps the two tag namespaces apart', () => {
    // The loader throws on overlap; this asserts the pool it was checking is not empty,
    // so the check cannot pass by having nothing to check.
    const kinds = new Set(content.traits.flatMap((t) => t.kinds))
    assert.ok(kinds.size > 0)
    for (const tag of content.rules.subjectTags) assert.ok(!kinds.has(tag))
  })
})
