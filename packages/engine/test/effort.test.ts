import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkSemesterEffort,
  courseworkHoursPerWeek,
  deriveBrackets,
  drawCount,
  effectiveDemand,
  effectiveOfficeHourDemand,
  effectiveWorkloadHint,
  effortScore,
  examSitHoursPerWeek,
  meetingHoursPerWeek,
  rawWeeklyHours,
} from '../src/effort.ts'
import type { Assignment, Syllabus } from '../src/schema.ts'

// Minimal reconstructions of the real authored content (content/courses/*.yaml), just
// enough of `meetings`/`assignments`/`demands` to exercise the derivation. Numbers are
// cross-checked against the real files in comments below.

const cs50Psets: Assignment[] = [
  { id: 'ps0', kind: 'pset', assigned: { week: 1, session: 1 }, due: { week: 3, session: 1 }, estHours: 6, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps1', kind: 'pset', assigned: { week: 3, session: 1 }, due: { week: 4, session: 1 }, estHours: 8, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps2', kind: 'pset', assigned: { week: 4, session: 1 }, due: { week: 5, session: 1 }, estHours: 8, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps3', kind: 'pset', assigned: { week: 5, session: 1 }, due: { week: 6, session: 1 }, estHours: 9, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps4', kind: 'pset', assigned: { week: 6, session: 1 }, due: { week: 7, session: 1 }, estHours: 9, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps5', kind: 'pset', assigned: { week: 7, session: 1 }, due: { week: 8, session: 2 }, estHours: 9, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps6', kind: 'pset', assigned: { week: 8, session: 2 }, due: { week: 9, session: 2 }, estHours: 7, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps7', kind: 'pset', assigned: { week: 9, session: 2 }, due: { week: 10, session: 2 }, estHours: 7, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps8', kind: 'pset', assigned: { week: 10, session: 2 }, due: { week: 12, session: 1 }, estHours: 9, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
  { id: 'ps9', kind: 'pset', assigned: { week: 12, session: 1 }, due: { week: 14, session: 1 }, estHours: 7, weight: 0.05, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
]
// sum = 79, span (wk1 -> wk14) = 14 weeks -> 79/14 = 5.642857...

const cs50FinalProject: Assignment = {
  id: 'final_project',
  kind: 'project',
  assigned: { week: 8, day: 'Sun' },
  due: { week: 15, day: 'Mon' },
  weight: 0.5,
  dependsOnSessions: [],
  coversSessions: [],
  stages: [{ id: 'proposal', due: { week: 11, day: 'Sun' } }],
  notes: [],
}

const cs50: Syllabus = {
  id: '050',
  courseCode: 'cs50',
  title: 'CS50',
  demand: 7,
  workloadHint: '~12h/week',
  demands: { code: 2, math: 1 },
  meetings: [{ type: 'lecture', days: ['Mon', 'Wed'], time: '09:00-10:30', size: 850, attendance: 'flexible', sections: false }],
  officeHours: [{ type: 'officeHour', length: 'free', booked: false, days: ['Thu'], time: '19:00-23:00', location: 'x', demand: 6 }],
  sessions: [{ n: 1, topic: 'x' }],
  assignments: [...cs50Psets, cs50FinalProject],
}

describe('meetingHoursPerWeek', () => {
  it('reads an explicit time range x days/week for CS50s lecture', () => {
    // Mon+Wed, 09:00-10:30 = 1.5h x 2 = 3h/week
    assert.ok(Math.abs(meetingHoursPerWeek(cs50.meetings) - 3) < 1e-9)
  })
})

describe('courseworkHoursPerWeek', () => {
  it('is total pset hours over the weeks they actually span, not an average per item', () => {
    assert.ok(Math.abs(courseworkHoursPerWeek(cs50Psets) - 79 / 14) < 1e-6)
  })

  it('is 0 when nothing in the course carries estHours (e.g. an essay-only syllabus today)', () => {
    assert.equal(courseworkHoursPerWeek([cs50FinalProject]), 0)
  })
})

describe('examSitHoursPerWeek', () => {
  const midterm1: Assignment = { id: 'mt1', kind: 'exam', date: { week: 6, day: 'Thu' }, time: '18:00-21:00', weight: 0.2, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] }
  const midterm2: Assignment = { id: 'mt2', kind: 'exam', date: { week: 10, day: 'Thu' }, time: '18:00-21:00', weight: 0.2, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] }
  // No `time` authored -- real department policy not yet published, matching Math21b's own final.
  const final: Assignment = { id: 'final', kind: 'final', date: { week: 16, day: 'Wed' }, weight: 0.35, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] }
  const math21bLike: Syllabus = { ...cs50, assignments: [...cs50Psets, midterm1, midterm2, final] }

  it('sums sit-time (falling back to a default 3h when time is unauthored) over the full course span', () => {
    // span = wk16 - wk1 + 1 = 16; sit-time = 3 + 3 + 3(default) = 9 -> 9/16
    assert.ok(Math.abs(examSitHoursPerWeek(math21bLike) - 9 / 16) < 1e-6)
  })

  it('is 0 for a course with no exam/final assignments', () => {
    assert.equal(examSitHoursPerWeek(cs50), 0)
  })
})

