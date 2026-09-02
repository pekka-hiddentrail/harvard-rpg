import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  checkCourseTargets,
  courseGrade,
  emptyCoursework,
  foldDay,
  itemKey,
  type AcademicState,
} from '../src/coursework.ts'
import { deriveBrackets } from '../src/effort.ts'
import { BASE_ACCRUAL_RATE, ISOLATED_STUDY_DISCOUNT, levelUpCost } from '../src/levels.ts'
import { zeroLevels, type Assignment, type Levels, type SubjectTag, type Syllabus, type Term } from '../src/schema.ts'

/**
 * The academic ledger (§4.4). What is being tested here is *bookkeeping*, not arithmetic —
 * `grading.test.ts` already pins the draw, the scoring curve and the bump order, so nothing
 * below re-checks those. These tests exist for the questions only a stateful fold can get
 * wrong: which item a band's hours landed in, whether the draw fired on the right day and
 * exactly once, and whether an hour banked twice or not at all.
 *
 * Every fixture is hand-built. Real content appears only in `packages/content/test`, where a
 * failure means the syllabi moved rather than the rules.
 */

const term: Term = { id: 'fall2026', firstDay: '2026-09-01', lastDay: '2026-12-04', holidays: [] }

const pset = (id: string, week: number, over: Partial<Assignment> = {}): Assignment => ({
  id,
  kind: 'pset',
  due: { week, day: 'Fri' },
  weight: 0.1,
  estHours: 8,
  dependsOnSessions: [],
  coversSessions: [],
  stages: [],
  notes: [],
  ...over,
})

const exam = (id: string, week: number, over: Partial<Assignment> = {}): Assignment => ({
  id,
  kind: 'exam',
  date: { week, day: 'Wed' },
  weight: 0.4,
  dependsOnSessions: [],
  coversSessions: [],
  stages: [],
  notes: [],
  ...over,
})

/** `code: 2, math: 1` — so `splitHoursByDemand` pays two thirds and one third, which is the
 * ratio the level-ledger tests read. */
const cs50 = (assignments: Assignment[]): Syllabus => ({
  id: '050',
  courseCode: 'cs50',
  title: 'Introduction to Computer Science',
  demand: 7,
  demands: { code: 2, math: 1 },
  officeHours: [],
  sessions: [{ n: 1, topic: 'x' }],
  meetings: [
    { type: 'lecture', days: ['Mon', 'Wed'], time: '09:00-10:30', size: 850, attendance: 'flexible', sections: false },
  ],
  assignments,
})

const ctx = (syllabus: Syllabus, saveSeed = 'seed-1') => ({
  saveSeed,
  term,
  syllabi: new Map([[syllabus.courseCode, syllabus]]),
})

const state = (levels: Levels = zeroLevels()): AcademicState => ({
  coursework: emptyCoursework(),
  levels: { ...levels },
  levelHours: Object.fromEntries((Object.keys(zeroLevels()) as SubjectTag[]).map((t) => [t, 0])) as Record<
    SubjectTag,
    number
  >,
})

const studied = (target: string, hours: number, activity = 'study') => [{ activity, target, hours }]

/**
 * A player who exactly meets CS 50's demands, so the demand gap is zero and an authored hour
 * estimate is also *their* hour estimate. `zeroLevels()` is emphatically not this: level 0
 * against `code: 2` is two levels down and pays §4.5's ×1.7, which is the right answer and a
 * confusing baseline to write assertions against.
 */
const onLevel: Levels = { ...zeroLevels(), code: 2, math: 1 }

