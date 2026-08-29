import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { DAY_COLUMNS as C, FRAME, PANES, pad, rule, ruleLabel } from './layout.ts'
import { Row, fill, type Line } from './ui.tsx'

/**
 * The day planner — the hardest screen in the game, which is why Tier 1 builds it
 * (ARCHITECTURE §11: "if allocating a Tuesday on a half-band grid is unpleasant to look at,
 * that is a fact worth owning at Tier 1").
 *
 * Three rules from §12 are load-bearing here:
 *
 * - **It is a screen, not a teletype.** Planning a day is a spatial task: you are placing
 *   hours into a grid. The cursor addresses a *half-band*, not a band, because the leftover
 *   half after a 1.5-band session is a real place you can put something.
 * - **Options show their price, never their outcome.** Every option prints what it costs in
 *   bands and what it banks in hours. What that turns into is not on this screen, because
 *   the player would not know it either.
 * - **The client computes nothing.** Every duration, hour, conflict and note below came back
 *   from `POST /day/preview`. The screen holds a `Placement[]` and asks.
 */

const BASE = process.env.HARVARD_SERVER ?? 'http://127.0.0.1:4711'

export type Placement = {
  start: number
  halves: number
  activity: string
  target?: string
  withPeople: string[]
}

export type ActivityView = {
  id: string
  name: string
  blurb: string
  kind: string
  targets: 'none' | 'subject'
  minHalves: number
  maxHalves: number
  fixed: boolean
  allowedBands: number[]
  food: string
  sleep: boolean
  prices: { halves: number; label: string; hours: number | null }[]
}

export type BandView = { index: number; label: string; name: string; anchor: string | null }

export type Catalogue = {
  bands: BandView[]
  halvesPerBand: number
  halfCount: number
  subjectTags: string[]
  activities: ActivityView[]
  canPlace: string[][]
  routine: Placement[]
}

type ResolvedPlacement = {
  start: number
  halves: number
  activity: string
  name: string
  target?: string
  hours: number
  gross: number
  mult: number
  band: number
}

type DayProblem = { code: string; severity: 'error' | 'note'; message: string; start?: number }

export type DayView = {
  day: number
  date: string
  dateLong: string
  grid: (number | null)[]
  placements: ResolvedPlacement[]
  hours: { total: number; bySubject: Record<string, number> }
  freeHalves: number
  body: { energy: number; stress: number; condition: number; halvesSinceFood: number }
  bandsSinceFood: number
  peakGap: number
  trace: { gap: number; energy: number; stress: number; mult: number }[]
  meals: number
  slept: boolean
  problems: DayProblem[]
  ok: boolean
  log: string
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as any }
}

const bandsOf = (halves: number, per: number): string => {
  const b = halves / per
  return b === 1 ? '1 band' : `${b} bands`
}

/** `1½` rather than `1.5`. The half-band is the atom of this screen; it should look like one. */
const bandGlyph = (halves: number, per: number): string => {
  const whole = Math.floor(halves / per)
  const half = halves % per === 0 ? '' : '½'
  return whole === 0 ? (half || '0') : `${whole}${half}`
}

/** Placing over something replaces it, rather than reporting a conflict the player caused. */
export const clearOverlaps = (prev: Placement[], from: number, halves: number): Placement[] =>
  prev.filter((p) => p.start + p.halves <= from || p.start >= from + halves)

export const placeAtCursor = (
  prev: Placement[],
  cursor: number,
  activity: ActivityView,
  subjectTags: string[],
): Placement[] => {
  const next: Placement = {
    start: cursor,
    halves: activity.minHalves,
    activity: activity.id,
    withPeople: [],
    ...(activity.targets === 'subject' ? { target: subjectTags[0] ?? 'math' } : {}),
  }
  return [...clearOverlaps(prev, cursor, next.halves), next].sort((x, y) => x.start - y.start)
}

