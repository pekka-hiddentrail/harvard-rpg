/**
 * The eleven time bands, and the half-band grid underneath them (GAME_DESIGN §3.1).
 *
 * Eleven bands, twenty-two halves, and **the half is the floor** — never quarters, never
 * minutes. Four bands are anchors (the wakeup run and three meals), which leaves six
 * discretionary bands plus Night, matching §8's "twelve discretionary halves plus Night on
 * an empty day".
 *
 * The clock labels come from the prototype's `Fall 2027 Weekly Grid`. Two of them are
 * *windows* there rather than band extents — the wakeup is written `07:15 / 08:15` and
 * breakfast as the wide `08:00 – 09:45` — so those two are pinned to the front of their
 * window here, which is why bands 0 and 1 are short. Bands are not equal-length in the
 * prototype and nothing in the game reads their length: the currency is bands, not minutes.
 */

export type Anchor = 'wakeup' | 'meal' | 'night'

export type Band = {
  index: number
  /** Display only. Nothing computes with this — see `startMin`/`endMin`. */
  label: string
  name: string
  anchor: Anchor | null
  /** Minutes since midnight. The band's real clock extent. */
  startMin: number
  /** Exclusive. Night runs to the end of the day, which is what 24:00 means here. */
  endMin: number
}

/**
 * The clock extents were added when the term schedule needed them: a published class time
 * like CS50's `"09:00-10:30"` has to land on specific bands before anything can say two
 * courses collide. `label` stays the prototype's own string (note the en dash, and Night's
 * open end) and is still display-only; these two numbers are what arithmetic reads.
 */
export const BANDS: readonly Band[] = [
  { index: 0, label: '07:15 – 08:00', name: 'wakeup', anchor: 'wakeup', startMin: 435, endMin: 480 },
  { index: 1, label: '08:15 – 09:00', name: 'breakfast', anchor: 'meal', startMin: 495, endMin: 540 },
  { index: 2, label: '09:00 – 10:15', name: 'morning', anchor: null, startMin: 540, endMin: 615 },
  { index: 3, label: '10:30 – 11:45', name: 'late morning', anchor: null, startMin: 630, endMin: 705 },
  { index: 4, label: '12:00 – 13:15', name: 'lunch', anchor: 'meal', startMin: 720, endMin: 795 },
  { index: 5, label: '13:30 – 14:45', name: 'early afternoon', anchor: null, startMin: 810, endMin: 885 },
  { index: 6, label: '15:00 – 16:15', name: 'afternoon', anchor: null, startMin: 900, endMin: 975 },
  { index: 7, label: '16:45 – 17:30', name: 'late afternoon', anchor: null, startMin: 1005, endMin: 1050 },
  { index: 8, label: '18:00 – 19:30', name: 'dinner', anchor: 'meal', startMin: 1080, endMin: 1170 },
  { index: 9, label: '19:30 – 21:00', name: 'evening', anchor: null, startMin: 1170, endMin: 1260 },
  { index: 10, label: '21:00 –', name: 'night', anchor: 'night', startMin: 1260, endMin: 1440 },
]

/** `"09:00"` → minutes since midnight. Throws rather than returning `NaN`, which would
 * otherwise propagate silently into a band range and place a class nowhere. */
export function minutesOfClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) throw new Error(`not a clock time: \`${hhmm}\``)
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 24 || minutes > 59) throw new Error(`not a clock time: \`${hhmm}\``)
  return hours * 60 + minutes
}

/**
 * Which bands a real clock range occupies, as a half-open `[startBand, endBand)`.
 *
 * A band counts as occupied if the class overlaps it **at all**. That is deliberately
 * generous: a class running 09:00–11:45 covers band 2 fully, the 10:15–10:30 gap, and band 3
 * fully, and you cannot study in a fifteen-minute gap between two halves of your own lab.
 * Rounding the other way would hand the player back bands they do not actually have, which is
 * the one direction a scheduling view must never be wrong in.
 */
export function bandsForMinutes(startMin: number, endMin: number): { startBand: number; endBand: number } {
  if (endMin <= startMin) throw new Error(`empty clock range ${startMin}..${endMin}`)
  const first = BANDS.findIndex((b) => b.endMin > startMin)
  // `findLastIndex` over the same predicate, written as a scan so the target stays ES2022.
  let last = -1
  for (const b of BANDS) if (b.startMin < endMin) last = b.index
  if (first === -1 || last === -1) throw new Error(`clock range ${startMin}..${endMin} falls outside the day`)
  return { startBand: first, endBand: last + 1 }
}

/** `"09:00-10:30"` → the bands it occupies. Accepts either hyphen or en dash. */
export function bandsForTimeRange(range: string): { startBand: number; endBand: number } {
  const parts = range.split(/[-–]/)
  if (parts.length !== 2) throw new Error(`not a time range: \`${range}\``)
  return bandsForMinutes(minutesOfClock(parts[0]!), minutesOfClock(parts[1]!))
}

export const BAND_COUNT = BANDS.length
export const HALVES_PER_BAND = 2
export const HALF_COUNT = BAND_COUNT * HALVES_PER_BAND
export const NIGHT_BAND = BAND_COUNT - 1

export const bandOf = (half: number): number => Math.floor(half / HALVES_PER_BAND)
export const isSecondHalf = (half: number): boolean => half % HALVES_PER_BAND === 1
export const firstHalfOf = (band: number): number => band * HALVES_PER_BAND

export function bandAt(index: number): Band {
  const b = BANDS[index]
  if (!b) throw new Error(`no such band: ${index}`)
  return b
}

/** "10:30 – 11:45" for a whole band, "10:30 – 11:45 (2nd half)" for a leftover. */
export const halfLabel = (half: number): string =>
  isSecondHalf(half) ? `${bandAt(bandOf(half)).label} ·2nd` : bandAt(bandOf(half)).label

/** Bands nothing is pencilled into by default. Six of them, and they are the whole game. */
export const DISCRETIONARY = BANDS.filter((b) => b.anchor === null).map((b) => b.index)
