import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BAND_COUNT, minutesOfClock } from '../src/bands.ts'
import {
  eventIdFor,
  meetingEvents,
  meetingKeyFor,
  placeMeetings,
  termPlan,
} from '../src/schedule.ts'
import { BLOCK_STARTS, zeroLevels } from '../src/schema.ts'
import type { Assignment, CourseSlot, Levels, Syllabus, Term } from '../src/schema.ts'

/** The real Fall 2026 calendar (`content/calendar/fall2026.yaml`) — 14 term weeks, with
 * Thanksgiving taking the whole of week 13. Copied rather than loaded because the engine
 * cannot read files; kept identical because week 13 is the interesting test case. */
const fall2026: Term = {
  id: 'fall2026',
  firstDay: '2026-09-01',
  lastDay: '2026-12-04',
  holidays: [
    '2026-09-07',
    '2026-10-12',
    '2026-11-23',
    '2026-11-24',
    '2026-11-25',
    '2026-11-26',
    '2026-11-27',
  ],
}

const base = {
  officeHours: [],
  sessions: [{ n: 1, topic: 'x' }],
  assignments: [] as Assignment[],
}

/** A published time, and a Monday/Wednesday lecture nobody takes attendance at. */
const cs50: Syllabus = {
  ...base,
  id: '050',
  courseCode: 'cs50',
  title: 'Introduction to Computer Science',
  demand: 7,
  demands: { code: 2, math: 1 },
  meetings: [
    { type: 'lecture', days: ['Mon', 'Wed'], time: '09:00-10:30', size: 850, attendance: 'flexible', sections: false },
    { type: 'section', days: ['Tue'], size: 20, attendance: 'mandatory', sections: true, pattern: 'TTh' },
  ],
}

/** A pattern and no time — the 169-of-335 case the derivation exists for. */
const math21b: Syllabus = {
  ...base,
  id: '121',
  courseCode: 'math21b',
  title: 'Linear Algebra',
  demand: 8,
  demands: { math: 3 },
  meetings: [
    { type: 'lecture', days: ['Mon', 'Wed', 'Fri'], pattern: 'MWF', size: 120, attendance: 'flexible', sections: false },
  ],
}

/** A three-hour Thursday lab, mandatory — the long-meeting placement case. */
const ls1a: Syllabus = {
  ...base,
  id: '200',
  courseCode: 'ls1a',
  title: 'An Integrated Introduction to the Life Sciences',
  demand: 9,
  demands: { lab: 2, memorization: 2 },
  meetings: [
    { type: 'lab', days: ['Thu'], pattern: 'Th', size: 24, attendance: 'mandatory', sections: false },
  ],
}

const slot011: CourseSlot = {
  id: '050',
  section: '011',
  courseCode: 'cs50',
  type: 'section',
  days: ['Tue'],
  time: '09:00-11:45',
  size: 20,
  attendance: 'mandatory',
  demand: 7,
  occupied: 0,
}

const at = (overrides: Partial<Levels>): Levels => ({ ...zeroLevels(), ...overrides })
const find = <T,>(xs: T[], p: (x: T) => boolean): T => {
  const hit = xs.find(p)
  assert.ok(hit, 'fixture lookup failed')
  return hit
}