export const resizeAtCursor = (
  plan: Placement[],
  cursor: number,
  dir: number,
  halfCount: number,
  byId: Map<string, ActivityView>,
): Placement[] => {
  const i = plan.findIndex((p) => cursor >= p.start && cursor < p.start + p.halves)
  if (i < 0) return plan

  return plan.flatMap((p, j) => {
    if (j !== i) return [p]
    const a = byId.get(p.activity)
    if (!a || a.fixed) return [p]
    const halves = Math.min(a.maxHalves, Math.max(a.minHalves, p.halves + dir))
    if (halves + p.start > halfCount) return [p]
    return [{ ...p, halves }]
  })
}

export const retargetAtCursor = (
  plan: Placement[],
  cursor: number,
  subjectTags: string[],
  byId: Map<string, ActivityView>,
): Placement[] => {
  const i = plan.findIndex((p) => cursor >= p.start && cursor < p.start + p.halves)
  if (i < 0) return plan

  return plan.map((p, j) => {
    if (j !== i) return p
    const a = byId.get(p.activity)
    if (!a || a.targets !== 'subject') return p
    const at = Math.max(0, subjectTags.indexOf(p.target ?? ''))
    return { ...p, target: subjectTags[(at + 1) % subjectTags.length] ?? subjectTags[0]! }
  })
}

