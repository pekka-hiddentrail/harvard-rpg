import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  Track,
  effectiveDemand,
  fitSessions,
  isCourseOpen,
  openingRoutes,
  parseDate,
  priceTrait,
  resolveAssignmentDates,
  studyPlan,
  validateBuild,
  weekdayName,
  type Levels,
} from '@harvard/engine'
import { assertTracksUsable, loadContent, representativeSectionHours } from '../src/index.ts'

/**
 * These tests read the real content files. They are the ones that break when a trait is
 * mispriced or a preset drifts — which is the point: content is authored, and authoring is
 * where the mistakes are (§4.9).
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..', 'content')
const content = loadContent(root)

describe('the content loads', () => {
  it('puts core first and has the thirteen tags', () => {
    assert.equal(content.packs[0]?.id, 'core')
    assert.equal(content.rules.subjectTags.length, 13)
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
    // Compared against `effectiveDemand`, not `course.demand` — most courses no longer
    // author the latter at all (it derives from their structure), and the API serves the
    // derived value, so asserting against the raw field would test something nothing reads.
    //
    // Only *authored* office-hour demands are checked: an absent one derives from this very
    // rule (`effectiveOfficeHourDemand`), so asserting it here would be asserting that
    // subtraction works. What's worth catching is a hand-typed number that has since drifted
    // away from the course it belongs to. Reported as one list rather than one failure per
    // course: with ~160 stubs, the useful output is *which* ones disagree, not the first one
    // alphabetically.
    const wrong: string[] = []
    for (const course of content.courses) {
      assert.ok(course.officeHours.length > 0, `${course.courseCode} has no office hours`)
      const expected = effectiveDemand(course, representativeSectionHours(course.courseCode, content.slots)) - 1
      for (const officeHour of course.officeHours) {
        if (officeHour.demand !== undefined && officeHour.demand !== expected) {
          wrong.push(`${course.courseCode} (office hour ${officeHour.demand}, expected ${expected})`)
        }
      }
    }
    assert.deepEqual(wrong, [], `office-hour demand must be one below the course's:\n  ${wrong.join('\n  ')}`)
  })

  it('never states a demand of zero, which would be a requirement the course does not have', () => {
    // The spreadsheet the ~160 stubs come from has a column per subject tag and writes 0 in
    // the twelve a course doesn't ask for; `scripts/import-courses.ts` drops those. It has
    // to: the zeroes are arithmetically inert (levels weight by `courseLevel / totalDemand`)
    // but `isCourseOpen` iterates every key in `demands`, so a zero reads as a real
    // prerequisite at level 0 — a gate the course never meant to put up.
    const zeroes: string[] = []
    for (const course of content.courses) {
      assert.ok(Object.keys(course.demands).length > 0, `${course.courseCode} demands nothing`)
      for (const [tag, level] of Object.entries(course.demands)) {
        if (level === 0) zeroes.push(`${course.courseCode}.${tag}`)
      }
    }
    assert.deepEqual(zeroes, [], `zero-level demands:\n  ${zeroes.join('\n  ')}`)
  })

  it('gives every meeting a duration, so no course is silently weightless', () => {
    // `meetingHours` reads `pattern` (via `BLOCK_MINUTES`) or else `time`, and returns 0 with
    // neither. Since `demand` is now derived from those hours, a meeting with no duration
    // doesn't fail — it quietly prices a real course as if nobody ever went to it.
    const undated: string[] = []
    for (const course of content.courses) {
      assert.ok(course.meetings.length > 0, `${course.courseCode} never meets`)
      for (const m of course.meetings) {
        if (!m.pattern && !m.time) undated.push(`${course.courseCode} (${m.type})`)
      }
    }
    assert.deepEqual(undated, [], `meetings with neither a pattern nor a time:\n  ${undated.join('\n  ')}`)
  })

  it('keeps a spine on every transcribed course, and names the stubs that lack one', () => {
    // An empty spine is legal (see `Syllabus.sessions`) but it should never be *quiet*: the
    // three courses transcribed from real syllabi must keep theirs, and the count of stubs
    // still waiting for one gets printed rather than silently drifting upward.
    for (const code of ['cs50', 'expos20', 'math21b']) {
      const course = content.courses.find((c) => c.courseCode === code)
      assert.ok(course, `${code} is missing entirely`)
      assert.ok(course.sessions.length > 0, `${code} lost its session spine`)
      assert.ok(course.assignments.length > 0, `${code} lost its assignments`)
    }
    const spineless = content.courses.filter((c) => c.sessions.length === 0)
    if (spineless.length > 0) {
      console.log(`    # ${spineless.length} stub(s) awaiting a syllabus spine`)
    }
  })

  it('resolves every session and every assignment date against the real calendar', () => {
    // The two functions that turn authored `{ week, session }` into a date both throw rather
    // than guess, and until now nothing called them on the whole catalogue — only the server
    // did, at request time, which is a bad place to find out. The failure they catch is
    // specific and easy to author by accident: Fall 2026's Thanksgiving week has no meetings
    // at all, so `{ week: 13, session: 1 }` resolves for no course, and a spine that
    // miscounts a holiday mis-dates every session after it.
    for (const term of content.terms) {
      for (const course of content.courses) {
        assert.doesNotThrow(() => fitSessions(course, term), `${course.courseCode} in ${term.id}`)
        assert.doesNotThrow(
          () => resolveAssignmentDates(course, term),
          `${course.courseCode} in ${term.id}`,
        )
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
      // No assignments at all means the syllabus hasn't been transcribed yet, not that the
      // course is ungraded (see `Syllabus.assignments`). A *partial* set still has to sum,
      // which is what keeps this test useful on the stubs as they get filled in.
      if (course.assignments.length === 0) continue
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

describe('the tracks, against the courses that actually exist', () => {
  const codes = new Set(content.courses.map((c) => c.courseCode))
  const pool = (g: { kind: string; from: string[]; oneOf: string[]; anyOf: string[]; sequence: string[] }) =>
    g.kind === 'sequence' ? g.sequence : [...g.from, ...g.oneOf, ...g.anyOf]

  it('loads all seven', () => {
    // Nothing read `content/tracks/` until the solver did, so none of these files had ever
    // been schema-validated. Two of the seven did not parse.
    assert.equal(content.tracks.length, 7)
    assert.deepEqual(
      content.tracks.map((t) => t.id).sort(),
      ['cs_mbb', 'econ_basic', 'econ_honors_advanced', 'econ_honors_thesis', 'math', 'math_joint_allied', 'math_joint_primary'],
    )
  })

  it('leaves only deliverables abstract in the three math tracks', () => {
    // These files used to reference twenty course ids that did not exist, so the tracks could
    // not be solved at all. What remains abstract is the expository paper and the thesis,
    // which are things you write rather than courses you enrol in.
    for (const id of ['math', 'math_joint_primary']) {
      const t = content.tracks.find((x) => x.id === id)!
      const abstract = t.requirements.flatMap((g) => pool(g).filter((c) => !codes.has(c)))
      assert.deepEqual([...new Set(abstract)].sort(), ['math_expository_paper', 'math_senior_thesis'])
    }
    // The allied side of a joint concentration owes neither, so it is fully solvable.
    const allied = content.tracks.find((x) => x.id === 'math_joint_allied')!
    assert.deepEqual(allied.requirements.flatMap((g) => pool(g).filter((c) => !codes.has(c))), [])
  })

  it('spells the econ prerequisites the way the catalogue does', () => {
    // `ec10a`, `ec10b`, `stat109a` and `apmth101` were typos for courses that do exist, so
    // four requirement groups were quietly unsatisfiable in three tracks.
    for (const id of ['econ_basic', 'econ_honors_advanced', 'econ_honors_thesis']) {
      const t = content.tracks.find((x) => x.id === id)!
      const refs = t.requirements.flatMap(pool)
      for (const typo of ['ec10a', 'ec10b', 'stat109a', 'apmth101']) {
        assert.ok(!refs.includes(typo), `${id} still references \`${typo}\``)
      }
      assert.ok(refs.includes('econ10a') && refs.includes('econ10b'))
    }
  })

  it('prices the Mathematics track at eight math courses, not eleven', () => {
    // The breadth groups are three *of* the eight, which is what `counts` encodes. Summing
    // parent and children instead reports the track closed to a freshman — the loudest
    // possible way to be wrong, and the reason this test reads real content.
    const plan = studyPlan({ taken: [], termsUsed: 1 }, content.tracks, content.courses, content.rules)
    const math = plan.find((t) => t.trackId === 'math')!
    // 8 math + 4 related field + 1 expository paper; the thesis is optional.
    assert.equal(math.needMore, 13)
    assert.equal(math.status, 'slack')
  })

  it('reports what a real freshman card does to every track at once', () => {
    const plan = studyPlan(
      { taken: ['cs50', 'math21b', 'expos20', 'ls1a'], termsUsed: 1 },
      content.tracks,
      content.courses,
      content.rules,
    )
    assert.equal(plan.length, 7)
    const mbb = plan.find((t) => t.trackId === 'cs_mbb')!
    // Math 21b is the linear algebra requirement; CS 50 is one of the eight CS core courses.
    assert.deepEqual(mbb.counted.sort(), ['cs50', 'math21b'])
    // Expos 20 and LS 1A count toward no concentration in content — there is no
    // college-wide requirements file yet, which is a real gap and not a solver bug.
    assert.deepEqual(mbb.wasted.sort(), ['expos20', 'ls1a'])
    // CS core cannot be finished out of the catalogue: eight wanted, six real courses.
    assert.match(mbb.reasons.join('\n'), /CS core: 7 more, but only 6 courses in content/)
  })

  it('names a route out of every course a weak build is shut out of (r11)', () => {
    const weak = Object.fromEntries(content.rules.subjectTags.map((t) => [t, -2])) as Levels
    const byCode = new Map(content.courses.map((c) => [c.courseCode, c]))
    const shut = content.courses.filter((c) => openingRoutes(c.courseCode, weak, content.courses).length > 0)
    assert.ok(shut.length > 0, 'a level of −2 in everything should shut something')
    for (const c of shut) {
      for (const route of openingRoutes(c.courseCode, weak, content.courses)) {
        // §9.3: "closed this year, and here is the cheapest way to open it." A route list that
        // is empty is a refusal wearing a suggestion's clothes.
        assert.ok(route.via.length > 0, `${c.courseCode} is shut on ${route.tag} with no way out`)
        // Every route is genuinely cheaper on the blocking tag, and cheapest first.
        const wants = c.demands[route.tag] ?? 0
        assert.ok(route.via.every((v) => v.demand < wants))
        /**
         * ...and every route is one this player can actually enrol in *today*, on every tag it
         * demands. This is the assertion that was missing: the same −2-in-everything vector
         * used to produce 503 routes out of 1740 that the server would have refused at enrol
         * time, because being cheaper on the blocking tag says nothing about the other twelve.
         */
        for (const v of route.via) {
          const target = byCode.get(v.courseCode)!
          assert.ok(
            isCourseOpen(target.demands, weak),
            `${c.courseCode}/${route.tag} offers ${v.courseCode}, which is itself shut`,
          )
        }
        assert.deepEqual(
          route.via.map((v) => v.demand),
          [...route.via.map((v) => v.demand)].sort((x, y) => x - y),
        )
      }
    }
  })
})

