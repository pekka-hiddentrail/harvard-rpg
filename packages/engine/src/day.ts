import { BAND_COUNT, HALF_COUNT, HALVES_PER_BAND, NIGHT_BAND, bandOf, halfLabel } from './bands.ts'
import { formatShort, parseDate } from './dates.ts'
import { SUBJECT_TAGS, type Activity, type DayRules, type Placement, type SubjectTag } from './schema.ts'

/**
 * One day, resolved (GAME_DESIGN §3.1, §3.5; ARCHITECTURE §11 Tier 1).
 *
 * Pure and total: same plan, same body, same numbers, forever. No clock, no randomness —
 * Tier 1 has nothing to draw for, since the hidden draw arrives with grading at Tier 2.
 *
 * Two rules do almost all the work here, and both are §3's:
 *
 * 1. **Continuity beats duration.** Yield is a function of *session length*, not of bands
 *    spent, so three separate halves of study bank nothing and one and a half bands in a
 *    row banks 1.7×. That is the spin-up cost, and it lives entirely in the authored curve.
 * 2. **The cost is the gap, not the meal.** One number — bands elapsed since food — prices
 *    moving lunch, converting lunch and skipping lunch *relative to each other*, and the
 *    penalty lands on the bands you were trying to steal rather than on a scold.
 */

export type ActivityIndex = ReadonlyMap<string, Activity>

export const indexActivities = (activities: readonly Activity[]): ActivityIndex =>
  new Map(activities.map((a) => [a.id, a]))

/** Everything the day carries in and out. `Body` in §8 plus the two day-scale meters. */
export type Body = {
  energy: number
  stress: number
  condition: number
  /** Tracked in halves so a 1.5-band session prices correctly; reported in bands. */
  halvesSinceFood: number
  /** Consecutive snacks with no meal between them. Snacks defer, and they stop working. */
  snackStreak: number
}

export const startingBody = (rules: DayRules): Body => ({
  energy: rules.startEnergy,
  stress: rules.startStress,
  condition: rules.startCondition,
  halvesSinceFood: rules.startBandsSinceFood * HALVES_PER_BAND,
  snackStreak: 0,
})

/**
 * An `error` refuses to resolve; a `note` is advice the planner prints and the player is
 * free to ignore. The distinction matters for one case in particular: a half-band of study
 * is **legal** and yields nothing. Forbidding it would hide the rule; noting it teaches it.
 */
export type DayProblem = { code: string; severity: 'error' | 'note'; message: string; start?: number }

export type ResolvedPlacement = {
  start: number
  halves: number
  activity: string
  name: string
  target?: string
  /** Hours banked. Zero for everything that is not study or reading. */
  hours: number
  /** What the curve would have paid at full strength, before hunger and fatigue. */
  gross: number
  /** The product of the averaged hunger and fatigue multipliers, for the "why" line. */
  mult: number
}

