import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { STRATEGIES, bandsSpent, playDays, type BotRun } from '@harvard/engine'
import { loadContent } from '../src/index.ts'

/**
 * The balance bot, held to the claims GAME_DESIGN actually makes — against the *shipped*
 * numbers, which is why this test lives beside the content rather than in the engine.
 *
 * ARCHITECTURE §11 calls the harness "not optional and not expensive". This file is the
 * reason: several claims in the design are unfalsifiable without a headless player, and
 * finding out by hand is exactly the activity that killed the prototype. `npm run balance`
 * prints the same table for a human to read; the assertions live here so a tuning pass that
 * quietly inverts one of them cannot ship.
 *
 * Every number below is a *shipped placeholder* and is meant to move. What must not move is
 * the ordering — and orderings are what this file asserts.
 */

const here = dirname(fileURLToPath(import.meta.url))
const content = loadContent(join(here, '..', '..', '..', 'content'))

const TERM = 30
const runs = new Map<string, BotRun>(
  STRATEGIES.map((s) => [s.id, playDays(s, TERM, content.activityIndex, content.rules.day, 'math')]),
)
const got = (id: string): BotRun => {
  const r = runs.get(id)
  if (!r) throw new Error(`no strategy \`${id}\``)
  return r
}

/** Hours per band of study spent — the only fair comparison between unequal schedules. */
const perBand = (r: BotRun): number => {
  const bands = bandsSpent(r.strategy.plan('math').filter((p) => p.activity === 'study'))
  return bands === 0 ? 0 : r.totals.hours / TERM / bands
}

describe('every strategy is playable', () => {
  it('resolves thirty days without an error-severity problem', () => {
    // Nothing in this game forbids you (§3.5). A strategy the validator *refuses* is a
    // strategy the balance harness cannot price, which would make the refusal invisible.
    for (const r of runs.values()) {
      const bad = r.days.flatMap((d) => d.problems.filter((p) => p.severity === 'error'))
      assert.deepEqual(bad, [], `${r.strategy.name}: ${bad.map((b) => b.message).join(' · ')}`)
    }
  })

  it('keeps every meter inside its declared range for thirty days', () => {
    for (const r of runs.values()) {
      for (const d of r.days) {
        assert.ok(d.body.energy >= 0 && d.body.energy <= 10, `${r.strategy.name} energy ${d.body.energy}`)
        assert.ok(d.body.stress >= 0 && d.body.stress <= 100, `${r.strategy.name} stress ${d.body.stress}`)
        assert.ok(d.body.condition >= 0 && d.body.condition <= 100, `${r.strategy.name} condition ${d.body.condition}`)
        assert.ok(Number.isFinite(d.hours.total), `${r.strategy.name} banked ${d.hours.total}`)
      }
    }
  })
})

describe('continuity beats duration (§3.1)', () => {
  it('joins the routine up and banks more from identical bands', () => {
    const routine = got('routine')
    const continuous = got('continuous')
    assert.equal(
      bandsSpent(routine.strategy.plan('math')),
      bandsSpent(continuous.strategy.plan('math')),
      'the comparison is only fair if both spend the same bands',
    )
    assert.ok(
      continuous.totals.hours > routine.totals.hours,
      `long blocks (${continuous.totals.hours} h) must beat the routine (${routine.totals.hours} h)`,
    )
  })

  it('banks exactly nothing when the same bands are spent in halves', () => {
    // The strongest claim in §3.1 and the easiest one to lose to a well-meaning tuning pass
    // that gives the first half-band "a little something".
    const fragmented = got('fragmented')
    assert.equal(bandsSpent(fragmented.strategy.plan('math')), bandsSpent(got('routine').strategy.plan('math')))
    assert.equal(fragmented.totals.hours, 0)
  })
})

describe('the Night band is a loan (§8)', () => {
  it('compounds: the night owl ends the month wrecked and banking less', () => {
    const owl = got('night_owl')
    const continuous = got('continuous')
    assert.ok(owl.totals.endBody.stress > continuous.totals.endBody.stress + 40, 'stress must compound')
    assert.ok(owl.totals.endBody.energy < continuous.totals.endBody.energy, 'energy must not recover')
    // And the borrowed band does not even pay for itself: fewer hours from more bands.
    assert.ok(
      perBand(owl) < perBand(continuous),
      `the owl banks ${perBand(owl).toFixed(2)} h/band against ${perBand(continuous).toFixed(2)}`,
    )
  })
})

