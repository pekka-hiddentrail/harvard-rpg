import { BAND_COUNT } from '../bands.ts'
import { parseDate, weekdayIndex } from '../dates.ts'

export type CalendarDensity = 'open' | 'workable' | 'squeezed' | 'gone'

export type EventBase = {
  id: string
  title: string
  hard?: boolean
}

export type OnceEvent = EventBase & {
  kind: 'once'
  date: string
  startBand: number
  endBand: number
}

export type RecurEvent = EventBase & {
  kind: 'recur'
  weekday: number
  startBand: number
  endBand: number
  startDate?: string
  endDate?: string
  everyWeeks?: number
  except?: string[]
}

export type SpanEvent = EventBase & {
  kind: 'span'
  startDate: string
  endDate: string
  startBand?: number
  endBand?: number
  except?: string[]
}

export type CalendarEvent = OnceEvent | RecurEvent | SpanEvent

export type EventOccurrence = {
  eventId: string
  title: string
  hard: boolean
  date: string
  startBand: number
  endBand: number
}

export type DayCalendar = {
  date: string
  occurrences: EventOccurrence[]
}

export const isIsoInRange = (iso: string, from: string, to: string): boolean =>
  iso >= from && iso <= to

export function assertWeekdayIndex(n: number): void {
  if (!Number.isInteger(n) || n < 0 || n > 6) {
    throw new Error(`weekday must be 0..6; got ${n}`)
  }
}

export function normalizeBandRange(
  startBand: number | undefined,
  endBand: number | undefined,
): { startBand: number; endBand: number } {
  const start = startBand ?? 0
  const end = endBand ?? BAND_COUNT
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error(`band range must be integers; got ${startBand}-${endBand}`)
  }
  if (start < 0 || end > BAND_COUNT || start >= end) {
    throw new Error(`invalid band range ${start}-${end} for ${BAND_COUNT} bands`)
  }
  return { startBand: start, endBand: end }
}

export function assertEvent(event: CalendarEvent): void {
  if (event.id.trim() === '') throw new Error('event id is required')
  if (event.title.trim() === '') throw new Error(`event ${event.id} title is required`)

  if (event.kind === 'once') {
    parseDate(event.date)
    normalizeBandRange(event.startBand, event.endBand)
    return
  }

  if (event.kind === 'recur') {
    assertWeekdayIndex(event.weekday)
    normalizeBandRange(event.startBand, event.endBand)
    if (event.startDate) parseDate(event.startDate)
    if (event.endDate) parseDate(event.endDate)
    if (event.startDate && event.endDate && event.endDate < event.startDate) {
      throw new Error(`event ${event.id} has endDate before startDate`)
    }
    const every = event.everyWeeks ?? 1
    if (!Number.isInteger(every) || every < 1) {
      throw new Error(`event ${event.id} everyWeeks must be >= 1`)
    }
    for (const x of event.except ?? []) parseDate(x)
    return
  }

  parseDate(event.startDate)
  parseDate(event.endDate)
  if (event.endDate < event.startDate) {
    throw new Error(`event ${event.id} has endDate before startDate`)
  }
  normalizeBandRange(event.startBand, event.endBand)
  for (const x of event.except ?? []) parseDate(x)
}

export function weekdayOfIso(iso: string): number {
  return weekdayIndex(parseDate(iso))
}
