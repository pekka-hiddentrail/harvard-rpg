import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  Activity,
  BANDS,
  DayRules,
  HALF_COUNT,
  NIGHT_BAND,
  bandOf,
  enrolledIn,
  firstHalfOf,
  hasErrors,
  indexActivities,
  logLine,
  nextMorning,
  replay,
  resolveDay,
  startingBody,
  validatePlan,
  type Action,
  type Body,
  type DayProblem,
  type Placement,
} from '@harvard/engine'

/**
 * The day, tested against the two claims §3 makes and nothing else.
 *
 * The fixtures below are deliberately *not* the shipped content. The shipped numbers are
 * difficulty levers and are meant to move; these are the mechanics, which are not. Where a
 * shipped number carries a design claim — the study curve's `0.0` and its 1.7× — the
 * assertion lives in `packages/content/test/content.test.ts`, next to the file it is about.
 */

const act = (over: Record<string, unknown>) =>
  Activity.parse({
    id: 'x',
    name: 'X',
    kind: 'other',
    minHalves: 1,
    maxHalves: 4,
    ...over,
  })

const FIXTURES = [
  act({
    id: 'study',
    name: 'Study',
    kind: 'study',
    targets: 'subject',
    minHalves: 1,
    maxHalves: 6,
    // The same shape as the shipped curve: nothing in a half-band, 1.7× at 1.5 bands.
    curve: [0.0, 1.0, 1.7, 2.3, 2.8, 3.2],
    perBand: { energy: -1, stress: 2 },
  }),
  act({
    id: 'read',
    name: 'Reading',
    kind: 'study',
    targets: 'subject',
    minHalves: 1,
    maxHalves: 4,
    curve: [0.4, 0.8, 1.2, 1.5],
  }),
  act({ id: 'meal', name: 'Meal', kind: 'meal', minHalves: 2, maxHalves: 2, food: 'meal' }),
  act({ id: 'bite', name: 'Snack', kind: 'snack', minHalves: 1, maxHalves: 1, food: 'snack' }),
  act({ id: 'bed', name: 'Sleep', kind: 'sleep', minHalves: 2, maxHalves: 4, sleep: true, allowedBands: [9, 10] }),
  act({ id: 'drill', name: 'Drill', kind: 'exercise', minHalves: 2, maxHalves: 2, fixed: true, allowedBands: [0], perBand: { condition: 4 } }),
  act({ id: 'idle', name: 'Idle', kind: 'other' }),
]

const ACTS = indexActivities(FIXTURES)

/** Flat, generous rules: nothing is scarce unless a test makes it scarce. */
const RULES = DayRules.parse({
  firstDay: '2027-08-30',
  startEnergy: 10,
  startStress: 40,
  startCondition: 50,
  startBandsSinceFood: 0,
  snackDefersBands: 2,
  hunger: [
    { after: 4, yieldMult: 0.5, energy: -1 },
    { after: 8, yieldMult: 0.25, energy: -2 },
  ],
  fatigue: [{ atOrBelow: 2, yieldMult: 0.5 }],
  night: { energyPerBand: -2, stressPerBand: 6 },
  sleepEnergyPerBand: 7,
  sleepStressPerBand: 5,
  conditionDailyDrift: -1,
})

const p = (start: number, halves: number, activity: string, target?: string): Placement => ({
  start,
  halves,
  activity,
  withPeople: [],
  ...(target === undefined ? {} : { target }),
})

const run = (placements: Placement[], rules = RULES, body?: Body) =>
  resolveDay({ date: '2027-08-30', placements }, ACTS, rules, body ?? startingBody(rules))

const codes = (problems: readonly DayProblem[]) => problems.map((x) => x.code).sort()

// ── the spin-up rule ─────────────────────────────────────────────────────────────────