describe('placeMeetings', () => {
  it('keeps an authored time and marks it published', () => {
    const lecture = find(placeMeetings(cs50), (m) => m.type === 'lecture')
    assert.equal(lecture.time, '09:00-10:30')
    assert.equal(lecture.derivedTime, false)
    // 09:00-10:30 covers band 2 (09:00-10:15) and touches band 3 (from 10:30) not at all.
    assert.deepEqual({ startBand: lecture.startBand, endBand: lecture.endBand }, { startBand: 2, endBand: 3 })
  })

  it('derives a start slot for a pattern-only meeting, off the real block grid', () => {
    const lecture = find(placeMeetings(math21b), (m) => m.type === 'lecture')
    assert.equal(lecture.derivedTime, true)
    const [start, end] = lecture.time.split('-')
    assert.ok(BLOCK_STARTS.includes(start as (typeof BLOCK_STARTS)[number]), `${start} is not a block start`)
    // MWF is 50 minutes per day — the derivation must not invent a duration either.
    assert.equal(minutesOfClock(end!) - minutesOfClock(start!), 50)
  })

  it('derives the same time every call, and a different one per meeting type', () => {
    // The property the whole approach rests on: a lecture hour is a fact about the course, so
    // two players must see it identically, and a reload must not move it.
    assert.equal(placeMeetings(math21b)[0]!.time, placeMeetings(math21b)[0]!.time)

    const twoMeetings: Syllabus = {
      ...math21b,
      meetings: [
        ...math21b.meetings,
        { type: 'lab', days: ['Mon', 'Wed', 'Fri'], pattern: 'MWF', size: 20, attendance: 'mandatory', sections: false },
      ],
    }
    const [lecture, lab] = placeMeetings(twoMeetings)
    // Keyed on type as well as course, so a course never collides with itself.
    assert.notEqual(lecture!.time, lab!.time)
  })

  it('never runs a derived long meeting past the dinner anchor', () => {
    // Regression: the first version put this three-hour lab at 19:30-22:30, through dinner
    // and into Night.
    const lab = find(placeMeetings(ls1a), (m) => m.type === 'lab')
    assert.equal(minutesOfClock(lab.time.split('-')[1]!) <= 18 * 60, true, `lab ends at ${lab.time}`)
  })

  it('lets a chosen section stand in for the meeting it instantiates', () => {
    const placed = placeMeetings(cs50, slot011)
    // Two rows, not three: the abstract `sections: true` meeting is gone, replaced by the
    // concrete slot. Scheduling both would double-book the player against a phantom.
    assert.equal(placed.length, 2)
    const section = find(placed, (m) => m.type === 'section')
    assert.equal(section.section, '011')
    assert.equal(section.time, '09:00-11:45')
    assert.equal(section.derivedTime, false)
  })
})

describe('meetingEvents', () => {
  it('makes one recurring event per meeting-day, with the term holidays excepted', () => {
    const events = meetingEvents(placeMeetings(math21b), fall2026)
    assert.equal(events.length, 3) // Mon, Wed, Fri
    for (const e of events) {
      assert.equal(e.kind, 'recur')
      assert.deepEqual(e.kind === 'recur' ? e.except : [], fall2026.holidays)
    }
  })

  it('marks only mandatory attendance hard — a skippable lecture is a choice, not an error', () => {
    const [lectureEvent] = meetingEvents(placeMeetings(cs50).filter((m) => m.type === 'lecture'), fall2026)
    assert.equal(lectureEvent!.hard, false)
    const [labEvent] = meetingEvents(placeMeetings(ls1a), fall2026)
    assert.equal(labEvent!.hard, true)
  })

  it('keys a recurrence by weekday but a meeting without one', () => {
    const lab = placeMeetings(ls1a)[0]!
    assert.equal(meetingKeyFor(lab), 'ls1a:lab')
    assert.equal(eventIdFor(lab, 'Thu'), 'ls1a:lab:Thu')
  })
})

