/**
 * From an enrolment to a dated term: where the hours actually land.
 *
 * Shopping week (`shopping.ts`) prices courses one at a time and sums them. That is a
 * necessary answer and not the interesting one — ARCHITECTURE §11's go/no-go gate asks
 * whether *"planning a Tuesday in mid-October — three deadlines converging, a lecture you
 * would rather skip"* is an interesting decision, and a total for the term cannot say that.
 * This module is the missing join: enrolled courses × the term calendar → real dates, real
 * bands, real collisions.
 *
 * It is pure composition. `calendar/expand.ts` already knew how to expand a recurring event,
 * `calendar/conflicts.ts` how to overlap two of them, `calendar/density.ts` how to count
 * what is left, and `calendar/fitSessions.ts` how to resolve an authored `{ week, session }`
 * onto a real day. None of it had a caller, because nothing turned a *course* into a
 * `CalendarEvent`. That is the whole of what is new here.
 */

import { BAND_COUNT, bandsForTimeRange, minutesOfClock } from './bands.ts'
import { detectConflicts, type CalendarConflict } from './calendar/conflicts.ts'
import { classifyDay, freeBandCount } from './calendar/density.ts'
import type { CalendarDensity, CalendarEvent, DayCalendar } from './calendar/events.ts'
import { expandEvents } from './calendar/expand.ts'
import { resolveAssignmentDates, termWeekOf, week1Monday } from './calendar/fitSessions.ts'
import { addDays, parseDate, toISO, weekdayIndex } from './dates.ts'
import { effectiveHours, isCourseOpen } from './demands.ts'
import { pickFrom } from './hash.ts'
import {
  BLOCK_MINUTES,
  BLOCK_STARTS,
  BLOCK_NIGHT_STARTS,
  type AssignmentKind,
  type Attendance,
  type CourseSlot,
  type Levels,
  type Meeting,
  type MeetingType,
  type Syllabus,
  type Term,
  type Weekday,
} from './schema.ts'

const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

// ── placing a meeting on the clock ──────────────────────────────────────────────────

/**
 * A meeting that knows what time it is. `time` is always present here, which is the point:
 * `Meeting.time` is optional in content because the registrar publishes a *pattern* for
 * about half the catalogue (169 of 335 meetings) and pinning a start time per course by hand
 * was never going to happen. Nothing downstream can schedule an unplaced meeting, so the
 * resolution happens once, here.
 *
 * `derivedTime` is the honesty flag. A derived time is a plausible slot, not a fact, and a
 * screen that draws it next to CS50's real published 09:00–10:30 has to be able to say which
 * is which — the same reason `Session.topic` says the literal string `TBD` rather than
 * inventing a topic.
 */
export type PlacedMeeting = {
  courseCode: string
  courseTitle: string
  type: MeetingType
  /** Present when this came from a real `CourseSlot` the player chose. */
  section?: string | undefined
  days: Weekday[]
  time: string
  derivedTime: boolean
  startBand: number
  endBand: number
  attendance: Attendance
}

/**
 * Which block slot a pattern-only meeting sits in. Derived from the course, **not** from the
 * save: a lecture time is a fact about the course that every student shares, so two players
 * must see Math 21b at the same hour. That puts it in the same category as `demand` and
 * `workloadHint` — derived because the import didn't have it, overridden the moment a real
 * `time` is authored (`effort.ts`'s `effective*` accessors are the established pattern).
 *
 * Keyed on type as well as course code so a course's lecture and its lab don't land on the
 * same slot and then report a collision with themselves.
 */
function derivedBlockTime(courseCode: string, meeting: Meeting): string {
  const pattern = meeting.pattern
  if (!pattern) {
    throw new Error(
      `${courseCode}: a meeting with neither \`time\` nor \`pattern\` cannot be placed on the band grid`,
    )
  }
  const minutes = BLOCK_MINUTES[pattern]
  // Must finish by the dinner anchor. That is not squeamishness about long days — it is the
  // difference between a plausible slot and an absurd one, and the first run of this function
  // put LS 1A's three-hour lab at 19:30–22:30, straight through dinner and into Night. The
  // night starts stay as a fallback for a future pattern too long to fit the daytime grid at
  // all; no current pattern reaches them.
  const dinner = 18 * 60
  const daytime = BLOCK_STARTS.filter((s) => minutesOfClock(s) + minutes <= dinner)
  const starts: readonly string[] =
    daytime.length > 0
      ? daytime
      : BLOCK_NIGHT_STARTS.filter((s) => minutesOfClock(s) + minutes <= 24 * 60)
  if (starts.length === 0) {
    throw new Error(`${courseCode}: a ${minutes}-minute \`${pattern}\` meeting fits no start slot`)
  }
  const start = starts[pickFrom(`${courseCode}:${meeting.type}:${pattern}`, starts.length)]!
  const end = minutesOfClock(start) + minutes
  const hh = String(Math.floor(end / 60)).padStart(2, '0')
  const mm = String(end % 60).padStart(2, '0')
  return `${start}-${hh}:${mm}`
}