describe('rawWeeklyHours / effortScore — CS50', () => {
  it('under-counts without a section length, since sections live outside `meetings`', () => {
    const raw = rawWeeklyHours(cs50)
    assert.ok(Math.abs(raw - (3 + 79 / 14)) < 1e-6)
    // effort = round((8.64 + demands(2+1)) / 2) = round(5.82) = 6 -- known-incomplete.
    assert.equal(effortScore(cs50), 6)
  })

  it('matches the decided value (7) once a representative section length is supplied', () => {
    // Real CS50 sections are 2h45m = 2.75h/week (content/sections.yaml).
    assert.equal(effortScore(cs50, 2.75), 7)
  })
})

describe('the three fields a stub does not have to author', () => {
  // A stub off the spreadsheet carries tags, a meeting pattern and office-hour locations —
  // and nothing else. These are what fills the rest in (§4.1).
  // Dropped by destructuring rather than set to `undefined`: `exactOptionalPropertyTypes`
  // draws the distinction, and "absent" is the state a stub is actually in.
  const { demand: _demand, workloadHint: _hint, ...cs50WithoutTheTwo } = cs50
  const { demand: _ohDemand, ...officeHourWithoutDemand } = cs50.officeHours[0]!
  const stub: Syllabus = {
    ...cs50WithoutTheTwo,
    courseCode: 'stub',
    assignments: [],
    officeHours: [officeHourWithoutDemand],
  }

  it('takes the authored value whenever a human pinned one', () => {
    assert.equal(effectiveDemand(cs50, 2.75), 7)
    assert.equal(effectiveWorkloadHint(cs50), '~12h/week')
    assert.equal(effectiveOfficeHourDemand(cs50, cs50.officeHours[0]!, 2.75), 6)
  })

  it('derives demand from structure alone, clamped into 1-10', () => {
    // 3h of lecture + 2.75h section, no coursework yet: round((5.75 + 3) / 2) = 4.
    assert.equal(effectiveDemand(stub, 2.75), 4)
  })

  it('says outright that a stub knows only its contact time', () => {
    assert.equal(effectiveWorkloadHint(stub, 2.75), '~5.8h/week in class, coursework TBD')
    // Once assignments arrive the caveat drops off on its own — no second edit to remember.
    assert.equal(effectiveWorkloadHint({ ...stub, assignments: cs50.assignments }, 2.75), '~11.4h/week')
  })

  it('puts office hours one below the course, derived from a derived demand', () => {
    assert.equal(effectiveOfficeHourDemand(stub, stub.officeHours[0]!, 2.75), 3)
  })

  it('floors office-hour demand at 1, since 0 is not a legal value', () => {
    // A demand-1 course: nothing in the schema stops one, and `1 - 1` would fail to parse.
    const quiet: Syllabus = { ...stub, demand: 1 }
    assert.equal(effectiveOfficeHourDemand(quiet, stub.officeHours[0]!), 1)
  })
})

