import { HALVES_PER_BAND, NIGHT_BAND, firstHalfOf } from './bands.ts'
import { nextMorning, resolveDay, startingBody, type ActivityIndex, type Body, type DayResult } from './day.ts'
import { nextDay, parseDate, toISO } from './dates.ts'
import type { DayRules, Placement, SubjectTag } from './schema.ts'

/**
 * The balance harness (ARCHITECTURE §11: "not optional and not expensive").
 *
 * A headless player. It exists because several claims in GAME_DESIGN are unfalsifiable
 * without one — cutting exercise to buy study bands must *lose* over a term, and living on
 * snacks must cost something real — and because the activity that killed the prototype was
 * playing 180 days by hand to find out.
 *
 * Primitive on purpose at Tier 1: the strategies are hand-written day templates, not a
 * planner. There is no calendar to react to yet, so a bot that reasoned about one would be
 * reasoning about placeholders.
 */

export type Strategy = {
  id: string
  name: string
  /** What it is meant to prove. Printed beside the numbers so a bad result is legible. */
  claim: string
  plan: (subject: SubjectTag) => Placement[]
}

const at = (band: number, half = 0): number => firstHalfOf(band) + half
const study = (band: number, halves: number, subject: SubjectTag, half = 0): Placement => ({
  start: at(band, half),
  halves,
  activity: 'study',
  target: subject,
  withPeople: [],
})
const plain = (band: number, halves: number, activity: string, half = 0): Placement => ({
  start: at(band, half),
  halves,
  activity,
  withPeople: [],
})

const RUN = plain(0, 2, 'run')
const BREAKFAST = plain(1, 2, 'breakfast')
const LUNCH = plain(4, 2, 'lunch')
const DINNER = plain(8, 2, 'dinner')
const SLEEP = plain(NIGHT_BAND, 2, 'sleep')

export const STRATEGIES: readonly Strategy[] = [
  {
    id: 'routine',
    name: 'the routine',
    claim: 'the baseline: run, three meals, two clean study blocks, bed',
    plan: (s) => [RUN, BREAKFAST, study(2, 2, s), study(3, 2, s), LUNCH, study(5, 2, s), DINNER, study(9, 2, s), SLEEP],
  },
  {
    id: 'continuous',
    name: 'long blocks',
    claim: 'same bands as the routine, joined up — must bank more (§3.1 continuity)',
    plan: (s) => [RUN, BREAKFAST, study(2, 4, s), LUNCH, study(5, 2, s), DINNER, study(9, 2, s), SLEEP],
  },
  {
    id: 'fragmented',
    name: 'half-bands',
    claim: 'the same time in leftover halves — must bank almost nothing',
    plan: (s) => [
      RUN,
      BREAKFAST,
      study(2, 1, s),
      study(2, 1, s, 1),
      study(3, 1, s),
      study(3, 1, s, 1),
      LUNCH,
      study(5, 1, s),
      study(5, 1, s, 1),
      DINNER,
      study(9, 1, s),
      study(9, 1, s, 1),
      SLEEP,
    ],
  },
  {
    id: 'skips_lunch',
    name: 'skips lunch',
    claim: 'buys one band by skipping lunch — the afternoon should pay for it (§3.5)',
    plan: (s) => [RUN, BREAKFAST, study(2, 4, s), study(4, 2, s), study(5, 2, s), DINNER, study(9, 2, s), SLEEP],
  },
  {
    id: 'snacker',
    name: 'lives on snacks',
    claim: 'snacks instead of meals: possible, and Condition pays over weeks',
    plan: (s) => [
      RUN,
      plain(1, 1, 'snack'),
      study(2, 4, s),
      plain(4, 1, 'snack'),
      study(5, 4, s),
      plain(8, 1, 'snack'),
      study(9, 2, s),
      SLEEP,
    ],
  },
  {
    id: 'cuts_the_run',
    name: 'cuts the run',
    claim: 'trades the wakeup run for study — must lose over a term via Condition (§8)',
    plan: (s) => [study(0, 2, s), BREAKFAST, study(2, 4, s), LUNCH, study(5, 2, s), DINNER, study(9, 2, s), SLEEP],
  },
  {
    id: 'night_owl',
    name: 'borrows the night',
    claim: 'works the Night band instead of sleeping — energy and stress compound',
    plan: (s) => [RUN, BREAKFAST, study(2, 4, s), LUNCH, study(5, 2, s), DINNER, study(9, 2, s), study(NIGHT_BAND, 2, s)],
  },
  {
    id: 'grinder',
    name: 'every free band',
    claim: 'the ceiling: everything not an anchor is study',
    plan: (s) => [
      RUN,
      BREAKFAST,
      study(2, 4, s),
      LUNCH,
      study(5, 6, s),
      DINNER,
      study(9, 2, s),
      SLEEP,
    ],
  },
]

export type BotRun = {
  strategy: Strategy
  days: DayResult[]
  /** Totals over the run — what a term-scale claim is actually judged on. */
  totals: { hours: number; endBody: Body }
}

/** Play the same day `days` times, carrying the body forward. */
export function playDays(
  strategy: Strategy,
  days: number,
  activities: ActivityIndex,
  rules: DayRules,
  subject: SubjectTag = 'math',
): BotRun {
  let body = startingBody(rules)
  let date = parseDate(rules.firstDay)
  const out: DayResult[] = []
  for (let i = 0; i < days; i++) {
    const result = resolveDay({ date: toISO(date), placements: strategy.plan(subject) }, activities, rules, body)
    out.push(result)
    body = nextMorning(result.body, rules, result.slept)
    date = nextDay(date)
  }
  return {
    strategy,
    days: out,
    totals: {
      hours: Math.round(out.reduce((s, d) => s + d.hours.total, 0) * 10) / 10,
      endBody: body,
    },
  }
}

export const runAll = (days: number, activities: ActivityIndex, rules: DayRules): BotRun[] =>
  STRATEGIES.map((s) => playDays(s, days, activities, rules))

/** Bands a strategy spends, so "the same time, differently arranged" is checkable. */
export const bandsSpent = (placements: readonly Placement[]): number =>
  placements.reduce((s, p) => s + p.halves, 0) / HALVES_PER_BAND
