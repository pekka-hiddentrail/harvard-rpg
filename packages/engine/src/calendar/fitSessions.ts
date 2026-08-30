import { nextDay, parseDate, toISO, weekdayIndex } from '../dates.ts'
import type { Session, Syllabus, Term, Weekday } from '../schema.ts'

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
  const weekdays = new Set(course.meetings.flatMap((m) => m.days.map((d) => WEEKDAY_INDEX[d])))
  const holidays = new Set(term.holidays)

  const dates: string[] = []
  const last = parseDate(term.lastDay)
  for (let at = parseDate(term.firstDay); toISO(at) <= toISO(last); at = nextDay(at)) {
    const iso = toISO(at)
    if (holidays.has(iso)) continue
    if (weekdays.has(weekdayIndex(at))) dates.push(iso)
  }

  const sessions = [...course.sessions].sort((a, b) => a.n - b.n)
  if (sessions.length !== dates.length) {
    throw new Error(
      `${course.id}: ${sessions.length} authored sessions but ${dates.length} real meeting dates in term \`${term.id}\` — they must match exactly`,
    )
  }
  return sessions.map((s, i) => ({ ...s, date: dates[i]! }))
}