/** A course's meetings, placed — with the chosen section standing in for the meeting it is
 * an instance of. A `CourseSlot` always carries a real published `time`, so picking a
 * section is also how a player replaces a derived guess with a fact. */
export function placeMeetings(syllabus: Syllabus, slot?: CourseSlot): PlacedMeeting[] {
  const out: PlacedMeeting[] = []
  for (const meeting of syllabus.meetings) {
    // The slot *is* this meeting, concretely. Skip the abstract one so the player isn't
    // scheduled into both their own section and a phantom of it.
    if (slot && slot.type === meeting.type) continue
    const time = meeting.time ?? derivedBlockTime(syllabus.courseCode, meeting)
    out.push({
      courseCode: syllabus.courseCode,
      courseTitle: syllabus.title,
      type: meeting.type,
      days: meeting.days,
      time,
      derivedTime: meeting.time === undefined,
      ...bandsForTimeRange(time),
      attendance: meeting.attendance,
    })
  }
  if (slot) {
    out.push({
      courseCode: syllabus.courseCode,
      courseTitle: syllabus.title,
      type: slot.type,
      section: slot.section,
      days: slot.days,
      time: slot.time,
      derivedTime: false,
      ...bandsForTimeRange(slot.time),
      attendance: slot.attendance,
    })
  }
  return out
}

/**
 * One recurring event per meeting-day. Holidays go in `except` rather than being filtered
 * afterwards, so the expansion itself knows the class didn't meet — which is what makes
 * Thanksgiving week come out genuinely empty instead of empty-looking.
 *
 * `hard: true` on a mandatory meeting and `false` otherwise: `detectConflicts` grades an
 * overlap `hard` only when both sides are, and a recorded 850-person lecture clashing with
 * your section is a choice, not an impossibility. That distinction is §4.3's, and it is the
 * one that makes *"a lecture you would rather skip"* a decision rather than an error.
 */
/** Identifies a *meeting* — course, kind, section. Weekday-free on purpose: an MWF lecture is
 * one meeting that happens three times, not three meetings, and `Collision` folds on this. */
export const meetingKeyFor = (m: PlacedMeeting): string =>
  `${m.courseCode}:${m.type}${m.section ? `:${m.section}` : ''}`

/** Identifies one *recurrence* of it. `expandEvents` needs a distinct event per weekday. */
export const eventIdFor = (m: PlacedMeeting, day: Weekday): string => `${meetingKeyFor(m)}:${day}`

export function meetingEvents(placed: readonly PlacedMeeting[], term: Term): CalendarEvent[] {
  return placed.flatMap((m) =>
    m.days.map((day) => ({
      kind: 'recur' as const,
      id: eventIdFor(m, day),
      title: `${m.courseCode.toUpperCase()} ${m.type}${m.section ? ` ${m.section}` : ''}`,
      weekday: WEEKDAY_INDEX[day],
      startBand: m.startBand,
      endBand: m.endBand,
      startDate: term.firstDay,
      endDate: term.lastDay,
      hard: m.attendance === 'mandatory',
      except: [...term.holidays],
    })),
  )
}

// ── what is due, and when ────────────────────────────────────────────────────────────

export type DueItem = {
  courseCode: string
  assignmentId: string
  title: string
  kind: AssignmentKind
  /** The real date, resolved through the term calendar. */
  date: string
  weight: number
  /** `undefined` for an item the syllabus never estimated — an exam you sit, typically. */
  baseHours: number | undefined
  /** `baseHours` through this player's demand gaps. `undefined` when `baseHours` is. */
  personalHours: number | undefined
}