describe('living on snacks is possible and priced (§3.5)', () => {
  it('costs Condition rather than being forbidden', () => {
    const snacker = got('snacker')
    const continuous = got('continuous')
    assert.ok(
      snacker.totals.endBody.condition < continuous.totals.endBody.condition - 20,
      `snacking must cost Condition: ${snacker.totals.endBody.condition} vs ${continuous.totals.endBody.condition}`,
    )
    assert.ok(snacker.days.every((d) => d.meals === 0))
  })
})

describe('cutting the wakeup run is a loan against the term (r9)', () => {
  it('buys hours today and pays in Condition, and so in Stress', () => {
    const cut = got('cuts_the_run')
    const continuous = got('continuous')
    // It *should* bank more hours — that is what makes it a temptation rather than a trap.
    assert.ok(cut.totals.hours > continuous.totals.hours, 'the extra band must actually bank')
    // Condition is the stress-recovery rate, so the bill arrives as Stress a month later.
    assert.ok(cut.totals.endBody.condition < continuous.totals.endBody.condition - 20)
    assert.ok(cut.totals.endBody.stress > continuous.totals.endBody.stress)
  })
})

describe('the ceiling exists', () => {
  it('gives the grinder the most hours and no free half-bands', () => {
    const grinder = got('grinder')
    for (const r of runs.values()) {
      assert.ok(grinder.totals.hours >= r.totals.hours, `${r.strategy.name} out-banked the grinder`)
    }
  })

  it('does not let the grinder win per band spent', () => {
    // The curve is concave past two bands, which is what keeps "study everything" from being
    // the dominant strategy rather than merely the maximal one.
    assert.ok(perBand(got('grinder')) < perBand(got('continuous')) * 1.05)
  })
})

describe('KNOWN TIER 1 GAP: skipping lunch is a net win', () => {
  it('charges the stolen afternoon, and not enough to matter', () => {
    // This pair is a *pinned failure*, deliberately, and the two halves of it are different
    // claims that are easy to conflate.
    //
    // The gap clock works. Per band of study, skipping lunch is the worse deal — the stolen
    // afternoon runs at a reduced multiplier and the arithmetic shows it.
    const skips = perBand(got('skips_lunch'))
    const eats = perBand(got('continuous'))
    assert.ok(skips < eats, `the clock must make the stolen band less efficient: ${skips.toFixed(2)} vs ${eats.toFixed(2)}`)

    const afternoon = got('skips_lunch').days[0]?.placements.find((x) => x.start >= 8 && x.hours > 0)
    assert.ok(afternoon, 'the strategy should have an afternoon block')
    assert.ok(afternoon.mult < 1, `the stolen afternoon must run reduced, got ×${afternoon.mult}`)
  })

  it('still comes out ahead in total hours, which is what coursework is paid in', () => {
    // And here is the gap. An inefficient band is still a band: over a month, skipping lunch
    // banks materially more hours than eating it, and hours are what the demand gap will be
    // settled in. So at Tier 1 the mechanic prices the meal correctly and the player should
    // still skip it.
    //
    // §3.5's real argument against skipping is social, not caloric: lunch is where the next
    // day's arrangements get made and a joint session is worth 1.5×. Neither the NPCs nor
    // the arrangements exist until Tier 3. Adding a fudge factor now would tune a mechanic
    // to compensate for content that has not been written, and the bot would then be
    // validating a lie — so the number stays honest and the gap stays visible.
    //
    // When Tier 3 lands, this assertion must be INVERTED, not deleted.
    const skipped = got('skips_lunch').totals.hours
    const ate = got('continuous').totals.hours
    assert.ok(
      skipped > ate * 1.1,
      `if Tier 3 has flipped this, invert the test: ${skipped} h vs ${ate} h`,
    )
    assert.ok(got('skips_lunch').days.every((d) => d.meals === 2))
  })
})

describe('KNOWN TIER 1 GAP: Stress has no source', () => {
  it('sits near zero for every well-behaved strategy, because nothing accrues it yet', () => {
    // §8 accrues Stress from deadlines, conflict and broken promises. None of those exist
    // before Tier 2's calendar, so the well-behaved strategies simply have nothing to be
    // stressed by and sleep pins the meter at 0. The recovery rate is therefore *untuned* —
    // retune `sleepStressPerBand` against the bot once there is something to recover from,
    // not before, or it will be fitted to an empty world.
    for (const id of ['routine', 'continuous', 'grinder']) {
      assert.ok(got(id).totals.endBody.stress < 10, `${id} ended at stress ${got(id).totals.endBody.stress}`)
    }
    // The two strategies that abuse the body are the only ones the meter can currently see.
    assert.ok(got('night_owl').totals.endBody.stress > 50)
  })
})
