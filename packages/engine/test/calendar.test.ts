import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyDay,
  classifyDensity,
  detectConflicts,
  detectConflictsInRange,
  expandEvents,
  freeBandCount,
  type CalendarEvent,
} from '../src/index.ts'

describe('calendar expansion', () => {
  it('expands weekly recurrence with exceptions', () => {
    const events: CalendarEvent[] = [
      {
        kind: 'recur',
        id: 'cs50-lecture',
        title: 'CS50 Lecture',
        weekday: 1,
        startBand: 5,
        endBand: 7,
        startDate: '2027-09-06',
        endDate: '2027-09-27',
        except: ['2027-09-13'],
      },
    ]

    const days = expandEvents(events, '2027-09-06', '2027-09-30')
    const occ = days.flatMap((d) => d.occurrences)
    assert.deepEqual(
      occ.map((o) => o.date),
      ['2027-09-06', '2027-09-20', '2027-09-27'],
    )
    assert.deepEqual(
      occ.map((o) => [o.startBand, o.endBand]),
      [
        [5, 7],
        [5, 7],
        [5, 7],
      ],
    )
  })

  it('supports every-two-weeks recurrence', () => {
    const events: CalendarEvent[] = [
      {
        kind: 'recur',
        id: 'section',
        title: 'Section',
        weekday: 2,
        startBand: 6,
        endBand: 7,
        startDate: '2027-09-07',
        endDate: '2027-10-05',
        everyWeeks: 2,
      },
    ]

    const days = expandEvents(events, '2027-09-07', '2027-10-05')
    assert.deepEqual(
      days.flatMap((d) => d.occurrences).map((o) => o.date),
      ['2027-09-07', '2027-09-21', '2027-10-05'],
    )
  })

  it('expands span events across multiple dates', () => {
    const events: CalendarEvent[] = [
      {
        kind: 'span',
        id: 'family-weekend',
        title: 'Family Weekend',
        startDate: '2027-10-15',
        endDate: '2027-10-17',
      },
    ]

    const days = expandEvents(events, '2027-10-14', '2027-10-18')
    const occ = days.flatMap((d) => d.occurrences)
    assert.deepEqual(occ.map((o) => o.date), ['2027-10-15', '2027-10-16', '2027-10-17'])
    assert.equal(occ[0]?.startBand, 0)
    assert.equal(occ[0]?.endBand, 11)
  })
})

describe('calendar conflicts', () => {
  it('reports hard conflicts when two hard events overlap', () => {
    const [day] = expandEvents(
      [
        { kind: 'once', id: 'a', title: 'Lecture A', date: '2027-09-10', startBand: 5, endBand: 7, hard: true },
        { kind: 'once', id: 'b', title: 'Lecture B', date: '2027-09-10', startBand: 6, endBand: 8, hard: true },
      ],
      '2027-09-10',
      '2027-09-10',
    )

    assert.ok(day)
    const conflicts = detectConflicts(day)
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0]?.severity, 'hard')
  })

  it('reports soft conflicts when either side is soft', () => {
    const days = expandEvents(
      [
        { kind: 'once', id: 'a', title: 'Study group', date: '2027-09-10', startBand: 7, endBand: 9, hard: false },
        { kind: 'once', id: 'b', title: 'Club social', date: '2027-09-10', startBand: 8, endBand: 10, hard: true },
      ],
      '2027-09-10',
      '2027-09-10',
    )

    const conflicts = detectConflictsInRange(days)
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0]?.severity, 'soft')
  })
})

describe('calendar density', () => {
  it('classifies day density thresholds', () => {
    assert.equal(classifyDensity(0), 'gone')
    assert.equal(classifyDensity(1), 'squeezed')
    assert.equal(classifyDensity(2), 'squeezed')
    assert.equal(classifyDensity(3), 'workable')
    assert.equal(classifyDensity(4), 'workable')
    assert.equal(classifyDensity(5), 'open')
  })

  it('computes free bands from occupied events', () => {
    const [day] = expandEvents(
      [
        { kind: 'once', id: 'a', title: 'Morning lecture', date: '2027-09-10', startBand: 2, endBand: 4 },
        { kind: 'once', id: 'b', title: 'Dinner', date: '2027-09-10', startBand: 8, endBand: 9 },
      ],
      '2027-09-10',
      '2027-09-10',
    )

    assert.ok(day)
    assert.equal(freeBandCount(day), 8)
    assert.equal(classifyDay(day), 'open')
  })
})
