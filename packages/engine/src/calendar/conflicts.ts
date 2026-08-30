import type { DayCalendar, EventOccurrence } from './events.ts'

export type CalendarConflict = {
  date: string
  a: EventOccurrence
  b: EventOccurrence
  severity: 'hard' | 'soft'
  message: string
}

const overlaps = (a: EventOccurrence, b: EventOccurrence): boolean =>
  a.startBand < b.endBand && b.startBand < a.endBand

export function detectConflicts(day: DayCalendar): CalendarConflict[] {
  const sorted = [...day.occurrences].sort((x, y) => x.startBand - y.startBand)
  const out: CalendarConflict[] = []

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    if (!a) continue
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      if (!b) continue
      if (!overlaps(a, b)) continue
      const severity: 'hard' | 'soft' = a.hard && b.hard ? 'hard' : 'soft'
      out.push({
        date: day.date,
        a,
        b,
        severity,
        message: `${a.title} overlaps ${b.title}`,
      })
    }
  }

  return out
}

export const detectConflictsInRange = (days: readonly DayCalendar[]): CalendarConflict[] =>
  days.flatMap((day) => detectConflicts(day))