describe('continuity beats duration', () => {
  it('banks nothing for half a band of study', () => {
    // §3.1's harder constraint. A linear `max(0, d - spinUp) × rate` cannot satisfy both
    // this and the 1.7× below, which is why the curve is authored rather than computed.
    const r = run([p(4, 1, 'study', 'math')])
    assert.equal(r.placements[0]?.hours, 0)
    assert.equal(r.hours.total, 0)
  })

  it('pays 1.7× a band for one and a half bands', () => {
    const one = run([p(4, 2, 'study', 'math')]).hours.total
    const oneAndAHalf = run([p(4, 3, 'study', 'math')]).hours.total
    assert.equal(one, 1.0)
    assert.equal(oneAndAHalf, 1.7)
    assert.equal(Math.round((oneAndAHalf / one) * 100) / 100, 1.7)
  })

  it('beats the same time fragmented', () => {
    // Three halves, three arrangements. This is the whole design claim: the arrangement is
    // the decision, and the total time spent is not the interesting number.
    const together = run([p(firstHalfOf(2), 3, 'study', 'math')]).hours.total
    const split = run([p(firstHalfOf(2), 2, 'study', 'math'), p(firstHalfOf(5), 1, 'study', 'math')])
      .hours.total
    const scattered = run(
      [2, 3, 5].map((b) => p(firstHalfOf(b), 1, 'study', 'math')),
    ).hours.total

    assert.equal(scattered, 0, 'three separate halves must bank exactly nothing')
    assert.equal(together, 1.7)
    assert.equal(split, 1.0, 'the stranded half banks nothing on its own')
    assert.ok(together > split && split > scattered)
  })

  it('tapers long blocks, so a whole day on one subject is not the answer', () => {
    // The curve is concave past a band, which means the *marginal* half is worth less the
    // longer you have been at it. Worth stating out loud: it is why "every free band on
    // study" is a strategy with a ceiling rather than a dominant one, and why the balance
    // bot's grinder does not simply win. Per-band yield peaks around two bands.
    const perBand = [2, 4, 6].map(
      (halves) => run([p(firstHalfOf(2), halves, 'study', 'math')]).hours.total / (halves / 2),
    )
    assert.ok(perBand[1]! > perBand[0]!, 'a band and a half must beat a single band per band')
    assert.ok(perBand[2]! < perBand[1]!, 'three bands must not beat two per band')
  })

  it('lets reading use a leftover half at full rate', () => {
    // The other half of the rule: `curve[0] > 0` is how an activity says "no spin-up".
    assert.equal(run([p(4, 1, 'read', 'reading')]).hours.total, 0.4)
  })

  it('banks hours against the subject it was aimed at', () => {
    // Both blocks sit before the gap clock starts charging, so the only thing under test is
    // the bookkeeping: two subjects, two ledgers, and the five untouched ones still at zero.
    const r = run([p(firstHalfOf(0), 4, 'study', 'math'), p(firstHalfOf(2), 4, 'study', 'code')])
    assert.equal(r.hours.bySubject.math, 2.3)
    assert.equal(r.hours.bySubject.code, 2.3)
    assert.equal(r.hours.bySubject.writing, 0)
    assert.equal(r.hours.total, 4.6)
  })
})

// ── validation ───────────────────────────────────────────────────────────────────────