describe('foldDay: where a band’s hours land', () => {
  it('banks a course-targeted band into that course’s nearest unfinished item', () => {
    const s = state()
    const syllabus = cs50([pset('ps1', 2), pset('ps2', 4)])
    const day = foldDay(s, '2026-09-07', studied('cs50', 3), ['cs50'], ctx(syllabus))

    // Week 2 Friday is 2026-09-11; week 4 Friday is 2026-09-25. The nearer one gets the hours.
    assert.equal(s.coursework.items[itemKey('cs50', 'ps1')]?.hours, 3)
    assert.equal(s.coursework.items[itemKey('cs50', 'ps2')]?.hours, 0)
    assert.deepEqual(day.pooled, { 'cs50/ps1': 3 })
  })

  it('moves on to the next item once the near one is graded, rather than banking into the past', () => {
    const s = state()
    const syllabus = cs50([pset('ps1', 2), pset('ps2', 4)])
    // Study through ps1's own due date, which grades it...
    foldDay(s, '2026-09-11', studied('cs50', 8), ['cs50'], ctx(syllabus))
    assert.notEqual(s.coursework.items[itemKey('cs50', 'ps1')]?.percentage, undefined)
    // ...and the next Monday's hours have nowhere to go but ps2.
    foldDay(s, '2026-09-14', studied('cs50', 2), ['cs50'], ctx(syllabus))
    assert.equal(s.coursework.items[itemKey('cs50', 'ps2')]?.hours, 2)
  })

  it('ignores a band aimed at a course that is not on the card', () => {
    // §9.3's shape, one layer down: `validatePlan` cannot check membership because it has no
    // catalogue, so a typo arrives here. Dropping it silently is right for the *fold* — the
    // action is already committed and replay has no reply channel — and it must not credit
    // some other course by accident.
    const s = state()
    const syllabus = cs50([pset('ps1', 2)])
    const day = foldDay(s, '2026-09-07', studied('psy15', 4), ['cs50'], ctx(syllabus))
    assert.deepEqual(day.pooled, {})
    assert.deepEqual(day.hoursByCourse, {})
    assert.equal(s.coursework.items[itemKey('cs50', 'ps1')]?.hours, 0)
  })

  it('banks nothing into a course with no items left, and still levels you', () => {
    const s = state()
    const syllabus = cs50([pset('ps1', 2)])
    foldDay(s, '2026-09-11', studied('cs50', 8), ['cs50'], ctx(syllabus))
    const before = s.levelHours.code
    // Every item graded; the term keeps going.
    const day = foldDay(s, '2026-11-02', studied('cs50', 4), ['cs50'], ctx(syllabus))
    assert.deepEqual(day.pooled, {})
    assert.ok(s.levelHours.code > before, 'leveling does not stop when grading does')
  })
})

describe('foldDay: the two ledgers', () => {
  it('splits a course band across every tag it demands, at the accrual rate', () => {
    const s = state()
    const syllabus = cs50([exam('midterm', 8)])
    foldDay(s, '2026-09-07', studied('cs50', 3), ['cs50'], ctx(syllabus))
    // code:2 math:1 over 3 hours is 2 h and 1 h, each at BASE_ACCRUAL_RATE and fully relevant.
    assert.equal(s.levelHours.code, 2 * BASE_ACCRUAL_RATE)
    assert.equal(s.levelHours.math, 1 * BASE_ACCRUAL_RATE)
    assert.equal(s.levelHours.writing, 0)
  })

  it('pays a lecture more than the library for the same hour, and no more pool progress', () => {
    const solo = state()
    const seat = state()
    const syllabus = cs50([exam('midterm', 8)])
    foldDay(solo, '2026-09-07', studied('cs50', 2), ['cs50'], ctx(syllabus))
    foldDay(seat, '2026-09-07', studied('cs50', 2, 'attend_class'), ['cs50'], ctx(syllabus))

    assert.ok(seat.levelHours.code > solo.levelHours.code, 'contact is worth more to the level')
    assert.equal(
      seat.coursework.items[itemKey('cs50', 'midterm')]?.hours,
      solo.coursework.items[itemKey('cs50', 'midterm')]?.hours,
      'an hour of pool progress is an hour either way',
    )
  })

  it('discounts study aimed at a tag nothing on the card demands', () => {
    const s = state()
    const syllabus = cs50([exam('midterm', 8)])
    foldDay(s, '2026-09-07', studied('language', 4), ['cs50'], ctx(syllabus))
    assert.equal(s.levelHours.language, 4 * BASE_ACCRUAL_RATE * ISOLATED_STUDY_DISCOUNT)
    // A bare subject buys no pool progress at all — it is not aimed at a course.
    assert.equal(s.coursework.items[itemKey('cs50', 'midterm')]?.hours, 0)
  })

  it('pays full rate for a subject band that a course does demand', () => {
    const s = state()
    foldDay(s, '2026-09-07', studied('code', 4), ['cs50'], ctx(cs50([exam('midterm', 8)])))
    assert.equal(s.levelHours.code, 4 * BASE_ACCRUAL_RATE)
  })

  it('spends banked hours on a level and carries the remainder', () => {
    const s = state()
    const syllabus = cs50([exam('midterm', 14)])
    // A level from 0 costs 100 level-hours. `code` takes two thirds of each band and then the
    // 0.6 accrual rate, so fifty six-hour days is 120 — over the line, with a remainder to
    // carry, which is the half of this the assertion below is actually about.
    for (let i = 0; i < 50; i++) {
      foldDay(s, '2026-09-07', studied('cs50', 6), ['cs50'], ctx(syllabus))
    }
    assert.ok(s.levels.code > 0, 'a term of nothing but CS moves the level')
    assert.ok(s.levelHours.code < levelUpCost(s.levels.code), 'the remainder carries, it does not reset')
  })

  it('reports the tag that crossed, so a day can say so', () => {
    const s = state({ ...zeroLevels(), code: 0 })
    s.levelHours.code = levelUpCost(0) - 0.1
    const day = foldDay(s, '2026-09-07', studied('code', 1), ['cs50'], ctx(cs50([exam('m', 14)])))
    assert.deepEqual(day.levelled, ['code'])
    assert.equal(s.levels.code, 1)
  })
})

