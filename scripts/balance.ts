import { join } from 'node:path'
import { loadContent } from '@harvard/content'
import { STRATEGIES, bandsSpent, playDays, type SubjectTag } from '@harvard/engine'

/**
 * `npm run balance -- [days] [subject]`
 *
 * The balance harness's printout (ARCHITECTURE §11). It plays each strategy in `bot.ts` for
 * N identical days, carrying the body forward, and prints what it got. Nothing here asserts
 * anything — the assertions live in `packages/content/test/balance.test.ts` (beside the
 * content, because they are claims about the shipped numbers), so a claim that matters cannot
 * be quietly broken. This is the version you read when you want to know *why* a number moved.
 *
 * Tier 1 can only ask day-scale questions of it. The term-scale claims in GAME_DESIGN —
 * cutting exercise must lose over a term, at least one strategy must reach probation — need
 * the calendar and grading, so they arrive at Tier 2 against this same harness.
 */

const days = Number(process.argv[2] ?? 14)
const subject = (process.argv[3] ?? 'math') as SubjectTag

const content = loadContent(join(process.cwd(), 'content'))
const rules = content.rules.day

const w = (s: string | number, n: number) => String(s).padStart(n)

console.log(`\n  ${days} days · study aimed at ${subject} · content ${content.hash}`)
console.log(`  day 1 is ${rules.firstDay}; energy ${rules.startEnergy}, stress ${rules.startStress}, condition ${rules.startCondition}\n`)
console.log(
  `  ${'strategy'.padEnd(18)}${w('study b', 8)}${w('h/day', 8)}${w('h/band', 8)}${w('total h', 9)}` +
    `${w('energy', 8)}${w('stress', 8)}${w('cond', 6)}${w('notes', 7)}`,
)
console.log(`  ${'─'.repeat(80)}`)

for (const s of STRATEGIES) {
  const run = playDays(s, days, content.activityIndex, rules, subject)
  const plan = s.plan(subject)
  const studyBands = bandsSpent(plan.filter((p) => (content.activityIndex.get(p.activity)?.curve.length ?? 0) > 0))
  const perDay = run.totals.hours / days
  const errors = run.days[0]?.problems.filter((p) => p.severity === 'error') ?? []
  const notes = run.days[0]?.problems.filter((p) => p.severity === 'note').length ?? 0

  console.log(
    `  ${s.name.padEnd(18)}${w(studyBands.toFixed(1), 8)}${w(perDay.toFixed(2), 8)}` +
      `${w((perDay / (studyBands || 1)).toFixed(2), 8)}${w(run.totals.hours.toFixed(1), 9)}` +
      `${w(run.totals.endBody.energy.toFixed(1), 8)}${w(run.totals.endBody.stress.toFixed(0), 8)}` +
      `${w(run.totals.endBody.condition.toFixed(0), 6)}${w(notes, 7)}`,
  )
  for (const e of errors) console.log(`      ILLEGAL: ${e.message}`)
}

console.log(`\n  claims under test:`)
for (const s of STRATEGIES) console.log(`    ${s.name.padEnd(18)} ${s.claim}`)
console.log(`\n  day 1, the routine:`)
console.log(`    ${playDays(STRATEGIES[0]!, 1, content.activityIndex, rules, subject).days[0]?.log}\n`)