describe('validatePlan', () => {
  const only = (placements: Placement[]) => codes(validatePlan(placements, ACTS))

  it('accepts a plausible day with notes but no errors', () => {
    const day = [
      p(firstHalfOf(0), 2, 'drill'),
      p(firstHalfOf(1), 2, 'meal'),
      p(firstHalfOf(2), 4, 'study', 'math'),
      p(firstHalfOf(4), 2, 'meal'),
      p(firstHalfOf(9), 4, 'bed'),
    ]
    assert.equal(hasErrors(validatePlan(day, ACTS)), false)
  })

  it('names an activity that does not exist', () => {
    assert.deepEqual(only([p(4, 2, 'quidditch')]), ['no_meal', 'no_sleep', 'unknown_activity'])
  })

  it('refuses a day that runs off the end', () => {
    assert.ok(only([p(HALF_COUNT - 1, 4, 'idle')]).includes('overruns_day'))
  })

  it('refuses an overlap', () => {
    assert.ok(only([p(4, 4, 'idle'), p(5, 2, 'study', 'math')]).includes('overlap'))
  })

  it('allows two placements that merely touch', () => {
    assert.equal(only([p(4, 2, 'idle'), p(6, 2, 'idle')]).includes('overlap'), false)
  })

  it('holds the duration bounds, including fixed length', () => {
    assert.ok(only([p(4, 1, 'meal')]).includes('too_short'))
    assert.ok(only([p(4, 8, 'study', 'math')]).includes('too_long'))
    assert.ok(only([p(0, 1, 'drill')]).includes('fixed_length'))
  })

  it('keeps an anchored activity in its bands', () => {
    assert.ok(only([p(firstHalfOf(5), 2, 'drill')]).includes('wrong_band'))
    assert.equal(only([p(firstHalfOf(0), 2, 'drill')]).includes('wrong_band'), false)
  })

  it('demands a target for what targets, and refuses one for what does not', () => {
    assert.ok(only([p(4, 2, 'study')]).includes('no_target'))
    assert.ok(only([p(4, 2, 'study', 'basketry')]).includes('bad_target'))
    assert.ok(only([p(4, 2, 'idle', 'math')]).includes('unwanted_target'))
  })

  it('refuses anything after you went to bed', () => {
    const late = [p(firstHalfOf(9), 2, 'bed'), p(firstHalfOf(10), 2, 'study', 'math')]
    assert.ok(only(late).includes('after_sleep'))
  })

  it('notes rather than forbids: a half-band of study, no meal, no sleep', () => {
    // Nothing in this game forbids you. The distinction is the design: a `note` teaches the
    // rule by letting you break it, an `error` hides the rule behind a wall.
    const problems = validatePlan([p(4, 1, 'study', 'math')], ACTS)
    assert.equal(hasErrors(problems), false)
    assert.deepEqual(codes(problems), ['no_meal', 'no_sleep', 'spin_up'])
    assert.ok(problems.every((x) => x.severity === 'note'))
  })
})

// ── the gap clock ────────────────────────────────────────────────────────────────────

describe('the cost is the gap, not the meal', () => {
  it('prices moving a meal, converting it, and skipping it — relative to each other', () => {
    const study = (start: number, halves: number) => p(start, halves, 'study', 'math')
    const onTime = [p(firstHalfOf(1), 2, 'meal'), p(firstHalfOf(4), 2, 'meal'), study(firstHalfOf(5), 4)]
    const moved = [p(firstHalfOf(1), 2, 'meal'), p(firstHalfOf(5), 2, 'meal'), study(firstHalfOf(6), 4)]
    const skipped = [p(firstHalfOf(1), 2, 'meal'), study(firstHalfOf(4), 4), study(firstHalfOf(6), 4)]

    const a = run(onTime)
    const b = run(moved)
    const c = run(skipped)

    // Moving lunch one band costs a little; skipping it costs the bands you were stealing.
    assert.ok(a.peakGap < c.peakGap, 'skipping must peak the clock higher than eating')
    assert.equal(a.meals, 2)
    assert.equal(c.meals, 1)
    // Per band of study, on time beats moved beats skipped.
    assert.ok(a.hours.total >= b.hours.total)
    assert.ok(b.hours.total > c.hours.total / 2)
  })

  it('zeroes the clock on a meal, then keeps counting', () => {
    // The clock is not a per-day flag; it runs continuously and is reported as a peak. Eating
    // at band 4 means the gap peaked at 4 and then began again — which is what makes dinner
    // a separate decision from lunch instead of a formality.
    const r = run([p(firstHalfOf(4), 2, 'meal')])
    assert.equal(r.body.halvesSinceFood, 12, 'the twelve halves after lunch still count')
    // Eating once halves the worst the clock gets — but the evening after the last meal is
    // itself a gap, which is why `peakGap` is 6 here and not 4: dinner is a real decision.
    assert.equal(r.peakGap, 6)
    assert.equal(run([]).peakGap, 11, 'and eating nothing at all costs the whole day')
  })

  it('charges the hunger multiplier against the session it happened in', () => {
    // A block that starts fed and ends hungry pays the average, not the endpoint. Without
    // this a three-band block would be priced as though it were still breakfast at the end.
    const fed = run([p(0, 4, 'study', 'math')])
    const starved = run([p(firstHalfOf(8), 4, 'study', 'math')])
    assert.equal(fed.placements[0]?.mult, 1)
    assert.ok((starved.placements[0]?.mult ?? 1) < 1)
    assert.ok(starved.hours.total < fed.hours.total)
  })
})

