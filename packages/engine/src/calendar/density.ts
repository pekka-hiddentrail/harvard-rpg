import { BAND_COUNT } from '../bands.ts'
import type { CalendarDensity, DayCalendar } from './events.ts'

export function classifyDensity(freeBands: number): CalendarDensity {
  if (freeBands <= 0) return 'gone'
  if (freeBands <= 2) return 'squeezed'
  if (freeBands <= 4) return 'workable'
  return 'open'
}

export function occupiedBands(day: DayCalendar): Set<number> {
  const taken = new Set<number>()
  for (const o of day.occurrences) {
    for (let b = o.startBand; b < o.endBand; b++) taken.add(b)
  }
  return taken
}

export function freeBandCount(day: DayCalendar, bandCount = BAND_COUNT): number {
  return Math.max(0, bandCount - occupiedBands(day).size)
}

export function classifyDay(day: DayCalendar, bandCount = BAND_COUNT): CalendarDensity {
  return classifyDensity(freeBandCount(day, bandCount))
}

export function classifyRange(days: readonly DayCalendar[], bandCount = BAND_COUNT): Record<string, CalendarDensity> {
  const out: Record<string, CalendarDensity> = {}
  for (const day of days) out[day.date] = classifyDay(day, bandCount)
  return out
}