export type DayResult = {
  date: string
  placements: ResolvedPlacement[]
  hours: { total: number; bySubject: Record<SubjectTag, number> }
  /** Halves nobody claimed. Idle time is legal and it is the thing the game is about. */
  freeHalves: number
  body: Body
  slept: boolean
  meals: number
  /** The worst the gap clock got, in bands. The number that explains a bad afternoon. */
  peakGap: number
  /**
   * The body after each of the twenty-two halves, in order, with the yield multiplier that
   * was in force *during* it.
   *
   * Here because §3.5's whole argument is that the cost of a skipped meal lands *on the bands
   * you were stealing*, and a single end-of-day number cannot show that. The planner draws
   * this beside the band rows, so the afternoon that a missing lunch ruins is legible in the
   * row where it happens rather than inferrable from a total.
   *
   * `gap` is in bands and can be fractional, because a snack buys back a fraction of one.
   */
  trace: { gap: number; energy: number; stress: number; mult: number }[]
  problems: DayProblem[]
  log: string
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// ── validation ───────────────────────────────────────────────────────────────────────

export function validatePlan(
  placements: readonly Placement[],
  activities: ActivityIndex,
): DayProblem[] {
  const problems: DayProblem[] = []
  const say = (severity: DayProblem['severity'], code: string, message: string, start?: number) => {
    problems.push(start === undefined ? { code, severity, message } : { code, severity, message, start })
  }

  const owner = new Array<number | null>(HALF_COUNT).fill(null)
  const sorted = [...placements].sort((a, b) => a.start - b.start)
  let sleepAt: number | null = null

  for (const [i, p] of sorted.entries()) {
    const a = activities.get(p.activity)
    if (!a) {
      say('error', 'unknown_activity', `there is no activity \`${p.activity}\``, p.start)
      continue
    }

    if (p.start + p.halves > HALF_COUNT) {
      say('error', 'overruns_day', `${a.name} runs off the end of the day`, p.start)
    }
    for (let h = p.start; h < Math.min(p.start + p.halves, HALF_COUNT); h++) {
      const held = owner[h]
      if (held !== null && held !== i) {
        say('error', 'overlap', `${a.name} overlaps ${halfLabel(h)}`, p.start)
        break
      }
      owner[h] = i
    }

    if (p.halves < a.minHalves) {
      say('error', 'too_short', `${a.name} needs at least ${bandsText(a.minHalves)}`, p.start)
    }
    if (p.halves > a.maxHalves) {
      say('error', 'too_long', `${a.name} runs at most ${bandsText(a.maxHalves)}`, p.start)
    }
    if (a.fixed && p.halves !== a.minHalves) {
      say('error', 'fixed_length', `${a.name} is exactly ${bandsText(a.minHalves)} long`, p.start)
    }

    if (a.allowedBands.length > 0 && !a.allowedBands.includes(bandOf(p.start))) {
      const where = a.allowedBands.map((b) => `band ${b}`).join(', ')
      say('error', 'wrong_band', `${a.name} belongs in ${where}`, p.start)
    }

    if (a.targets === 'subject') {
      if (p.target === undefined) {
        say('error', 'no_target', `${a.name} has to be aimed at a subject`, p.start)
      } else if (!(SUBJECT_TAGS as readonly string[]).includes(p.target)) {
        say('error', 'bad_target', `\`${p.target}\` is not a subject tag`, p.start)
      }
    } else if (p.target !== undefined) {
      say('error', 'unwanted_target', `${a.name} is not aimed at anything`, p.start)
    }

    if (sleepAt !== null && p.start >= sleepAt) {
      say('error', 'after_sleep', `${a.name} is after you went to bed`, p.start)
    }
    if (a.sleep) sleepAt = p.start

    // The spin-up note: legal, and worth saying out loud the first time someone tries it.
    if (a.curve.length > 0 && (a.curve[p.halves - 1] ?? 0) === 0) {
      say('note', 'spin_up', `${bandsText(p.halves)} of ${a.name.toLowerCase()} banks nothing — you are still spinning up`, p.start)
    }
  }

  const kinds = sorted.flatMap((p) => {
    const a = activities.get(p.activity)
    return a ? [a] : []
  })
  if (!kinds.some((a) => a.food === 'meal')) {
    say('note', 'no_meal', 'you have not planned a single meal today')
  }
  if (!kinds.some((a) => a.sleep)) {
    say('note', 'no_sleep', 'nothing is sleeping tonight — the Night band is unspent')
  }

  return problems
}

const bandsText = (halves: number): string => {
  const b = halves / HALVES_PER_BAND
  return b === 1 ? '1 band' : `${b} bands`
}

export const hasErrors = (problems: readonly DayProblem[]): boolean =>
  problems.some((p) => p.severity === 'error')

// ── resolution ───────────────────────────────────────────────────────────────────────

const hungerMult = (body: Body, rules: DayRules): { mult: number; energy: number } => {
  const bands = body.halvesSinceFood / HALVES_PER_BAND
  let out = { mult: 1, energy: 0 }
  for (const row of rules.hunger) if (bands >= row.after) out = { mult: row.yieldMult, energy: row.energy }
  return out
}

/**
 * Condition is the slow axis (§8), and "slow" has to mean *bounded* or it isn't slow — a
 * daily run at a flat +3 walks it to 100 inside a month and the stress-recovery rate it
 * feeds stops being a decision. So gains taper as fitness rises and losses bite harder the
 * fitter you were. The balance bot found this on its first run: everything pinned at 97.
 */
const conditionDelta = (raw: number, condition: number): number =>
  raw > 0 ? raw * (1 - condition / 100) : raw * (0.5 + condition / 100)

const fatigueMult = (body: Body, rules: DayRules): number => {
  for (const row of rules.fatigue) if (body.energy <= row.atOrBelow) return row.yieldMult
  return 1
}

/**
 * Resolve one planned day. Walks the twenty-two halves in order, because every rule here
 * is order-dependent: the gap clock rises through a session, energy falls through it, and
 * a lunch placed late is a different afternoon from a lunch placed on time.
 */
export function resolveDay(
  plan: { date: string; placements: readonly Placement[] },
  activities: ActivityIndex,
  rules: DayRules,
  startBody: Body,
): DayResult {
  const problems = validatePlan(plan.placements, activities)
  const body: Body = { ...startBody }
  const bySubject = Object.fromEntries(SUBJECT_TAGS.map((t) => [t, 0])) as Record<SubjectTag, number>
  const resolved: ResolvedPlacement[] = []
  const byStart = new Map<number, Placement>()
  for (const p of plan.placements) byStart.set(p.start, p)

  let peakHalves = body.halvesSinceFood
  let freeHalves = 0
  let slept = false
  let meals = 0

  const trace: DayResult['trace'] = []

  /**
   * One half-band of elapsed time, with whatever it costs. Returns the yield multiplier that
   * applied during it — read from the body *before* the half moves it, because a session is
   * paid at the state it started each half in, not the state it ended the day in.
   */
  const tick = (perBandEnergy: number, perBandStress: number, perBandCondition: number): number => {
    const half = 1 / HALVES_PER_BAND
    const hungry = hungerMult(body, rules)
    const mult = hungry.mult * fatigueMult(body, rules)
    body.energy = clamp(body.energy + (perBandEnergy + hungry.energy) * half, 0, 10)
    body.stress = clamp(body.stress + perBandStress * half, 0, 100)
    body.condition = clamp(body.condition + conditionDelta(perBandCondition * half, body.condition), 0, 100)
    body.halvesSinceFood += 1
    if (body.halvesSinceFood > peakHalves) peakHalves = body.halvesSinceFood
    trace.push({
      gap: body.halvesSinceFood / HALVES_PER_BAND,
      energy: round1(body.energy),
      stress: round1(body.stress),
      mult: Math.round(mult * 100) / 100,
    })
    return mult
  }

  let h = 0
  while (h < HALF_COUNT) {
    const p = byStart.get(h)
    const a = p ? activities.get(p.activity) : undefined
    if (!p || !a || p.halves < 1) {
      freeHalves += 1
      tick(0, 0, 0)
      h += 1
      continue
    }

    const halves = Math.min(p.halves, HALF_COUNT - h)
    const night = bandOf(h) === NIGHT_BAND && !a.sleep
    const energyPerBand = a.perBand.energy + (night ? rules.night.energyPerBand : 0)
    const stressPerBand = a.perBand.stress + (night ? rules.night.stressPerBand : 0)

    // Multipliers are averaged over the halves of the session, because both inputs move
    // while it runs: a three-band block that starts fed ends hungry.
    let multSum = 0
    for (let k = 0; k < halves; k++) {
      multSum += tick(energyPerBand, stressPerBand, a.perBand.condition)
    }
    const mult = halves > 0 ? multSum / halves : 0

    if (a.food === 'meal') {
      body.halvesSinceFood = 0
      body.snackStreak = 0
      meals += 1
    } else if (a.food === 'snack') {
      body.snackStreak += 1
      const buys = (rules.snackDefersBands / body.snackStreak) * HALVES_PER_BAND
      body.halvesSinceFood = Math.max(0, body.halvesSinceFood - buys)
    }

    if (a.sleep) {
      slept = true
      const bands = halves / HALVES_PER_BAND
      body.energy = clamp(body.energy + rules.sleepEnergyPerBand * bands, 0, 10)
      // Condition is the stress-recovery rate (§8, r9). This line is why cutting the run
      // is a loan against the rest of the term.
      const rate = 0.5 + body.condition / 100
      body.stress = clamp(body.stress - rules.sleepStressPerBand * bands * rate, 0, 100)
    }

    // The meal's own halves were traced while the clock was still climbing, which is true but
    // reads backwards: the row you want to see a zero on is the one you ate in. So the last
    // half of the placement is restated after its effects land. `mult` is left alone — it is
    // what the half was *paid* at, and eating afterwards does not retroactively pay it better.
    const last = trace[trace.length - 1]
    if (last) {
      last.gap = body.halvesSinceFood / HALVES_PER_BAND
      last.energy = round1(body.energy)
      last.stress = round1(body.stress)
    }

    const gross = a.curve[halves - 1] ?? 0
    const hours = round1(gross * mult)
    if (hours > 0 && p.target && (SUBJECT_TAGS as readonly string[]).includes(p.target)) {
      bySubject[p.target as SubjectTag] = round1((bySubject[p.target as SubjectTag] ?? 0) + hours)
    }
    resolved.push({
      start: h,
      halves,
      activity: a.id,
      name: a.name,
      ...(p.target === undefined ? {} : { target: p.target }),
      hours,
      gross,
      // Two decimals, the same as each half's in `trace`, so the planner's band row and the
      // day report cannot print two different multipliers for one session.
      mult: Math.round(mult * 100) / 100,
    })

    h += halves
  }

  const total = round1(resolved.reduce((s, r) => s + r.hours, 0))
  const peakGap = peakHalves / HALVES_PER_BAND
  const result: DayResult = {
    date: plan.date,
    placements: resolved,
    hours: { total, bySubject },
    freeHalves,
    body: {
      energy: round1(body.energy),
      stress: round1(body.stress),
      condition: round1(body.condition),
      halvesSinceFood: body.halvesSinceFood,
      snackStreak: body.snackStreak,
    },
    slept,
    meals,
    peakGap,
    trace,
    problems,
    log: '',
  }
  result.log = logLine(result)
  return result
}

/**
 * The Tier 0 log line, promoted. One line per day, and it is what the Tier 4 narrator will
 * be handed instead of the state object — so it has to be legible on its own.
 */
export function logLine(r: DayResult): string {
  const subjects = SUBJECT_TAGS.filter((t) => (r.hours.bySubject[t] ?? 0) > 0)
    .map((t) => `${t} ${r.hours.bySubject[t]?.toFixed(1)}`)
    .join(', ')
  const parts = [
    `${formatShort(parseDate(r.date))} — ${r.hours.total.toFixed(1)} h banked${subjects ? ` (${subjects})` : ''}`,
    `${r.meals} ${r.meals === 1 ? 'meal' : 'meals'}, gap peaked ${r.peakGap.toFixed(1)}`,
    `energy ${r.body.energy.toFixed(0)}, stress ${r.body.stress.toFixed(0)}, condition ${r.body.condition.toFixed(0)}`,
    r.slept ? `${r.freeHalves} halves unspent` : 'never went to bed',
  ]
  return parts.join(' · ')
}

/**
 * Carry a body into tomorrow. Sleeping does not feed you, so the gap clock survives the
 * night at the authored floor rather than resetting — which is what makes skipping dinner
 * a decision about tomorrow morning as well as tonight.
 */
export function nextMorning(body: Body, rules: DayRules, slept: boolean): Body {
  const floor = rules.startBandsSinceFood * HALVES_PER_BAND
  return {
    energy: slept ? body.energy : clamp(body.energy - 2, 0, 10),
    stress: body.stress,
    condition: clamp(
      body.condition + conditionDelta(rules.conditionDailyDrift, body.condition),
      0,
      100,
    ),
    halvesSinceFood: Math.max(floor, slept ? floor : body.halvesSinceFood),
    snackStreak: body.snackStreak,
  }
}
