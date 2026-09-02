import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countsToward, openingRoutes, studyPlan, trackProgress } from '../src/studyPlan.ts'
import { zeroLevels } from '../src/schema.ts'
import type { Levels, RequirementGroup, Rules, Syllabus, Track } from '../src/schema.ts'

/**
 * Fixtures kept small on purpose: the interesting behaviour is the *shape* of the requirement
 * graph, not the size of the catalogue. The one place real content appears is the last
 * describe block, which guards the arithmetic that a made-up graph would never have caught.
 */

const course = (courseCode: string, demands: Syllabus['demands'] = {}): Syllabus =>
  ({
    id: courseCode,
    courseCode,
    title: courseCode.toUpperCase(),
    demands,
    meetings: [{ type: 'lecture', days: ['Mon'], pattern: 'MWF', size: 50, attendance: 'flexible' }],
    officeHours: [],
    sessions: [],
    assignments: [],
  }) as unknown as Syllabus

/** Four terms of four: enough room to be interesting, little enough to run out. */
const rules = {
  academics: { semesterEffortCap: 28, coursesPerTerm: 4, termsToDegree: 8 },
} as unknown as Rules

const group = (g: Partial<RequirementGroup> & { id: string; label: string }): RequirementGroup =>
  ({
    kind: 'set',
    need: 1,
    from: [],
    oneOf: [],
    anyOf: [],
    counts: [],
    optional: false,
    sequence: [],
    notes: [],
    ...g,
  }) as RequirementGroup

const track = (id: string, requirements: RequirementGroup[], extra: Partial<Track> = {}): Track =>
  ({
    id,
    name: id,
    field: 'test',
    honorsEligible: false,
    thesisRequired: false,
    requirements,
    courseHints: [],
    ...extra,
  }) as Track

const CATALOGUE = ['a1', 'a2', 'a3', 'b1', 'b2', 'c1'].map((c) => course(c))

describe('trackProgress: one course, one group', () => {
  it('does not let a course listed in two groups satisfy both', () => {
    // The Mathematics track lists Math 101 under three groups. A student who takes it has
    // taken one course, and the solver must say so — this is the whole reason assignment is a
    // matching rather than a per-group `includes` check.
    const t = track('t', [
      group({ id: 'g1', label: 'One', from: ['a1', 'a2'] }),
      group({ id: 'g2', label: 'Two', from: ['a1', 'a3'] }),
    ])
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 1 }, CATALOGUE, rules)
    const done = p.groups.filter((g) => g.state === 'done')
    assert.equal(done.length, 1)
    assert.deepEqual(p.counted, ['a1'])
  })

  it('serves the scarcest group first, because it is the one with no alternative', () => {
    // `g2` can only ever be satisfied by a1. `g1` has two other routes. Handing a1 to `g1`
    // would close g2 forever for no gain.
    const t = track('t', [
      group({ id: 'g1', label: 'Wide', from: ['a1', 'a2', 'a3'] }),
      group({ id: 'g2', label: 'Narrow', from: ['a1'] }),
    ])
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 1 }, CATALOGUE, rules)
    assert.deepEqual(p.groups.find((g) => g.id === 'g2')?.assigned, ['a1'])
    assert.equal(p.groups.find((g) => g.id === 'g1')?.state, 'open')
  })
})

describe('trackProgress: `counts`, and the arithmetic that must not double', () => {
  it('credits a child group’s course to its parent', () => {
    const t = track('t', [
      group({ id: 'big', label: 'Big', need: 3, from: ['a1', 'a2', 'a3'], counts: ['small'] }),
      group({ id: 'small', label: 'Small', need: 1, from: ['a1'] }),
    ])
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 1 }, CATALOGUE, rules)
    const big = p.groups.find((g) => g.id === 'big')!
    assert.deepEqual(big.assigned, [])
    assert.deepEqual(big.credited, ['a1'])
    assert.equal(big.have, 1)
  })

  it('charges a parent and its children once, not twice', () => {
    // Three of the big group's three courses *are* the small groups' courses. The bill is 3,
    // not 3 + 1 + 1 + 1. Summing them instead would report this track closed to a freshman,
    // which is how the real Mathematics track first came out wrong.
    const t = track('t', [
      group({ id: 'big', label: 'Big', need: 3, from: ['a1', 'a2', 'a3'], counts: ['s1', 's2'] }),
      group({ id: 's1', label: 'S1', need: 1, from: ['a1'] }),
      group({ id: 's2', label: 'S2', need: 1, from: ['a2'] }),
    ])
    const p = trackProgress(t, { taken: [], termsUsed: 1 }, CATALOGUE, rules)
    assert.equal(p.needMore, 3)
  })

  it('charges the children when they outnumber the parent’s need', () => {
    // Two breadth courses and a parent needing only one: the bill is the children's, 2.
    const t = track('t', [
      group({ id: 'big', label: 'Big', need: 1, from: ['a1', 'a2'], counts: ['s1', 's2'] }),
      group({ id: 's1', label: 'S1', need: 1, from: ['a1'] }),
      group({ id: 's2', label: 'S2', need: 1, from: ['a2'] }),
    ])
    assert.equal(trackProgress(t, { taken: [], termsUsed: 1 }, CATALOGUE, rules).needMore, 2)
  })
})