export type WeekLoad = {
  week: number
  monday: string
  sunday: string
  due: DueItem[]
  baseHours: number
  personalHours: number
  /** Bands with no class in them, summed across the seven days. The capacity side. */
  freeBands: number
  /**
   * `personalHours / freeBands` — coursework due this week per free band to do it in. A
   * *comparative* index, deliberately not a survivability threshold: how many hours a band
   * actually banks depends on the activity's authored `curve` and the day's multipliers
   * (`day.ts`), so there is no universal hours-per-band to divide by and inventing one would
   * make a made-up number look like a rule. Week 9 reading 1.5 against week 11's 0.6 is the
   * real signal; whether 1.5 is *survivable* is the effort cap's question, not this one.
   */
  pressure: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

// ── the whole term ───────────────────────────────────────────────────────────────────

export type ScheduledCourse = {
  courseCode: string
  title: string
  section?: string | undefined
  meetings: PlacedMeeting[]
}

export type DayPlan = {
  date: string
  weekday: number
  occurrences: DayCalendar['occurrences']
  conflicts: CalendarConflict[]
  freeBands: number
  density: CalendarDensity
}

/**
 * One clash, said once. `detectConflicts` works a day at a time and is right to — but a
 * Monday/Wednesday lecture pair collides twenty-three times over a term, and twenty-three
 * identical rows is not a report, it is the same fact printed until the reader stops reading.
 * So the pair is the unit here and the dates are its payload.
 */
export type Collision = {
  /** `meetingKeyFor` values, ordered, so the same pair always keys the same way. */
  a: string
  b: string
  aTitle: string
  bTitle: string
  severity: 'hard' | 'soft'
  /** Every real date the two overlap on, in order. */
  dates: string[]
  /**
   * True when either side's time was derived rather than published — so this clash is a fact
   * about the game's world (consistent, shared by every player) but not a fact about
   * Harvard's. A view that reports it as flatly as CS50-versus-your-own-section would be
   * overclaiming, which is the failure §9.3 keeps pointing at: report *why*, not just what.
   */
  derived: boolean
}

export type TermPlan = {
  term: string
  firstDay: string
  lastDay: string
  courses: ScheduledCourse[]
  days: DayPlan[]
  weeks: WeekLoad[]
  /** Per-day, in date order — what a single day's view needs. */
  conflicts: CalendarConflict[]
  /** The same clashes folded per pair — what a term overview needs. */
  collisions: Collision[]
  /** Weeks whose `pressure` ties the maximum. Named rather than threshold-classified: the
   * design calls crunch weeks an *authored* lever, so the job here is to show where the
   * author put them, not to invent a cutoff and grade them. */
  peakWeeks: number[]
}

export type EnrolledCourse = {
  syllabus: Syllabus
  slot?: CourseSlot | undefined
}

/**
 * The term as enrolled. One pass, so every number on the way out was computed against the
 * same set of courses — a screen showing conflicts from one enrolment and pressure from
 * another would be worse than showing neither.
 *
 * A course past the not-survivable gap still schedules. `effectiveHours` returns `Infinity`
 * there, and one `Infinity` would poison every week's total and every `pressure` alongside it,
 * so such a course's items fall back to their authored `baseHours`. That understates them, and
 * knowingly: shopping week is where a closed course gets refused (`isCourseOpen`), and a term
 * plan's job is to draw the term you have, not to re-litigate whether you should have it.
 */
export function termPlan(
  enrolled: readonly EnrolledCourse[],
  levels: Levels,
  term: Term,
): TermPlan {
  const courses: ScheduledCourse[] = enrolled.map((e) => ({
    courseCode: e.syllabus.courseCode,
    title: e.syllabus.title,
    section: e.slot?.section,
    meetings: placeMeetings(e.syllabus, e.slot),
  }))

  const events = courses.flatMap((c) => meetingEvents(c.meetings, term))
  const expanded = expandEvents(events, term.firstDay, term.lastDay)

  const days: DayPlan[] = expanded.map((day) => ({
    date: day.date,
    weekday: weekdayIndex(parseDate(day.date)),
    occurrences: day.occurrences,
    conflicts: detectConflicts(day),
    freeBands: freeBandCount(day),
    density: classifyDay(day),
  }))

  // Deadlines, bucketed by term week. `resolveAssignmentDates` does the holiday-proof part;
  // `termWeekOf` is the same anchor `CourseWeek.week` was authored against.
  const byWeek = new Map<number, DueItem[]>()
  for (const { syllabus } of enrolled) {
    const open = isCourseOpen(syllabus.demands, levels)
    for (const a of resolveAssignmentDates(syllabus, term)) {
      const date = a.due ?? a.date
      if (!date) continue
      const base = a.estHours
      byWeek.set(termWeekOf(date, term), [
        ...(byWeek.get(termWeekOf(date, term)) ?? []),
        {
          courseCode: syllabus.courseCode,
          assignmentId: a.id,
          title: a.title ?? a.id,
          kind: a.kind,
          date,
          weight: a.weight,
          baseHours: base,
          personalHours:
            base === undefined
              ? undefined
              : open
                ? round1(effectiveHours(base, syllabus.demands, levels))
                : base,
        },
      ])
    }
  }

  const monday1 = week1Monday(term)
  const lastWeek = termWeekOf(term.lastDay, term)
  const freeByDate = new Map(days.map((d) => [d.date, d.freeBands]))

  const weeks: WeekLoad[] = []
  for (let week = 1; week <= lastWeek; week++) {
    const monday = addDays(monday1, (week - 1) * 7)
    const dates = Array.from({ length: 7 }, (_, i) => toISO(addDays(monday, i)))
    const due = (byWeek.get(week) ?? []).sort((a, b) => a.date.localeCompare(b.date))
    const baseHours = due.reduce((s, d) => s + (d.baseHours ?? 0), 0)
    const personalHours = due.reduce((s, d) => s + (d.personalHours ?? 0), 0)
    // Days outside the term contribute their whole band count: reading period is free time,
    // not absent time, and a deadline landing there is genuinely easier to meet.
    const freeBands = dates.reduce((s, iso) => s + (freeByDate.get(iso) ?? BAND_COUNT), 0)
    weeks.push({
      week,
      monday: toISO(monday),
      sunday: toISO(addDays(monday, 6)),
      due,
      baseHours: round1(baseHours),
      personalHours: round1(personalHours),
      freeBands,
      pressure: freeBands === 0 ? 0 : round1(personalHours / freeBands),
    })
  }

  // eventId → the meeting it recurs from, so a per-day conflict can be folded back up.
  const meetingOf = new Map<string, PlacedMeeting>()
  for (const c of courses) {
    for (const m of c.meetings) for (const d of m.days) meetingOf.set(eventIdFor(m, d), m)
  }

  const conflicts = days.flatMap((d) => d.conflicts)
  const folded = new Map<string, Collision>()
  for (const c of conflicts) {
    const ma = meetingOf.get(c.a.eventId)
    const mb = meetingOf.get(c.b.eventId)
    if (!ma || !mb) continue // an event this module didn't place; nothing to fold it onto
    // Order the pair by meeting key so a Monday overlap and a Wednesday overlap of the same
    // two meetings land on one row, whichever started earlier on the day in question.
    const swap = meetingKeyFor(ma) > meetingKeyFor(mb)
    const [a, b] = swap ? ([c.b, c.a] as const) : ([c.a, c.b] as const)
    const [pa, pb] = swap ? ([mb, ma] as const) : ([ma, mb] as const)
    const key = `${meetingKeyFor(pa)}|${meetingKeyFor(pb)}`
    const existing = folded.get(key)
    if (existing) {
      existing.dates.push(c.date)
      // Two meetings can clash softly on one day and hard on another only if attendance
      // varied, which it can't — but severity is cheap to keep honest, and the worse reading
      // is the one a player needs to see.
      if (c.severity === 'hard') existing.severity = 'hard'
      continue
    }
    folded.set(key, {
      a: meetingKeyFor(pa),
      b: meetingKeyFor(pb),
      aTitle: a.title,
      bTitle: b.title,
      severity: c.severity,
      dates: [c.date],
      derived: pa.derivedTime || pb.derivedTime,
    })
  }
  // Hard clashes first, then the ones that bite most often — the order a player should read.
  const collisions = [...folded.values()].sort(
    (x, y) =>
      Number(y.severity === 'hard') - Number(x.severity === 'hard') ||
      y.dates.length - x.dates.length ||
      x.a.localeCompare(y.a),
  )
  for (const c of collisions) c.dates.sort()

  const peak = Math.max(0, ...weeks.map((w) => w.pressure))
  return {
    term: term.id,
    firstDay: term.firstDay,
    lastDay: term.lastDay,
    courses,
    days,
    weeks,
    conflicts,
    collisions,
    peakWeeks: peak === 0 ? [] : weeks.filter((w) => w.pressure === peak).map((w) => w.week),
  }
}