describe('foldDay: the draw', () => {
  const syllabus = cs50([exam('midterm', 3)])
  // Week 3 Wednesday.
  const dueDate = '2026-09-16'

  it('does not fire three days out', () => {
    const s = state()
    const day = foldDay(s, '2026-09-13', studied('cs50', 2), ['cs50'], ctx(syllabus))
    assert.deepEqual(day.drawn, [])
    assert.equal(s.coursework.items[itemKey('cs50', 'midterm')]?.cards, undefined)
  })

  it('fires at T−48h and freezes the band the banked hours bought', () => {
    const s = state()
    const brackets = deriveBrackets(syllabus, syllabus.assignments[0]!)
    // Enough for `narrow`, so the assertion is about the band and not about a threshold.
    foldDay(s, '2026-09-08', studied('cs50', brackets.narrow), ['cs50'], ctx(syllabus))
    const day = foldDay(s, '2026-09-14', [], ['cs50'], ctx(syllabus))

    assert.deepEqual(day.drawn, ['cs50/midterm'])
    const item = s.coursework.items[itemKey('cs50', 'midterm')]!
    assert.equal(item.band, 'narrow')
    assert.equal(item.cards?.length, 8, 'an exam draws eight')
  })

  it('fires exactly once, however many days pass', () => {
    const s = state()
    foldDay(s, '2026-09-14', [], ['cs50'], ctx(syllabus))
    const first = [...(s.coursework.items[itemKey('cs50', 'midterm')]?.cards ?? [])]
    foldDay(s, '2026-09-15', [], ['cs50'], ctx(syllabus))
    assert.deepEqual(s.coursework.items[itemKey('cs50', 'midterm')]?.cards, first)
  })

  it('resolves before the same day’s hours, so §4.4’s Oct 18 recovery is possible', () => {
    // The worked example draws on Oct 18 and then banks six hours of bumping *that day*.
    // Folding hours first would put those six into the pool, and the two-day crisis would
    // have no recovery in it at all.
    const s = state()
    const day = foldDay(s, '2026-09-14', studied('cs50', 6), ['cs50'], ctx(syllabus))
    const item = s.coursework.items[itemKey('cs50', 'midterm')]!
    assert.deepEqual(day.drawn, ['cs50/midterm'])
    assert.equal(item.hours, 0, 'nothing reached the pool')
    assert.equal(item.extraHours, 6, 'all six bought bumps')
    assert.deepEqual(day.pooled, {})
  })

  it('bumps toward zero as the last hours go in, and grades on the due date', () => {
    const s = state()
    foldDay(s, '2026-09-14', [], ['cs50'], ctx(syllabus))
    const drawn = [...s.coursework.items[itemKey('cs50', 'midterm')]!.cards!]
    const distance = (cards: readonly number[]) => cards.reduce((sum, c) => sum + Math.abs(c), 0)

    const day = foldDay(s, dueDate, studied('cs50', 12), ['cs50'], ctx(syllabus))
    const item = s.coursework.items[itemKey('cs50', 'midterm')]!
    assert.ok(distance(item.cards!) < distance(drawn), 'twelve hours is six bumps')
    assert.deepEqual(day.graded, ['cs50/midterm'])
    assert.equal(typeof item.percentage, 'number')
  })

  it('is a function of the save and the item, so a reload cannot reroll it', () => {
    const a = state()
    const b = state()
    foldDay(a, '2026-09-14', [], ['cs50'], ctx(syllabus, 'same-seed'))
    foldDay(b, '2026-09-14', [], ['cs50'], ctx(syllabus, 'same-seed'))
    assert.deepEqual(
      a.coursework.items[itemKey('cs50', 'midterm')]?.cards,
      b.coursework.items[itemKey('cs50', 'midterm')]?.cards,
    )

    const other = state()
    foldDay(other, '2026-09-14', [], ['cs50'], ctx(syllabus, 'different-seed'))
    assert.notDeepEqual(
      a.coursework.items[itemKey('cs50', 'midterm')]?.cards,
      other.coursework.items[itemKey('cs50', 'midterm')]?.cards,
      'a different save gets a different exam',
    )
  })

  it('never draws for a pset — those grade on completion', () => {
    const s = state()
    const only = cs50([pset('ps1', 3)])
    foldDay(s, '2026-09-16', studied('cs50', 4), ['cs50'], ctx(only))
    const item = s.coursework.items[itemKey('cs50', 'ps1')]!
    assert.equal(item.cards, undefined)
    assert.equal(item.band, undefined)
  })
})