describe('trackProgress: abstract slots', () => {
  const t = track('t', [
    group({ id: 'real', label: 'Real', need: 1, from: ['a1'] }),
    group({ id: 'deliverable', label: 'Thesis', kind: 'course', need: 1, from: ['a_thesis'] }),
  ])

  it('reports a reference that is not a course rather than treating it as free or as broken', () => {
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 1 }, CATALOGUE, rules)
    const g = p.groups.find((x) => x.id === 'deliverable')!
    assert.deepEqual(g.abstractSlots, ['a_thesis'])
    assert.deepEqual(g.routes, [])
    assert.equal(g.state, 'open')
    // It still costs a slot: a thesis is a term's work even though you cannot shop for it.
    assert.equal(p.needMore, 1)
    assert.match(p.reasons.join('\n'), /no course in content satisfies this — a_thesis/)
  })

  it('calls a track unplannable when every unmet group is abstract', () => {
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 1 }, CATALOGUE, rules)
    assert.equal(p.status, 'unplannable')
    assert.match(p.reasons[0] ?? '', /Nothing left to plan/)
  })

  it('flags a group that runs out of real routes before it runs out of need', () => {
    // Needs three, has two courses and one placeholder. "3 more of 2 remaining routes" is
    // arithmetic the player is right to distrust, so it says which slots are not courses.
    const short = track('t', [
      group({ id: 'g', label: 'Core', need: 3, from: ['a1', 'a2', 'a_advanced'] }),
    ])
    const g = trackProgress(short, { taken: [], termsUsed: 1 }, CATALOGUE, rules).groups[0]!
    assert.equal(g.dependsOnAbstract, true)
    const p = trackProgress(short, { taken: [], termsUsed: 1 }, CATALOGUE, rules)
    assert.match(p.reasons.join('\n'), /only 2 courses in content can serve it/)
  })
})

describe('trackProgress: status, and the reason for it', () => {
  const wide = (need: number) =>
    track('t', [group({ id: 'g', label: 'Core', need, from: ['a1', 'a2', 'a3', 'b1', 'b2', 'c1'] })])

  it('is done when every required group is satisfied', () => {
    const p = trackProgress(wide(2), { taken: ['a1', 'a2'], termsUsed: 1 }, CATALOGUE, rules)
    assert.equal(p.status, 'done')
    assert.equal(p.needMore, 0)
  })

  it('is closed with both numbers named when the slots run out', () => {
    // Seven terms used, so one term of four slots remains against a need of six.
    const p = trackProgress(wide(6), { taken: [], termsUsed: 7 }, CATALOGUE, rules)
    assert.equal(p.status, 'closed')
    assert.match(p.reasons[0] ?? '', /Needs 6 more courses and 4 slots remain \(1 term × 4\)/)
  })

  it('is tight when every remaining slot is spoken for', () => {
    const p = trackProgress(wide(4), { taken: [], termsUsed: 7 }, CATALOGUE, rules)
    assert.equal(p.status, 'tight')
    assert.equal(p.slack, 0)
  })

  it('is reachable with slack otherwise, and says how much', () => {
    const p = trackProgress(wide(2), { taken: [], termsUsed: 1 }, CATALOGUE, rules)
    assert.equal(p.status, 'slack')
    assert.equal(p.slotsLeft, 28)
    assert.equal(p.slack, 26)
  })

  it('does not let an optional group close a track', () => {
    // Honors is thesis-gated in the Mathematics track: not writing one costs you honors, not
    // the concentration. An optional group that counted toward `needMore` would close the
    // track for everyone who is merely not seeking honors.
    const t = track('t', [
      group({ id: 'core', label: 'Core', need: 1, from: ['a1'] }),
      group({ id: 'thesis', label: 'Thesis', need: 1, from: ['a_thesis'], optional: true }),
    ])
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 7 }, CATALOGUE, rules)
    assert.equal(p.status, 'done')
    assert.equal(p.needMore, 0)
  })

  it('names courses that count toward nothing here', () => {
    const p = trackProgress(wide(1), { taken: ['a1', 'c1', 'b2'], termsUsed: 1 }, CATALOGUE, rules)
    assert.deepEqual(p.counted, ['a1'])
    assert.deepEqual(p.wasted, ['c1', 'b2'])
  })
})