describe('the trace', () => {
  it('has one entry per half, in order, whatever the plan is', () => {
    for (const plan of [[], [p(0, 4, 'study', 'math')], [p(firstHalfOf(10), 2, 'bed')]]) {
      assert.equal(run(plan).trace.length, HALF_COUNT, 'a half went unaccounted for')
    }
  })

  it('climbs by half a band a half, and resets on the half you ate in', () => {
    // The planner prints this on the band row, so the row the meal is on has to read zero.
    // Tracing the meal's halves at the pre-meal clock would be true and read backwards.
    const r = run([p(firstHalfOf(4), 2, 'meal')])
    assert.deepEqual(
      r.trace.slice(6, 12).map((t) => t.gap),
      [3.5, 4, 4.5, 0, 0.5, 1],
    )
  })

  it('records the multiplier the half was paid at, not the one it ended on', () => {
    // Hunger bites after 4 bands here, so a block that starts fed and ends starving has to
    // show where the change happened — that is the whole argument of §3.5.
    const r = run([p(0, 12, 'study', 'math')])
    const mults = r.trace.slice(0, 12).map((t) => t.mult)
    assert.deepEqual(mults.slice(0, 8), [1, 1, 1, 1, 1, 1, 1, 1])
    assert.ok(mults.slice(9).every((m) => m < 1), 'the tail of the block was paid less')
    // And eating afterwards does not retroactively pay a half better than it was paid.
    const fed = run([p(0, 12, 'study', 'math'), p(12, 2, 'meal')])
    assert.deepEqual(fed.trace.slice(0, 12).map((t) => t.mult), mults)
  })

  it('agrees with the average the session was actually paid', () => {
    // The pane and the day report must not disagree about one number, so the placement's
    // `mult` has to be the mean of its halves' — not a second, independent calculation.
    const r = run([p(firstHalfOf(6), 6, 'study', 'math')])
    const halves = r.trace.slice(firstHalfOf(6), firstHalfOf(6) + 6)
    const mean = halves.reduce((s, t) => s + t.mult, 0) / halves.length
    assert.equal(r.placements[0]?.mult, Math.round(mean * 100) / 100)
  })

  it('ends where the day ends', () => {
    const r = run([p(firstHalfOf(4), 2, 'meal'), p(firstHalfOf(10), 2, 'bed')])
    const last = r.trace[HALF_COUNT - 1]
    assert.equal(last?.gap, r.body.halvesSinceFood / 2)
    assert.equal(last?.energy, r.body.energy)
    assert.equal(last?.stress, r.body.stress)
  })
})

describe('snacks defer and never restore', () => {
  /** Bands the clock reads at lights-out. Lower means something bought time off it. */
  const clock = (placements: Placement[]) => run(placements).body.halvesSinceFood

  it('buys bands off the clock without counting as a meal', () => {
    const r = run([p(firstHalfOf(5), 1, 'bite')])
    assert.equal(r.meals, 0, 'a snack is not a meal and must never be counted as one')
    assert.equal(clock([]) - clock([p(firstHalfOf(5), 1, 'bite')]), 4, 'the first snack buys 2 bands')
  })

  it('pays less each time, so living on them is possible and priced', () => {
    // §3.5: a snack buys about two bands and the next one buys half as many. The player is
    // never blocked from trying — the cost lands on Condition over the term instead.
    const none = clock([])
    const one = clock([p(firstHalfOf(4), 1, 'bite')])
    const two = clock([p(firstHalfOf(4), 1, 'bite'), p(firstHalfOf(6), 1, 'bite')])
    assert.ok(none - one > one - two, 'the second snack must buy strictly less than the first')
    assert.equal(run([p(firstHalfOf(4), 1, 'bite'), p(firstHalfOf(6), 1, 'bite')]).body.snackStreak, 2)
  })

  it('a meal resets the streak, so the next snack is worth full value again', () => {
    const r = run([
      p(firstHalfOf(2), 1, 'bite'),
      p(firstHalfOf(4), 2, 'meal'),
      p(firstHalfOf(7), 1, 'bite'),
    ])
    assert.equal(r.body.snackStreak, 1)
  })
})