describe('the track loader refuses the shapes the solver cannot answer', () => {
  const group = (over: Record<string, unknown>) => ({ id: 'g', label: 'G', kind: 'set', need: 1, from: ['cs50'], ...over })
  const one = (requirements: Record<string, unknown>[]) => [
    Track.parse({ id: 't', name: 'T', field: 'test', requirements }),
  ]

  it('accepts the shapes the seven real tracks actually use', () => {
    // The guard below is only worth having if it lets real content through, so this is the
    // control: today's files load, which the suite's very first line already proves.
    assert.doesNotThrow(() => assertTracksUsable(content.tracks))
  })

  it('refuses a `tag` requirement, which has no pool for `poolOf` to read', () => {
    // The schema has always allowed this kind and the solver has never implemented it: such a
    // group would be permanently unsatisfiable, taking its whole track to `unplannable` with
    // nothing in the reason line to name. Refused at load rather than answered wrongly.
    assert.throws(
      () => assertTracksUsable(one([group({ kind: 'tag', subjectTag: 'math', from: [] })])),
      /does not implement/,
    )
  })

  it('refuses nested `counts`, which the slot arithmetic would silently drop', () => {
    // `needMore` charges a parent and its children `max(parent, Σ children)` one level deep. A
    // child that counts groups of its own would have *those* deficits vanish from the bill —
    // understating what a track owes, which is the direction that matters.
    assert.throws(
      () =>
        assertTracksUsable(
          one([
            group({ id: 'top', counts: ['mid'], need: 3, from: ['cs50', 'expos20', 'ls1a'] }),
            group({ id: 'mid', counts: ['low'], from: ['cs50'] }),
            group({ id: 'low', from: ['cs50'] }),
          ]),
        ),
      /nested `counts` is not supported/,
    )
  })
})