describe('foldDay: attendance', () => {
  const syllabus = cs50([pset('ps1', 4)])

  it('records the date you were in the room, once, per course', () => {
    const s = state()
    foldDay(
      s,
      '2026-09-07',
      [
        { activity: 'attend_class', target: 'cs50', hours: 1 },
        { activity: 'attend_class', target: 'cs50', hours: 1 },
      ],
      ['cs50'],
      ctx(syllabus),
    )
    assert.deepEqual(s.coursework.attended.cs50, ['2026-09-07'])
  })

  it('records nothing for a day you scheduled over the lecture', () => {
    const s = state()
    const day = foldDay(s, '2026-09-07', studied('cs50', 3), ['cs50'], ctx(syllabus))
    assert.deepEqual(day.attended, [])
    assert.equal(s.coursework.attended.cs50, undefined)
  })
})

describe('foldDay: psets grade on the hours they actually took', () => {
  it('gives full marks for meeting the personal estimate and less for missing it', () => {
    const full = state(onLevel)
    const half = state(onLevel)
    const syllabus = cs50([pset('ps1', 2, { estHours: 6 })])
    foldDay(full, '2026-09-11', studied('cs50', 6), ['cs50'], ctx(syllabus))
    foldDay(half, '2026-09-11', studied('cs50', 3), ['cs50'], ctx(syllabus))

    assert.equal(full.coursework.items[itemKey('cs50', 'ps1')]?.percentage, 100)
    assert.equal(half.coursework.items[itemKey('cs50', 'ps1')]?.percentage, 50)
  })

  it('costs a player below the course’s demands more hours for the same marks', () => {
    // §4.5's demand gap, reaching the grade: the estimate is the *authored* one run through
    // this player's gaps, so eight hours is worth less to someone two levels down.
    const behind = state({ ...zeroLevels(), code: -2, math: -2 })
    const syllabus = cs50([pset('ps1', 2, { estHours: 6 })])
    foldDay(behind, '2026-09-11', studied('cs50', 6), ['cs50'], ctx(syllabus))
    assert.ok((behind.coursework.items[itemKey('cs50', 'ps1')]?.percentage ?? 100) < 100)
  })
})