// ── the night borrow ─────────────────────────────────────────────────────────────────

describe('the Night band is a loan, not a wall', () => {
  it('lets you work it, and charges energy and stress for it', () => {
    // The same session, an hour later. Comparing band 9 to band 10 rather than to some
    // earlier band keeps everything else about the day identical — same duration, same
    // number of idle halves after it — so the only difference measured is the night rate.
    // Hunger's energy drain is off here for the same reason: with it on, a whole idle day
    // floors energy at 0 for both and the comparison measures the clamp instead.
    const kind = DayRules.parse({
      ...RULES,
      hunger: RULES.hunger.map((h) => ({ ...h, energy: 0 })),
    })
    const evening = run([p(firstHalfOf(9), 2, 'study', 'math')], kind)
    const night = run([p(firstHalfOf(NIGHT_BAND), 2, 'study', 'math')], kind)
    assert.ok(night.body.stress > evening.body.stress, 'the night must cost stress')
    assert.ok(night.body.energy < evening.body.energy, 'the night must cost energy')
    assert.equal(hasErrors(night.problems), false, 'and it must not be forbidden')
    assert.equal(night.hours.total, evening.hours.total, 'the hours themselves still bank')
  })

  it('does not charge the night rate to sleeping through it', () => {
    const r = run([p(firstHalfOf(NIGHT_BAND), 2, 'bed')])
    assert.equal(r.slept, true)
    assert.ok(r.body.stress < RULES.startStress, 'sleeping pays stress back')
  })

  it('pays back stress at a rate Condition sets', () => {
    // r9's one line: Condition *is* the stress-recovery rate, which is what makes cutting the
    // wakeup run a loan against the rest of the term rather than a free hour today.
    const fit = run([p(firstHalfOf(9), 4, 'bed')], RULES, { ...startingBody(RULES), condition: 90 })
    const unfit = run([p(firstHalfOf(9), 4, 'bed')], RULES, { ...startingBody(RULES), condition: 10 })
    assert.ok(fit.body.stress < unfit.body.stress)
  })
})

// ── carrying the day forward ─────────────────────────────────────────────────────────

describe('nextMorning', () => {
  it('drifts Condition down, so it has to be maintained', () => {
    const body = { ...startingBody(RULES), condition: 60 }
    assert.ok(nextMorning(body, RULES, true).condition < 60)
  })

  it('tapers Condition gains and sharpens its losses', () => {
    // Without the taper the balance bot found every strategy sitting at 97 within a month,
    // at which point the slow axis was not slow and the recovery rate was not a decision.
    const low = run([p(firstHalfOf(0), 2, 'drill')], RULES, { ...startingBody(RULES), condition: 10 })
    const high = run([p(firstHalfOf(0), 2, 'drill')], RULES, { ...startingBody(RULES), condition: 90 })
    assert.ok(low.body.condition - 10 > high.body.condition - 90, 'gains must taper as fitness rises')
  })

  it('charges for never going to bed', () => {
    const body = { ...startingBody(RULES), energy: 8 }
    assert.ok(nextMorning(body, RULES, false).energy < nextMorning(body, RULES, true).energy)
  })

  it('does not feed you overnight — the clock survives at the floor', () => {
    const rules = DayRules.parse({ ...RULES, startBandsSinceFood: 2 })
    const hungry = { ...startingBody(rules), halvesSinceFood: 18 }
    assert.equal(nextMorning(hungry, rules, true).halvesSinceFood, 4)
    assert.equal(nextMorning(hungry, rules, false).halvesSinceFood, 18)
  })

  it('keeps every meter inside its range', () => {
    for (const condition of [0, 50, 100]) {
      for (const slept of [true, false]) {
        const out = nextMorning({ ...startingBody(RULES), condition, energy: 0 }, RULES, slept)
        assert.ok(out.condition >= 0 && out.condition <= 100)
        assert.ok(out.energy >= 0 && out.energy <= 10)
      }
    }
  })
})

