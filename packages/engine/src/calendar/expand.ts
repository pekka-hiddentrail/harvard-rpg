import { parseDate, nextDay, toISO } from '../dates.ts'
import {
  assertEvent,
  type CalendarEvent,
  type DayCalendar,
  type EventOccurrence,
  isIsoInRange,
  normalizeBandRange,
  weekdayOfIso,
} from './events.ts'

const dayNumber = (iso: string): number => {
  const { y, m, d } = parseDate(iso)
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
}

const weeksBetween = (from: string, to: string): number => Math.floor((dayNumber(to) - dayNumber(from)) / 7)

export function eachDay(from: string, to: string): string[] {
  const start = parseDate(from)
  const end = parseDate(to)
  if (to < from) throw new Error(`invalid date range ${from}..${to}`)

  const out: string[] = []
  for (let at = start; toISO(at) <= toISO(end); at = nextDay(at)) {
    out.push(toISO(at))
  }
  return out
}

const occursOn = (event: CalendarEvent, date: string, windowStart: string): boolean => {
  if (event.kind === 'once') {
    return event.date === date
  }

  if (event.kind === 'span') {
    if ((event.except ?? []).includes(date)) return false
    return isIsoInRange(date, event.startDate, event.endDate)
  }

  const start = event.startDate ?? windowStart
  const end = event.endDate ?? '9999-12-31'
  if (!isIsoInRange(date, start, end)) return false
  if ((event.except ?? []).includes(date)) return false
  if (weekdayOfIso(date) !== event.weekday) return false

  const every = event.everyWeeks ?? 1
  return weeksBetween(start, date) % every === 0
}

const occurrenceOf = (event: CalendarEvent, date: string): EventOccurrence => {
  const range =
    event.kind === 'span'
      ? normalizeBandRange(event.startBand, event.endBand)
      : normalizeBandRange(event.startBand, event.endBand)

  return {
    eventId: event.id,
    title: event.title,
    hard: event.hard ?? true,
    date,
    startBand: range.startBand,
    endBand: range.endBand,
  }
}

export function expandEvents(events: readonly CalendarEvent[], from: string, to: string): DayCalendar[] {
  parseDate(from)
  parseDate(to)
  if (to < from) throw new Error(`invalid date range ${from}..${to}`)

  for (const event of events) assertEvent(event)

  const days = eachDay(from, to)
  return days.map((date) => ({
    date,
    occurrences: events.filter((event) => occursOn(event, date, from)).map((event) => occurrenceOf(event, date)),
  }))
}
