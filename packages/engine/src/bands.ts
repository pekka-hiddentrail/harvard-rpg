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
  /** Display only. Nothing computes with this. */
  label: string
  name: string
  anchor: Anchor | null
}

export const BANDS: readonly Band[] = [
  { index: 0, label: '07:15 – 08:00', name: 'wakeup', anchor: 'wakeup' },
  { index: 1, label: '08:15 – 09:00', name: 'breakfast', anchor: 'meal' },
  { index: 2, label: '09:00 – 10:15', name: 'morning', anchor: null },
  { index: 3, label: '10:30 – 11:45', name: 'late morning', anchor: null },
  { index: 4, label: '12:00 – 13:15', name: 'lunch', anchor: 'meal' },
  { index: 5, label: '13:30 – 14:45', name: 'early afternoon', anchor: null },
  { index: 6, label: '15:00 – 16:15', name: 'afternoon', anchor: null },
  { index: 7, label: '16:45 – 17:30', name: 'late afternoon', anchor: null },
  { index: 8, label: '18:00 – 19:30', name: 'dinner', anchor: 'meal' },
  { index: 9, label: '19:30 – 21:00', name: 'evening', anchor: null },
  { index: 10, label: '21:00 –', name: 'night', anchor: 'night' },
]

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