describe('termPlan', () => {
  const levels = at({ math: 2, writing: -1 })

  it('empties Thanksgiving week rather than only appearing to', () => {
    const plan = termPlan([{ syllabus: cs50, slot: slot011 }, { syllabus: math21b }], levels, fall2026)
    const week13 = find(plan.weeks, (w) => w.week === 13)
    assert.equal(week13.monday, '2026-11-23')
    // Every band of all seven days free: the holidays went into `except`, so the expansion
    // itself knows the classes didn't meet.
    assert.equal(week13.freeBands, 7 * BAND_COUNT)
    assert.equal(week13.due.length, 0)
    assert.equal(week13.pressure, 0)
  })

  it('folds a recurring clash into one row per meeting pair, not one per weekday', () => {
    const plan = termPlan([{ syllabus: cs50 }, { syllabus: math21b }], levels, fall2026)
    // CS50's published 09:00 lecture and Math 21b's derived one share Mon and Wed. Folding on
    // the event id would have given two rows (a Monday one and a Wednesday one) for one fact.
    assert.equal(plan.collisions.length, 1)
    const [clash] = plan.collisions
    assert.equal(clash!.a, 'cs50:lecture')
    assert.equal(clash!.b, 'math21b:lecture')
    assert.ok(clash!.dates.length > 20, `only ${clash!.dates.length} dates`)
    assert.deepEqual(clash!.dates, [...clash!.dates].sort())
    // Neither is mandatory, so this is a decision about which lecture to attend.
    assert.equal(clash!.severity, 'soft')
    // And it rests on a guessed hour, which the view has to be able to say.
    assert.equal(clash!.derived, true)
    // The per-day list is still there for a single day's view.
    assert.equal(plan.conflicts.length, clash!.dates.length)
  })

  it('grades a clash between two mandatory meetings hard', () => {
    const rival: Syllabus = {
      ...ls1a,
      id: '201',
      courseCode: 'ls1b',
      title: 'A Rival Lab',
      meetings: [
        { type: 'lab', days: ['Tue'], time: '09:00-11:45', size: 24, attendance: 'mandatory', sections: false },
      ],
    }
    const plan = termPlan([{ syllabus: cs50, slot: slot011 }, { syllabus: rival }], levels, fall2026)
    const clash = find(plan.collisions, (c) => c.severity === 'hard')
    assert.equal(clash.derived, false) // both times published
    assert.deepEqual([clash.a, clash.b].sort(), ['cs50:section:011', 'ls1b:lab'])
  })

  it('buckets deadlines by term week and prices each one against the player', () => {
    const withPsets: Syllabus = {
      ...math21b,
      assignments: [
        { id: 'ps1', kind: 'pset', assigned: { week: 1, session: 1 }, due: { week: 2, session: 1 }, estHours: 6, weight: 0.25, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
        { id: 'ps2', kind: 'pset', assigned: { week: 2, session: 1 }, due: { week: 4, session: 1 }, estHours: 6, weight: 0.25, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
      ],
    }
    // Math 21b asks math 3. At math 2 the gap is 1 (x1.25); at math -1 it is 4 (x3.5).
    const ahead = termPlan([{ syllabus: withPsets }], at({ math: 2 }), fall2026)
    const behind = termPlan([{ syllabus: withPsets }], at({ math: -1 }), fall2026)

    const w2 = (p: typeof ahead) => find(p.weeks, (w) => w.week === 2)
    assert.equal(w2(ahead).due.length, 1)
    assert.equal(w2(ahead).due[0]!.assignmentId, 'ps1')
    assert.equal(w2(ahead).baseHours, 6)
    assert.equal(w2(ahead).personalHours, 7.5) // 6 x 1.25
    // Same authored cost, a different term.
    assert.equal(w2(behind).baseHours, 6)
    assert.equal(w2(behind).personalHours, 21) // 6 x 3.5
    // Weeks with nothing due stay in the list — an empty week is information.
    assert.equal(find(ahead.weeks, (w) => w.week === 3).due.length, 0)
    assert.equal(find(ahead.weeks, (w) => w.week === 4).due.length, 1)
  })

  it('names the peak week rather than grading weeks against an invented threshold', () => {
    const crunch: Syllabus = {
      ...math21b,
      assignments: [
        { id: 'small', kind: 'pset', due: { week: 2, session: 1 }, estHours: 2, weight: 0.2, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
        { id: 'big', kind: 'pset', due: { week: 5, session: 1 }, estHours: 20, weight: 0.4, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
      ],
    }
    const plan = termPlan([{ syllabus: crunch }], at({ math: 3 }), fall2026)
    assert.deepEqual(plan.peakWeeks, [5])
  })

  it('falls back to authored hours past the not-survivable gap instead of summing Infinity', () => {
    const withPset: Syllabus = {
      ...math21b,
      assignments: [
        { id: 'ps1', kind: 'pset', due: { week: 2, session: 1 }, estHours: 6, weight: 0.25, dependsOnSessions: [], coversSessions: [], stages: [], notes: [] },
      ],
    }
    // Math 21b asks math 3; at math -2 the gap is 5, which is the not-survivable line.
    const plan = termPlan([{ syllabus: withPset }], at({ math: -2 }), fall2026)
    const w2 = find(plan.weeks, (w) => w.week === 2)
    assert.equal(w2.personalHours, 6)
    assert.equal(Number.isFinite(w2.pressure), true)
    for (const w of plan.weeks) assert.equal(Number.isFinite(w.personalHours), true)
  })

  it('covers every day of the term exactly once, in order', () => {
    const plan = termPlan([{ syllabus: cs50, slot: slot011 }], at({}), fall2026)
    assert.equal(plan.days[0]!.date, fall2026.firstDay)
    assert.equal(plan.days[plan.days.length - 1]!.date, fall2026.lastDay)
    assert.equal(new Set(plan.days.map((d) => d.date)).size, plan.days.length)
    assert.deepEqual(plan.days.map((d) => d.date), [...plan.days.map((d) => d.date)].sort())
  })
})