export function Planner({
  gameId,
  catalogue,
  onClose,
}: {
  gameId: string
  catalogue: Catalogue
  /** Called when the player leaves the report. The sheet re-reads the save; nothing is passed. */
  onClose: () => void
}) {
  const per = catalogue.halvesPerBand
  const [plan, setPlan] = useState<Placement[]>(catalogue.routine)
  const [cursor, setCursor] = useState(per * 2) // band 2, first half: the first free band
  const [view, setView] = useState<DayView | null>(null)
  const [resolved, setResolved] = useState<DayView | null>(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  const byId = new Map(catalogue.activities.map((a) => [a.id, a]))
  const banks = (id: string): boolean => (byId.get(id)?.prices[0]?.hours ?? null) !== null
  const band = Math.floor(cursor / per)
  const options = (catalogue.canPlace[band] ?? []).flatMap((id) => {
    const a = byId.get(id)
    return a ? [a] : []
  })

  // Re-preview on every edit. Same contract as the creation screen: the screen never
  // computes, it asks.
  useEffect(() => {
    let stale = false
    post(`/api/game/${gameId}/day/preview`, { placements: plan })
      .then(({ json }) => {
        if (!stale) setView(json as DayView)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [gameId, plan])

  const atCursor = (): number => plan.findIndex((p) => cursor >= p.start && cursor < p.start + p.halves)

  const place = (a: ActivityView) => {
    setRefused(null)
    // Default to the shortest legal length. Growing is one keystroke and is the interesting
    // move; guessing long would silently eat the band after this one.
    setPlan((prev) => placeAtCursor(prev, cursor, a, catalogue.subjectTags))
  }

  const resize = (dir: number) => {
    setPlan((prev) => resizeAtCursor(prev, cursor, dir, catalogue.halfCount, byId))
  }

  const retarget = () => {
    setPlan((prev) => retargetAtCursor(prev, cursor, catalogue.subjectTags, byId))
  }

  const commit = async () => {
    setBusy(true)
    const res = await post(`/api/game/${gameId}/day/resolve`, { placements: plan })
    setBusy(false)
    if (res.status !== 200) {
      setRefused((res.json.problems ?? []).map((p: DayProblem) => p.message).join(' · '))
      return
    }
    setResolved(res.json.day as DayView)
  }

  useInput((input, key) => {
    if (resolved) {
      if (key.return) onClose()
      return
    }
    if (key.upArrow) return setCursor((c) => Math.max(0, c - per))
    if (key.downArrow) return setCursor((c) => Math.min(catalogue.halfCount - 1, c + per))
    if (key.leftArrow) return setCursor((c) => Math.max(0, c - 1))
    if (key.rightArrow) return setCursor((c) => Math.min(catalogue.halfCount - 1, c + 1))
    if (input === '+' || input === '=') return resize(+1)
    if (input === '-' || input === '_') return resize(-1)
    if (input === 't') return retarget()
    if (input === 'x') {
      const i = atCursor()
      if (i >= 0) setPlan((prev) => prev.filter((_, j) => j !== i))
      return
    }
    if (input === 'p') {
      setRefused(null)
      return setPlan(catalogue.routine)
    }
    if (input === 'c') {
      setRefused(null)
      return setPlan([])
    }
    if (input === 'r' && !busy) {
      void commit()
      return
    }
    const n = Number(input)
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      const a = options[n - 1]
      if (a) place(a)
    }
  })

  if (resolved) return <DayReport day={resolved} per={per} />
  if (!view) return <Text color="cyan">resolving the day...</Text>

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={46}>
          <Text bold color="cyan">
            {view.dateLong}
          </Text>
        </Box>
        <Box width={FRAME.cols - 46} justifyContent="flex-end">
          <Text color={view.freeHalves > 0 ? 'yellow' : 'green'}>
            day {view.day} · {view.freeHalves} halves unspent · banked{' '}
            {view.hours.total.toFixed(1)} h
          </Text>
        </Box>
      </Box>
      <Text color="blue">{ruleLabel(`${TRACE_HEADER} `, LEFT)}</Text>

      <Box flexDirection="column" height={PANES.bands}>
        {catalogue.bands.map((b) => (
          <Row key={b.index} line={bandLine(b, view, cursor, per, band, banks)} />
        ))}
      </Box>

      <Text dimColor>{rule()}</Text>

      <Box flexDirection="column" height={PANES.options + 1}>
        <Row
          line={{
            text: pad(
              `${catalogue.bands[band]?.label ?? ''}${cursor % per === 1 ? ' · second half' : ''} — what do you do?`,
              FRAME.cols - 22,
            ) + 'bands=hours banked',
            bold: true,
            color: 'magenta',
          }}
        />
        {fill(
          options.map((a, i) => optionLine(a, i, per)),
          PANES.options,
        ).map((line, i) => (
          <Row key={i} line={line} />
        ))}
      </Box>

      <Text dimColor>{rule()}</Text>

      <Box flexDirection="column" height={PANES.problems}>
        {fill(
          refused
            ? [{ text: `· refused: ${refused}`, color: 'red' }]
            : view.problems.map((p) => ({
                text: `· ${p.message}`,
                color: p.severity === 'error' ? 'red' : 'yellow',
              })),
          PANES.problems,
        ).map((line, i) => (
          <Row key={i} line={line} />
        ))}
      </Box>

      <Text dimColor>{rule()}</Text>
      <Row line={statusLine(view)} />
      <Box flexGrow={1} />
      <Text dimColor>{rule()}</Text>
      <Text color={busy ? 'yellow' : view.ok ? 'green' : 'red'}>
        ↑↓ band · ←→ half · 1-9 place · +/- length · t subject · x clear · p routine ·{' '}
        {busy ? 'resolving...' : view.ok ? 'r RESOLVE THE DAY' : 'r (blocked)'} · q quit
      </Text>
    </Box>
  )
}

/**
 * Everything left of the trace pane. Derived rather than written down so the heading set into
 * the rule cannot drift off the column it names when a width changes.
 */
export const LEFT = C.cursor + C.index + C.clock + C.activity + C.duration + C.hours + C.halves

/** The heading for the trace pane, laid out on the same widths `traceCell` uses. */
export const TRACE_HEADER = '  ' + 'gap'.padStart(3) + '  yield' + '  energy'

/**
 * The right-hand pane: the gap clock and energy at the *end* of this band, and the multiplier
 * the band as a whole was paid at.
 *
 * This is the pane `layout.ts` widened the canvas to 100 columns for. §3.5's claim is that the
 * cost of a skipped meal lands on the bands you were stealing — so the clock is printed on the
 * row where it bit, beside what it cost there. `×1.00` is left blank: a column of them would be
 * noise, and the whole job of this pane is to make the rows that are *not* 1.00 jump out.
 *
 * The multiplier is averaged over the band's halves, not read off the last one, so that a
 * one-band session's row and its `×` in the day report are the same number.
 */
export const traceCell = (view: DayView, band: number, per: number): string => {
  const halves = view.trace.slice(band * per, band * per + per)
  const end = halves[halves.length - 1]
  if (!end) return ''
  const mult = halves.reduce((s, t) => s + t.mult, 0) / halves.length
  // Rounded to the nearest half-band because a snack buys back a fraction of one, and `4.67`
  // in a three-wide column is a worse lie than `4½`.
  const gap = bandGlyph(Math.round(end.gap * per), per)
  return (
    '  ' +
    gap.padStart(3) +
    (mult < 0.995 ? `  ×${mult.toFixed(2)}` : '       ') +
    '  e ' +
    end.energy.toFixed(1).padStart(4)
  )
}

/** `▓▓` both halves, `▓░` the first only, `··` empty. The cursor's half is inverted. */
export const halfCell = (grid: (number | null)[], band: number, per: number, cursor: number): string => {
  const first = grid[band * per] !== null && grid[band * per] !== undefined
  const second = grid[band * per + 1] !== null && grid[band * per + 1] !== undefined
  const a = first ? '▓' : '·'
  const b = second ? '▓' : '·'
  const which = cursor - band * per
  return `${which === 0 ? '[' : ' '}${a}${b}${which === 0 ? ']' : which === 1 ? '<' : ' '}`
}

export function bandLine(
  b: BandView,
  view: DayView,
  cursor: number,
  per: number,
  cursorBand: number,
  banks: (activityId: string) => boolean,
): Line {
  const head = view.placements.find((p) => Math.floor(p.start / per) === b.index)
  const owner = view.grid[b.index * per] ?? view.grid[b.index * per + 1] ?? null
  const carried = owner === null ? null : view.placements[owner] ?? null
  const continues = carried && (!head || carried.start !== head.start) ? carried : null

  let activity = '── free ──'
  let duration = ''
  let hours = ''
  if (head) {
    activity = head.name + (head.target ? ` · ${head.target}` : '')
    duration = bandsOf(head.halves, per)
    // `0.0 h` and blank are different facts. A half-band of study banks nothing and the
    // player needs to see the zero; a meal was never going to bank anything and a zero
    // there would be a lie about what it is for.
    hours = banks(head.activity) ? `${head.hours.toFixed(1)} h` : ''
  } else if (continues) {
    activity = `⋮ ${continues.name}`
  }

  const text =
    pad(b.index === cursorBand ? '>' : ' ', C.cursor) +
    String(b.index).padStart(C.index - 1) +
    ' ' +
    pad(b.label, C.clock) +
    pad(activity, C.activity) +
    pad(duration, C.duration) +
    hours.padStart(C.hours - 2) +
    '  ' +
    halfCell(view.grid, b.index, per, cursor) +
    traceCell(view, b.index, per)

  const line: Line = { text }
  if (b.index === cursorBand) {
    line.color = 'cyan'
    line.bold = true
  }
  if (!head && !continues) line.dim = true
  if (b.anchor === 'meal' && !head) {
    line.color = 'yellow'
    line.bold = true
  }
  if (head && head.mult < 0.9) line.color = 'red'
  else if (head && head.mult < 0.99) line.color = 'yellow'
  return line
}

/**
 * One numbered option. §12: "options show their price, never their outcome." For an activity
 * that banks hours the price is the *whole ladder* — `½=0.0 1=1.0 1½=1.7 …` — not just the
 * cheapest rung, because the shape of that ladder is the entire argument for continuity.
 * Printing one rung would leave "continuity beats duration" a secret discovered by regret.
 */
export function optionLine(a: ActivityView, i: number, per: number): Line {
  const note =
    a.targets === 'subject'
      ? 'aim it with t'
      : a.food === 'meal'
        ? 'resets the clock'
        : a.food === 'snack'
          ? 'defers the clock'
          : a.sleep
            ? 'ends the day'
            : a.fixed
              ? 'fixed length'
              : ''
  const ladder =
    a.prices[0]?.hours === null
      ? a.prices.length > 1
        ? `${bandGlyph(a.minHalves, per)}–${bandGlyph(a.maxHalves, per)} bands`
        : a.prices[0].label
      : a.prices
          .map((x) => `${bandGlyph(x.halves, per)}=${(x.hours ?? 0).toFixed(1)}`)
          .join(' ')
  const color =
    a.food === 'meal' || a.food === 'snack'
      ? 'yellow'
      : a.sleep
        ? 'blue'
        : a.targets === 'subject'
          ? 'cyan'
          : undefined
  return { text: `  ${i + 1}  ` + pad(a.name, 16) + pad(note, 18) + ladder, color }
}

/**
 * The one-row summary under the panes: the day-scale facts only.
 *
 * It used to carry the gap clock and energy too, and at 108 columns it was being silently
 * truncated — the meal count fell off the end of a 99-column frame. Both of those now live in
 * the trace pane, on the band they belong to, so this row is left with what is genuinely a
 * total: hours and where they went, how well the day was run, and the two slow meters. The missing
 * meal and the missing bedtime are `note`-severity problems and print in the problems pane;
 * repeating them here would cost the columns that made this row overflow in the first place.
 */
/**
 * Columns the subject breakdown may have. Budgeted rather than counted, because the tags are
 * not the same width: `math 4.0, code 2.0, lab 1.0` and `discussion 12.0, writing 12.0` are
 * both two-or-three-item lists and one is eleven columns wider. Everything else on this row is
 * fixed-length, so this is the only number that can push `condition` off the end.
 */
const SUBJECT_BUDGET = 25

export function statusLine(view: DayView): Line {
  // Biggest subject first, as many as the budget holds, then a count of what it did not.
  const ranked = Object.entries(view.hours.bySubject)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  let shown = ''
  let kept = 0
  for (const [k, v] of ranked) {
    const next = shown ? `${shown}, ${k} ${v.toFixed(1)}` : `${k} ${v.toFixed(1)}`
    // Leave room for the ` +n` that stands in for whatever is dropped, if anything will be.
    if (next.length + (kept + 1 < ranked.length ? 3 : 0) > SUBJECT_BUDGET) break
    shown = next
    kept += 1
  }
  const rest = kept < ranked.length ? ` +${ranked.length - kept}` : ''
  const color = view.body.stress >= 60 ? 'red' : view.body.stress >= 35 ? 'yellow' : 'green'
  return {
    text: pad(
      `  banked ${view.hours.total.toFixed(1)} h${shown ? ` (${shown}${rest})` : ''}` +
        ` · ${view.meals} ${view.meals === 1 ? 'meal' : 'meals'}, gap peaked ${view.peakGap.toFixed(1)}` +
        ` · stress ${view.body.stress.toFixed(0)} · condition ${view.body.condition.toFixed(0)}`,
      FRAME.cols,
    ),
    color,
  }
}

/** After `r`. One line of text per day is the whole Tier 1 report, and it is enough. */
function DayReport({ day, per }: { day: DayView; per: number }) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">
        {day.dateLong} — resolved
      </Text>
      <Text dimColor>{rule()}</Text>
      <Text> </Text>
      {day.placements.map((p) => (
        <Text key={p.start} color={p.mult < 0.9 ? 'red' : p.mult < 0.99 ? 'yellow' : undefined}>
          {'  '}
          {pad(`${Math.floor(p.start / per)}${p.start % per === 1 ? '½' : ' '}`, 4)}
          {pad(p.name + (p.target ? ` · ${p.target}` : ''), 30)}
          {pad(bandsOf(p.halves, per), 9)}
          {p.hours > 0 ? `${p.hours.toFixed(1)} h`.padStart(7) : '       '}
          {p.hours > 0 && p.mult < 1 ? `   ×${p.mult.toFixed(2)} for hunger and fatigue` : ''}
        </Text>
      ))}
      <Text> </Text>
      <Text dimColor>{rule()}</Text>
      <Text color="cyan">{`  ${day.log}`}</Text>
      <Box flexGrow={1} />
      <Text dimColor>{rule()}</Text>
      <Text color="green">enter back to the sheet, and on to tomorrow · q quit</Text>
    </Box>
  )
}
