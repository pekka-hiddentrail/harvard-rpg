import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fitSessions, resolveAssignmentDates, resolveCourseWeek } from '../src/calendar/fitSessions.ts'
import type { Syllabus, Term } from '../src/schema.ts'

const term: Term = {
  id: 'test-term',
  firstDay: '2026-09-01', // a Tuesday
  lastDay: '2026-10-02',
  holidays: ['2026-09-07'], // the first Monday
}

const mwCourse: Syllabus = {
  id: '001',
  courseCode: 'test',
  title: 'Test Course',
  demand: 5,
  workloadHint: '~5h/week',
  demands: {},
  meetings: [{ type: 'lecture', days: ['Mon', 'Wed'], size: 10, attendance: 'flexible', sections: false }],
  officeHours: [{ type: 'officeHour', length: 'free', booked: false, days: ['Fri'], time: '14:00-15:00', location: 'Somewhere', demand: 4 }],
  sessions: [1, 2, 3, 4, 5].map((n) => ({ n, topic: `Session ${n}` })),
  assignments: [],
}

describe('fitSessions', () => {
  it('skips the holiday, so session 1 is the Wednesday it actually met', () => {
    // Scoped to exactly 5 real MW meetings (Sep 2, 9, 14, 16, 21) once the Sep 7 holiday
    // is excluded, matching `mwCourse`'s 5 authored sessions.
    const shortTerm: Term = { ...term, lastDay: '2026-09-21' }
    const dated = fitSessions(mwCourse, shortTerm)
    // Sep 1 term start is a Tuesday; Mon Sep 7 is a holiday, so the first MW meeting is
    // Wed Sep 2, not Mon Sep 7.
    assert.equal(dated[0]?.date, '2026-09-02')
    assert.equal(dated[1]?.date, '2026-09-09')
  })
})

describe('resolveCourseWeek', () => {
  it('anchors week 1 on the Monday on or before the term firstDay', () => {
    // firstDay 2026-09-01 is a Tuesday, so week 1's Monday is 2026-08-31.
    assert.equal(resolveCourseWeek({ week: 1, day: 'Mon' }, mwCourse, term), '2026-08-31')
  })

  it('resolves `day` by plain weekday arithmetic, independent of the course pattern', () => {
    assert.equal(resolveCourseWeek({ week: 1, day: 'Thu' }, mwCourse, term), '2026-09-03')
  })

  it('resolves `session` against the course’s own real meetings, holiday-proof', () => {
    // Week 2 (2026-09-07..13) has a holiday on Monday the 7th, so this course's only real
    // meeting that week is Wednesday the 9th — "week 2 session 1" must be that date, not a
    // date that never happened.
    assert.equal(resolveCourseWeek({ week: 2, session: 1 }, mwCourse, term), '2026-09-09')
  })

  it('throws when a week does not have the requested session', () => {
    assert.throws(() => resolveCourseWeek({ week: 2, session: 2 }, mwCourse, term), /no session 2/)
  })
})

describe('resolveAssignmentDates', () => {
  it('resolves assigned/due/date and stage dates onto real ISO strings', () => {
    const course: Syllabus = {
      ...mwCourse,
      assignments: [
        {
          id: 'ps1',
          kind: 'pset',
          assigned: { week: 1, session: 1 },
          due: { week: 2, session: 1 },
          weight: 0.5,
          dependsOnSessions: [],
          coversSessions: [],
          stages: [{ id: 'draft', due: { week: 1, day: 'Fri' } }],
          notes: [],
        },
      ],
    }
    const [resolved] = resolveAssignmentDates(course, term)
    assert.equal(resolved?.assigned, '2026-09-02')
    assert.equal(resolved?.due, '2026-09-09') // week 2's holiday-shifted session 1
    assert.equal(resolved?.stages[0]?.due, '2026-09-04')
  })
})