// ── the whole day, and the log ───────────────────────────────────────────────────────

describe('resolveDay as a whole', () => {
  it('accounts for every half-band exactly once', () => {
    const day = [
      p(firstHalfOf(0), 2, 'drill'),
      p(firstHalfOf(1), 2, 'meal'),
      p(firstHalfOf(2), 3, 'study', 'math'),
      p(firstHalfOf(4), 2, 'meal'),
      p(firstHalfOf(9), 4, 'bed'),
    ]
    const r = run(day)
    const spent = r.placements.reduce((s, x) => s + x.halves, 0)
    assert.equal(spent + r.freeHalves, HALF_COUNT)
  })

  it('is pure: same plan, same body, same numbers', () => {
    const day = [p(firstHalfOf(2), 3, 'study', 'math'), p(firstHalfOf(4), 2, 'meal')]
    assert.deepEqual(run(day), run(day))
  })

  it('writes a log line a narrator could read on its own', () => {
    const r = run([p(firstHalfOf(2), 4, 'study', 'math'), p(firstHalfOf(9), 4, 'bed')])
    const line = logLine(r)
    assert.match(line, /^Mon 30 Aug — /)
    assert.match(line, /math 2\.3/)
    assert.match(line, /energy \d+, stress \d+, condition \d+/)
    assert.equal(line.includes('undefined'), false)
    assert.equal(line.includes('NaN'), false)
  })

  it('says so when you never went to bed', () => {
    assert.match(logLine(run([p(4, 2, 'study', 'math')])), /never went to bed/)
  })

  it('resolves the empty day rather than throwing', () => {
    const r = run([])
    assert.equal(r.freeHalves, HALF_COUNT)
    assert.equal(r.hours.total, 0)
    assert.equal(hasErrors(r.problems), false)
  })
})

describe('replay', () => {
  it('advances the date and accumulates the log, holding no state of its own', () => {
    const plan = [p(firstHalfOf(2), 4, 'study', 'math'), p(firstHalfOf(9), 4, 'bed')]
    const actions = [
      { type: 'plan_day' as const, date: '2027-08-30', placements: plan },
      { type: 'plan_day' as const, date: '2027-08-31', placements: plan },
    ]
    const s = replay(actions, ACTS, RULES)
    assert.equal(s.day, 3)
    assert.equal(s.date, '2027-09-01')
    assert.equal(s.log.length, 2)
    assert.equal(s.hoursBySubject.math, 4.6, 'two days of the same block, accumulated')
    // Replay is a fold, not a mutation: doing it twice gives the same state.
    assert.deepEqual(replay(actions, ACTS, RULES), s)
  })

  it('starts on the authored first day with a starting body', () => {
    const s = replay([], ACTS, RULES)
    assert.equal(s.date, RULES.firstDay)
    assert.equal(s.day, 1)
    assert.deepEqual(s.body, startingBody(RULES))
    assert.deepEqual(s.enrolled, [])
  })
})