describe('deriveBrackets', () => {
  it('an explicit override always wins', () => {
    const overridden: Assignment = { ...cs50FinalProject, brackets: { moderate: 15, narrow: 20 } }
    assert.deepEqual(deriveBrackets(cs50, overridden), { moderate: 15, narrow: 20 })
  })

  it('derives from weight-share of the non-pset hour pool when no override is set', () => {
    const { moderate, narrow } = deriveBrackets(cs50, cs50FinalProject, 2.75)
    // weightTotal = 0.5 (only the final project is milestone-graded here)
    // -> narrow = milestonePool * (0.5/0.5) = milestonePool
    assert.ok(narrow > 0)
    assert.ok(moderate < narrow)
    assert.equal(moderate, Math.round(narrow * 0.625))
  })

  it('does not inflate the pool when the pset span and the full course span differ', () => {
    // Regression: this used to multiply a *rate* (rawWeeklyHours, computed over the
    // psets' own 14-week span) by the *full* 15-week course span (which the final
    // project's week-15 due date extends it to) -- silently overcounting coursework
    // hours by one week's worth. Using each component's own raw total instead:
    //   totalMeetingHours = (3 + 2.75) * 15 = 86.25   (course span, meetings recur weekly)
    //   totalExamSitHours = 0                          (no exam/final kind here)
    //   totalCourseworkHours = 79                      (raw pset total, no span involved)
    //   totalHours = 165.25, milestonePool = 165.25 - 79(psetHours) = 86.25
    //   narrow = round(86.25 * (0.5/0.5)) = 86, moderate = round(86 * 0.625) = 54
    const { moderate, narrow } = deriveBrackets(cs50, cs50FinalProject, 2.75)
    assert.equal(narrow, 86)
    assert.equal(moderate, 54)
  })
})

describe('drawCount', () => {
  it('psets never draw', () => {
    assert.equal(drawCount(cs50, cs50Psets[0]!), undefined)
  })
  it('a project draws 12', () => {
    assert.equal(drawCount(cs50, cs50FinalProject), 12)
  })

  it('essays escalate 4, 5, 6... capped at 8, in due-date order', () => {
    const essay = (id: string, week: number): Assignment => ({
      id,
      kind: 'essay',
      assigned: { week, session: 1 },
      due: { week: week + 3, session: 2 },
      weight: 0.2,
      dependsOnSessions: [],
      coversSessions: [],
      stages: [],
      notes: [],
    })
    const essays = [essay('essay1', 1), essay('essay2', 6), essay('essay3', 10)]
    const course: Syllabus = { ...cs50, assignments: essays }
    assert.equal(drawCount(course, essays[0]!), 4)
    assert.equal(drawCount(course, essays[1]!), 5)
    assert.equal(drawCount(course, essays[2]!), 6)
  })

  it('caps essay draws at 8 no matter how many essays a course has', () => {
    const essay = (id: string, week: number): Assignment => ({
      id,
      kind: 'essay',
      assigned: { week, session: 1 },
      due: { week: week + 2, session: 2 },
      weight: 0.1,
      dependsOnSessions: [],
      coversSessions: [],
      stages: [],
      notes: [],
    })
    const essays = Array.from({ length: 8 }, (_, i) => essay(`e${i}`, i * 3 + 1))
    const course: Syllabus = { ...cs50, assignments: essays }
    assert.equal(drawCount(course, essays.at(-1)!), 8)
  })
})

describe('checkSemesterEffort', () => {
  it('is a soft warning: it reports over, it does not throw or refuse', () => {
    const result = checkSemesterEffort([7, 8, 5, 10], 28)
    assert.equal(result.total, 30)
    assert.equal(result.over, true)
    assert.equal(result.overBy, 2)
  })

  it('is not over right at the cap', () => {
    const result = checkSemesterEffort([10, 10, 8], 28)
    assert.equal(result.over, false)
    assert.equal(result.overBy, 0)
  })
})