describe('trackProgress: sequences are the only ordering content expresses', () => {
  const t = track('t', [
    group({ id: 'seq', label: 'Intro sequence', kind: 'sequence', need: 2, sequence: ['a1', 'a2'] }),
  ])

  it('names the next course in the authored order', () => {
    const p = trackProgress(t, { taken: ['a1'], termsUsed: 1 }, CATALOGUE, rules)
    assert.equal(p.groups[0]?.next, 'a2')
    assert.match(p.reasons.join('\n'), /must be taken in order; next is a2, and 1 of 2 remain/)
  })

  it('is undefined once the sequence is complete', () => {
    const p = trackProgress(t, { taken: ['a1', 'a2'], termsUsed: 1 }, CATALOGUE, rules)
    assert.equal(p.groups[0]?.next, undefined)
    assert.equal(p.groups[0]?.state, 'done')
  })
})

describe('studyPlan runs every track, always', () => {
  const tracks = [
    track('closed_one', [group({ id: 'g', label: 'G', need: 8, from: ['a1', 'a2', 'a3', 'b1', 'b2', 'c1', 'x1', 'x2'] })]),
    track('reachable', [group({ id: 'g', label: 'G', need: 1, from: ['a1'] })]),
    track('advanced', [group({ id: 'g', label: 'G', need: 2, from: ['a1', 'a2'] })]),
  ]

  it('sorts reachable before closed, and the most advanced first', () => {
    // §3.4: the point of running all of them is telling you a track you were not thinking
    // about just moved, so the list must be ordered by where you actually are.
    const plan = studyPlan({ taken: ['a1', 'a2'], termsUsed: 7 }, tracks, CATALOGUE, rules)
    assert.deepEqual(plan.map((p) => p.trackId), ['advanced', 'reachable', 'closed_one'])
    assert.equal(plan[0]?.status, 'done')
    assert.equal(plan[2]?.status, 'closed')
  })

  it('reports every track, not just the satisfiable ones', () => {
    assert.equal(studyPlan({ taken: [], termsUsed: 1 }, tracks, CATALOGUE, rules).length, 3)
  })
})

describe('countsToward: what a single row in shopping week says', () => {
  const tracks = [
    track('t1', [group({ id: 'core', label: 'Core', from: ['a1', 'a2'] })]),
    track('t2', [
      group({ id: 'wide', label: 'Wide', from: ['a1'] }),
      group({ id: 'other', label: 'Other', from: ['b1'] }),
    ]),
  ]

  it('names every group in every track a course could serve', () => {
    const rows = countsToward('a1', tracks)
    assert.deepEqual(
      rows.map((r) => `${r.trackId}/${r.groupId}`),
      ['t1/core', 't2/wide'],
    )
    assert.equal(rows[0]?.groupLabel, 'Core')
  })

  it('is empty for a course no track wants, which is a real thing to know', () => {
    assert.deepEqual(countsToward('c1', tracks), [])
  })
})

describe('openingRoutes: the fourth output (r11)', () => {
  const levels: Levels = { ...zeroLevels(), math: -2 }
  const catalogue = [
    course('hard', { math: 3 }),
    course('easier', { math: 1 }),
    course('easiest', { math: 0 }),
    course('alsohard', { math: 3 }),
    course('unrelated', { writing: 2 }),
  ]

  it('names the cheaper courses that ask for the tag that is blocking you', () => {
    // math 3 against level −2 is a gap of 5: not survivable, so the course is shut (§4.5).
    const routes = openingRoutes('hard', levels, catalogue)
    assert.equal(routes.length, 1)
    assert.equal(routes[0]?.tag, 'math')
    assert.equal(routes[0]?.gap, 5)
    // Cheapest first, and `alsohard` is excluded because it is shut for the same reason.
    assert.deepEqual(routes[0]?.via.map((v) => v.courseCode), ['easiest', 'easier'])
  })

  it('says nothing when the gap is survivable, because then there is nothing to route around', () => {
    assert.deepEqual(openingRoutes('easier', levels, catalogue), [])
  })

  it('says nothing about a course that is not in the catalogue', () => {
    assert.deepEqual(openingRoutes('nosuch', levels, catalogue), [])
  })
})