describe('replay: enrolment (§4.6)', () => {
  const enrol = (courseCode: string, section?: string) => ({
    type: 'enrol_course' as const,
    term: 'fall2026',
    courseCode,
    ...(section === undefined ? {} : { section }),
  })
  const drop = (courseCode: string) => ({
    type: 'drop_course' as const,
    term: 'fall2026',
    courseCode,
  })
  const run = (actions: Action[]) => replay(actions, ACTS, RULES)

  it('files courses in the order they were added, carrying the chosen section', () => {
    const s = run([enrol('cs50', '12'), enrol('math21b'), enrol('expos20', 'A')])
    assert.deepEqual(s.enrolled, [
      { term: 'fall2026', courseCode: 'cs50', section: '12' },
      { term: 'fall2026', courseCode: 'math21b' },
      { term: 'fall2026', courseCode: 'expos20', section: 'A' },
    ])
  })

  it('drops a course without disturbing the rest of the card', () => {
    const s = run([enrol('cs50'), enrol('math21b'), enrol('expos20'), drop('math21b')])
    assert.deepEqual(s.enrolled.map((e) => e.courseCode), ['cs50', 'expos20'])
  })

  it('leaves the card alone when you drop something you were never in', () => {
    // Replay folds an already-committed log, so it has nobody to complain to. Whether the
    // drop made sense was the API's question, asked before the action was appended.
    const s = run([enrol('cs50'), drop('chem17')])
    assert.deepEqual(s.enrolled.map((e) => e.courseCode), ['cs50'])
  })

  it('treats re-enrolling as switching sections, not as a second copy of the course', () => {
    const s = run([enrol('cs50', '12'), enrol('cs50', '4')])
    assert.deepEqual(s.enrolled, [{ term: 'fall2026', courseCode: 'cs50', section: '4' }])
  })

  it('keeps a re-added course in its original position on the card', () => {
    const s = run([enrol('cs50'), enrol('math21b'), enrol('cs50', '12')])
    assert.deepEqual(s.enrolled.map((e) => e.courseCode), ['cs50', 'math21b'])
  })

  it('lets a dropped course be re-added, at the end', () => {
    const s = run([enrol('cs50'), enrol('math21b'), drop('cs50'), enrol('cs50', '12')])
    assert.deepEqual(s.enrolled, [
      { term: 'fall2026', courseCode: 'math21b' },
      { term: 'fall2026', courseCode: 'cs50', section: '12' },
    ])
  })

  it('keeps terms separate, so a drop in one term leaves the other standing', () => {
    const s = run([
      enrol('cs50'),
      { type: 'enrol_course', term: 'spring2027', courseCode: 'cs50' },
      drop('cs50'),
    ])
    assert.deepEqual(s.enrolled, [{ term: 'spring2027', courseCode: 'cs50' }])
    assert.deepEqual(enrolledIn(s, 'fall2026'), [])
    assert.deepEqual(enrolledIn(s, 'spring2027'), [{ term: 'spring2027', courseCode: 'cs50' }])
  })

  it('is still a fold: same actions, same enrolment, and days are unaffected', () => {
    const actions: Action[] = [
      enrol('cs50', '12'),
      { type: 'plan_day', date: '2027-08-30', placements: [p(firstHalfOf(9), 4, 'bed')] },
      drop('cs50'),
      enrol('chem17'),
    ]
    const s = run(actions)
    assert.deepEqual(s.enrolled, [{ term: 'fall2026', courseCode: 'chem17' }])
    assert.equal(s.day, 2, 'enrolling is not a day and does not advance the clock')
    assert.equal(s.log.length, 1)
    assert.deepEqual(run(actions), s)
  })
})

describe('the band table', () => {
  it('is eleven bands, twenty-two halves, four anchors', () => {
    assert.equal(BANDS.length, 11)
    assert.equal(HALF_COUNT, 22)
    assert.equal(BANDS.filter((b) => b.anchor === 'meal').length, 3)
    assert.deepEqual(
      BANDS.filter((b) => b.anchor !== null).map((b) => b.index),
      [0, 1, 4, 8, 10],
    )
  })

  it('rounds halves back to bands consistently', () => {
    for (let h = 0; h < HALF_COUNT; h++) assert.equal(bandOf(h), Math.floor(h / 2))
    for (const b of BANDS) assert.equal(bandOf(firstHalfOf(b.index)), b.index)
  })
})
