import { addDays, nextDay, parseDate, toISO, weekdayIndex } from '../dates.ts'
import type { Assignment, CourseWeek, Session, Syllabus, Term, Weekday } from '../schema.ts'

const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}
export type DatedSession = Session & { date: string }

/** Every real (holiday-skipped) date this course meets on, across the whole term. */
function realMeetingDates(course: Syllabus, term: Term): string[] {
  const weekdays = new Set(course.meetings.flatMap((m) => m.days.map((d) => WEEKDAY_INDEX[d])))
  const holidays = new Set(term.holidays)

  const dates: string[] = []
  const last = parseDate(term.lastDay)
  for (let at = parseDate(term.firstDay); toISO(at) <= toISO(last); at = nextDay(at)) {
    const iso = toISO(at)
    if (holidays.has(iso)) continue
    if (weekdays.has(weekdayIndex(at))) dates.push(iso)
  }
  return dates
}

/**
 * Zips a course's authored `sessions` (n, topic — no date) onto the real dates its
 * `meetings` fall on within one shared `Term`. This is the whole point of decoupling
 * sessions from dates: holiday exceptions live once, in `term.holidays`, not re-derived
 * by hand in every course file (GAME_DESIGN §4.1, ARCHITECTURE's calendar layer).
 *
 * Throws if the count of real meeting dates doesn't match the authored session count —
 * a content bug (a miscounted holiday, a session added without checking the calendar)
 * should fail loudly here rather than silently mis-date every session after it.
 */
export function fitSessions(course: Syllabus, term: Term): DatedSession[] {
  const dates = realMeetingDates(course, term)
  const sessions = [...course.sessions].sort((a, b) => a.n - b.n)
  if (sessions.length !== dates.length) {
    throw new Error(
      `${course.id}: ${sessions.length} authored sessions but ${dates.length} real meeting dates in term \`${term.id}\` — they must match exactly`,
    )
  }
  return sessions.map((s, i) => ({ ...s, date: dates[i]! }))
}

/** The Monday on or before the term's `firstDay` — the anchor `CourseWeek.week` counts from. */
function week1Monday(term: Term) {
  const first = parseDate(term.firstDay)
  const dow = weekdayIndex(first) // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1
  return addDays(first, -back)
}

/**
 * Resolves one `CourseWeek` to a real `YYYY-MM-DD`, against this course's own meeting
 * pattern (for `session`) or by plain weekday arithmetic (for `day` — used for dates that
 * fall outside the course's meeting pattern entirely, such as an evening exam or a
 * reading-period deadline past `term.lastDay`).
 */
export function resolveCourseWeek(w: CourseWeek, course: Syllabus, term: Term): string {
  const monday = addDays(week1Monday(term), (w.week - 1) * 7)
  if (w.day != null) return toISO(addDays(monday, WEEKDAY_INDEX[w.day]! - 1))

  const dates = realMeetingDates(course, term)
  const sundayAfter = addDays(monday, 7)
  const inWeek = dates.filter((iso) => {
    const d = toISO(parseDate(iso))
    return d >= toISO(monday) && d < toISO(sundayAfter)
  })
  const picked = inWeek[w.session! - 1]
  if (!picked) {
    throw new Error(
      `${course.id}: week ${w.week} has no session ${w.session} — only ${inWeek.length} real meeting(s) that week (check for a holiday)`,
    )
  }
  return picked
}

type ResolvedAssignment = Omit<Assignment, 'assigned' | 'due' | 'date' | 'stages' | 'resettable'> & {
  assigned?: string
  due?: string
  date?: string
  stages: { id: string; due: string }[]
  resettable?: { carryover: number; before: string }
}

/** Same idea as `fitSessions`, for the dates authored on `assignments` instead of `sessions`. */
export function resolveAssignmentDates(course: Syllabus, term: Term): ResolvedAssignment[] {
  const at = (w: CourseWeek | undefined) => (w ? resolveCourseWeek(w, course, term) : undefined)
  return course.assignments.map((a) => ({
    ...a,
    assigned: at(a.assigned),
    due: at(a.due),
    date: at(a.date),
    stages: a.stages.map((s) => ({ id: s.id, due: resolveCourseWeek(s.due, course, term) })),
    resettable: a.resettable
      ? { carryover: a.resettable.carryover, before: resolveCourseWeek(a.resettable.before, course, term) }
      : undefined,
  }))
}
