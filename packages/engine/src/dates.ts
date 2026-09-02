/**
 * Calendar arithmetic, done by hand.
 *
 * The engine has no clock (ARCHITECTURE §11.1), and `new Date` is banned here by the
 * purity test — which is a slightly awkward rule until you notice that it is also the
 * right one: a day planner needs to print "Monday, 30 August 2027" from a save, not from
 * the machine it happens to be running on. So the weekday comes from Sakamoto's method
 * and nothing here can drift with a timezone.
 */

export type CalDate = { y: number; m: number; d: number }

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** `YYYY-MM-DD`. Throws rather than guessing: a bad date in content is a content bug. */
export function parseDate(iso: string): CalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`\`${iso}\` is not a YYYY-MM-DD date`)
  const dt = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  if (dt.m < 1 || dt.m > 12) throw new Error(`\`${iso}\` has no such month`)
  if (dt.d < 1 || dt.d > daysInMonth(dt.y, dt.m)) throw new Error(`\`${iso}\` has no such day`)
  return dt
}

export const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export const daysInMonth = (y: number, m: number): number =>
  m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31

/** 0 = Sunday. Sakamoto's method. */
export function weekdayIndex({ y, m, d }: CalDate): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const yy = m < 3 ? y - 1 : y
  const shift = t[m - 1]
  if (shift === undefined) throw new Error(`no such month: ${m}`)
  return (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + shift + d) % 7
}

export const weekdayName = (dt: CalDate): string => WEEKDAYS[weekdayIndex(dt)] ?? '?'
export const monthName = (dt: CalDate): string => MONTHS[dt.m - 1] ?? '?'

/** "Monday, 30 August 2027" — the day planner's header. */
export const formatLong = (dt: CalDate): string =>
  `${weekdayName(dt)}, ${dt.d} ${monthName(dt)} ${dt.y}`

/** "Mon 30 Aug" — the day log line. */
export const formatShort = (dt: CalDate): string =>
  `${weekdayName(dt).slice(0, 3)} ${dt.d} ${monthName(dt).slice(0, 3)}`

export function nextDay({ y, m, d }: CalDate): CalDate {
  if (d < daysInMonth(y, m)) return { y, m, d: d + 1 }
  if (m < 12) return { y, m: m + 1, d: 1 }
  return { y: y + 1, m: 1, d: 1 }
}

export function prevDay({ y, m, d }: CalDate): CalDate {
  if (d > 1) return { y, m, d: d - 1 }
  if (m > 1) return { y, m: m - 1, d: daysInMonth(y, m - 1) }
  return { y: y - 1, m: 12, d: daysInMonth(y - 1, 12) }
}

/** Steps `n` days forward (or back, for negative `n`) one day at a time — no epoch math,
 * same "done by hand" rule as the rest of this module. */
export function addDays(dt: CalDate, n: number): CalDate {
  let cur = dt
  if (n >= 0) for (let i = 0; i < n; i++) cur = nextDay(cur)
  else for (let i = 0; i < -n; i++) cur = prevDay(cur)
  return cur
}

export const toISO = ({ y, m, d }: CalDate): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Signed day difference, `to - from`. Stepping rather than epoch math, same rule as `addDays`
 * — and bounded by the question rather than by a guard, since every caller is asking about two
 * dates inside one term (§4.4's "is this due within 48 hours") or at worst one degree. Four
 * years is ~1,460 iterations of an integer compare.
 *
 * Lexicographic comparison decides the direction, which is exactly correct for zero-padded
 * `YYYY-MM-DD` and is why `toISO` pads the year to four digits.
 */
export function daysBetween(from: string, to: string): number {
  if (from === to) return 0
  const backwards = to < from
  const target = backwards ? from : to
  let cur = parseDate(backwards ? to : from)
  let n = 0
  while (toISO(cur) !== target) {
    cur = nextDay(cur)
    n++
  }
  return backwards ? -n : n
}
