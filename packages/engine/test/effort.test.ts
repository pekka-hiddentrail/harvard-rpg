import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkSemesterEffort,
  courseworkHoursPerWeek,
  deriveBrackets,
  drawCount,
  effortScore,
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
