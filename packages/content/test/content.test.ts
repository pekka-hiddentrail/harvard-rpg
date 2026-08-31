import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { parseDate, priceTrait, validateBuild, weekdayName } from '@harvard/engine'
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

  it('links every section slot to one course by both id and code', () => {
    const courses = new Map(content.courses.map((course) => [course.id, course]))
    const keys = new Set<string>()
    for (const slot of content.slots) {
      assert.equal(courses.get(slot.id)?.courseCode, slot.courseCode)
      const key = `${slot.id}${slot.section}`
      assert.ok(!keys.has(key), `duplicate course slot identifier ${key}`)
      keys.add(key)
    }
  })

  it('gives every course office hours at one less than its normal demand', () => {
    for (const course of content.courses) {
      assert.ok(course.officeHours.length > 0, `${course.courseCode} has no office hours`)
      for (const officeHour of course.officeHours) {
        assert.equal(officeHour.demand, course.demand - 1)
      }
    }
  })

  it('sums assignment weights to 1.0, or documents why it falls short', () => {
    // A gap that isn't explained in an assignment `notes` line is an authoring slip, not a
    // real ungraded component — see GAME_DESIGN §4.1. Expos 20's ~10% shortfall is the
    // documented case (the engagement grade has no discrete assignment); anything else
    // must sum to 1 within floating-point tolerance.
    const documentedShortfall = new Set(['expos20'])
    for (const course of content.courses) {
      const total = course.assignments.reduce((sum, a) => sum + a.weight, 0)
      if (documentedShortfall.has(course.courseCode)) {
        assert.ok(total < 1, `${course.courseCode} was expected to fall short of 1.0, got ${total}`)
      } else {
        assert.ok(
          Math.abs(total - 1) < 0.001,
          `${course.courseCode} assignment weights sum to ${total}, not 1.0`,
        )
      }
    }
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

describe('the activity pack (Tier 1)', () => {
  it('loads into the index the engine resolves days against', () => {
    assert.ok(content.activities.length > 0)
    assert.equal(content.activityIndex.size, content.activities.length)
    for (const a of content.activities) assert.equal(content.activityIndex.get(a.id)?.name, a.name)
  })

  it('is inside the content hash, so a save pins the day it was played under', () => {
    // Not a formality: retuning a curve changes what every logged day meant. The hash is how
    // that announces itself instead of silently rewriting history on the next replay.
    const text = readFileSync(join(root, 'activities.yaml'), 'utf8')
    assert.ok(text.includes('curve:'), 'the file the hash covers must be the one with the curves')
  })

  it('gives study the two numbers §3.1 names', () => {
    // These two are the whole spin-up rule, and they are content rather than code — which
    // means this test is the only thing standing between a tuning pass and deleting the rule
    // by accident. A half-band banks nothing; a band and a half banks 1.7× a band.
    const study = content.activityIndex.get('study')
    assert.ok(study, 'the pack must contain `study`')
    assert.equal(study.curve[0], 0.0, 'half a band of study must bank exactly nothing')
    const band = study.curve[1] ?? 0
    const oneAndAHalf = study.curve[2] ?? 0
    assert.ok(band > 0)
    assert.equal(Math.round((oneAndAHalf / band) * 100) / 100, 1.7)
  })

  it('gives reading a half-band worth having, so a stranded half is not dead', () => {
    // The counterpart to study's zero. Without at least one activity whose `curve[0] > 0`,
    // the leftover half after a 1.5-band session would be unusable and the half grid would
    // be a tax rather than a decision.
    const read = content.activityIndex.get('read')
    assert.ok(read)
    assert.ok((read.curve[0] ?? 0) > 0)
    assert.ok(content.activities.some((a) => a.minHalves === 1 && a.curve.length > 0))
  })

  it('never lets a curve fall, so stopping early is not a strategy', () => {
    // The loader enforces this; asserted here because a falling curve is a *silent* exploit
    // — the planner would show it as a price and the player would simply take it.
    for (const a of content.activities) {
      for (let i = 1; i < a.curve.length; i++) {
        assert.ok(
          (a.curve[i] ?? 0) >= (a.curve[i - 1] ?? 0),
          `${a.id}'s curve falls at ${i + 1} halves`,
        )
      }
    }
  })

  it('anchors the meals where the band table expects them', () => {
    // The gap clock's numbers in rules.yaml were tuned against breakfast 1 → lunch 4 →
    // dinner 8. If an anchor's `allowedBands` moves off that spacing, the hunger table is
    // describing a day that no longer exists.
    for (const [id, band] of [['breakfast', 1], ['lunch', 4], ['dinner', 8]] as const) {
      const a = content.activityIndex.get(id)
      assert.ok(a, `the pack must contain \`${id}\``)
      assert.ok(a.allowedBands.includes(band), `${id} must be placeable in band ${band}`)
      assert.equal(a.food, 'meal')
    }
    const run = content.activityIndex.get('run')
    assert.ok(run && run.allowedBands.length === 1 && run.allowedBands[0] === 0)
  })

  it('lets the day be survivable: a meal, a bed, and something that banks hours', () => {
    assert.ok(content.activities.some((a) => a.food === 'meal'))
    assert.ok(content.activities.some((a) => a.sleep))
    assert.ok(content.activities.some((a) => a.curve.length > 0))
  })

  it('declares a first day that is a Monday', () => {
    // Tier 1 plays one authored day and §9.5 puts move-in on Thursday 26 August 2027, so the
    // first day of the term is the Monday after. Tier 2's calendar deletes this field.
    assert.equal(weekdayName(parseDate(content.rules.day.firstDay)), 'Monday')
  })

  it('sorts both threshold tables ascending, because resolution walks them in order', () => {
    const asc = (ns: number[]) => ns.every((n, i) => i === 0 || n >= (ns[i - 1] ?? n))
    assert.ok(asc(content.rules.day.hunger.map((h) => h.after)))
    assert.ok(asc(content.rules.day.fatigue.map((f) => f.atOrBelow)))
  })

})