describe('checkCourseTargets', () => {
  /**
   * Structurally the smallest thing the check reads. `indexActivities` output satisfies this
   * too, and saying it this way keeps the test about the rule rather than about `Activity`'s
   * twenty other fields.
   */
  const acts = new Map([
    ['attend_class', { name: 'Class', targets: 'course' }],
    ['study', { name: 'Study', targets: 'subjectOrCourse' }],
    ['read', { name: 'Reading', targets: 'subject' }],
    ['idle', { name: 'Idle', targets: 'none' }],
  ])
  const at = (activity: string, target?: string) => [
    { start: 4, activity, hours: 2, ...(target === undefined ? {} : { target }) },
  ]
  const check = (activity: string, target?: string) =>
    checkCourseTargets(at(activity, target), acts, ['cs50', 'math21b']).map((x) => x.code)

  it('accepts a course on the card, for either noun', () => {
    assert.deepEqual(check('attend_class', 'cs50'), [])
    assert.deepEqual(check('study', 'math21b'), [])
    assert.deepEqual(check('study', 'code'), [], 'a tag is still a tag')
  })

  it('catches the typo `validatePlan` had to let through', () => {
    // The whole reason this function exists. Without it `study ▸ basketry` commits and is then
    // silently dropped by the fold: an afternoon that counted toward nothing, with no error
    // anywhere (§9.3 asks for the opposite).
    assert.deepEqual(check('study', 'basketry'), ['not_enrolled'])
    assert.deepEqual(check('attend_class', 'chem17'), ['not_enrolled'], 'a real course you are not in')
  })

  it('refuses a subject where only a course will do', () => {
    // You cannot attend `math`. There is no room.
    assert.deepEqual(check('attend_class', 'math'), ['needs_course'])
  })

  it('leaves alone everything that is not its business', () => {
    // Shape errors and unknown activities are `validatePlan`'s, and it already reports them.
    // Double-reporting would put two errors on one band and read like two mistakes.
    assert.deepEqual(check('read', 'basketry'), [])
    assert.deepEqual(check('idle', 'cs50'), [])
    assert.deepEqual(check('attend_class'), [], 'a missing target is `no_target`, once')
    assert.deepEqual(check('nonesuch', 'cs50'), [])
  })

  it('points at the band that is wrong, so the error can be shown where it happened', () => {
    const problems = checkCourseTargets(
      [
        { start: 4, activity: 'study', target: 'cs50', hours: 2 },
        { start: 12, activity: 'study', target: 'basketry', hours: 2 },
      ],
      acts,
      ['cs50'],
    )
    assert.equal(problems.length, 1)
    assert.equal(problems[0]?.start, 12)
    assert.equal(problems[0]?.severity, 'error')
  })
})

describe('courseGrade', () => {
  it('is undefined before anything is graded, rather than zero', () => {
    // A course three weeks in is not failing because November has not happened yet.
    const s = state()
    foldDay(s, '2026-09-07', studied('cs50', 3), ['cs50'], ctx(cs50([pset('ps1', 6)])))
    assert.deepEqual(courseGrade(s.coursework, 'cs50'), { percentage: undefined, weightGraded: 0 })
  })

  it('weights what exists and says how much of the course that is', () => {
    const s = state(onLevel)
    const syllabus = cs50([pset('ps1', 2, { estHours: 4, weight: 0.2 }), exam('midterm', 10, { weight: 0.8 })])
    foldDay(s, '2026-09-11', studied('cs50', 4), ['cs50'], ctx(syllabus))
    const grade = courseGrade(s.coursework, 'cs50')
    assert.equal(grade.percentage, 100, 'the one graded item is the whole grade so far')
    assert.equal(grade.weightGraded, 0.2, '...and it is a fifth of the course')
  })
})
