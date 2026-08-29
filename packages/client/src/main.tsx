import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { Canvas, claimScreen } from './Canvas.tsx'
import { COLUMNS, FRAME, PANES, pad, rule, sign } from './layout.ts'
import { Planner, type Catalogue } from './Planner.tsx'
import { openWindow } from './window.ts'
import { Row, fill, type Line } from './ui.tsx'

/**
 * The client: character creation, the character sheet, then the day planner (Tier 1).
 *
 * Full-screen monospace, ASCII, keyboard only (GAME_DESIGN §10). It holds no rules —
 * every number on this screen came out of the engine over HTTP. The budget arithmetic in
 * particular is a server round-trip on purpose: two implementations of the price schedule
 * is one too many.
 *
 * No reach number here. §7.8 wants creation to show what a choice *reaches* rather than a
 * score, and reach is a count over the NPC pool, which arrives at Tier 3.
 */

const BASE = process.env.HARVARD_SERVER ?? 'http://127.0.0.1:4711'
const PROGRAMS = ['degree', 'exchange_term', 'exchange_year', 'visiting'] as const

type TraitOpt = {
  id: string
  name: string
  blurb: string
  cost: number
  kinds: string[]
  affects: Record<string, number>
  excludes: string[]
  requiresAnyOf: string[]
  requiresOneOf: string[]
  grantsLanguageFrom: string[]
  contagious: boolean
  structural: boolean
  why: string | null
  derivedCost: number | null
}

type Preset = {
  id: string
  name: string
  hometown: string
  schoolType: string
  program: string
  targetTrack: string | null
  traits: { id: string; language?: string }[]
}

type Options = {
  contentHash: string
  budget: number
  refundCap: number
  subjectTags: string[]
  presets: Preset[]
  traits: TraitOpt[]
}

type Pick = { id: string; language?: string }
type Problem = { code: string; message: string }
type Validation = {
  ok: boolean
  spent?: number
  refunded?: number
  levels?: Record<string, number>
  languages?: string[]
  problems?: Problem[]
}
type Sheet = {
  id: string
  contentHash: string
  staleContent: boolean
  creation: {
    hometown: string
    schoolType: string
    program: string
    targetTrack?: string
    budget: number
    traits: { id: string; cost: number; language?: string }[]
    languages: string[]
  }
  traitNames: string[]
  levels: Record<string, number> | null
  actionCount: number
  /** Replayed from the action log, never stored. The sheet leads into the day. */
  state: {
    day: number
    date: string
    dateLong: string
    body: { energy: number; stress: number; condition: number }
    hoursBySubject: Record<string, number>
    log: string[]
  }
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as any }
}

const center = (text: string, width: number): string => {
  const trimmed = text.slice(0, width)
  const left = Math.max(0, Math.floor((width - trimmed.length) / 2))
  return ' '.repeat(left) + trimmed + ' '.repeat(Math.max(0, width - left - trimmed.length))
}

function CreationBanner() {
  const shield = [
    '████████████',
    '███  ██  ███',
    '███  ██  ███',
    '███      ███',
    ' ██  ██  ██ ',
    '  ████████  ',
    '            ',
  ]
  const blockTitle = [
    '██   ██  █████  ██████  ██   ██  █████  ██████  ██████ ',
    '██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██',
    '██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██',
    '███████ ███████ ██████  ██   ██ ███████ ██████  ██   ██',
    '██   ██ ██   ██ ██   ██  ██ ██  ██   ██ ██   ██ ██   ██',
    '██   ██ ██   ██ ██   ██   ███   ██   ██ ██   ██ ██████ ',
    '                                                       ',
  ]
  const crestWidth = shield[0]!.length
  const titleWidth = Math.max(0, FRAME.cols - crestWidth - crestWidth)

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text> </Text>
      {blockTitle.map((line, i) => (
        <Text key={i}>
          <Text color="red">{shield[i] ?? shield[0]}</Text>
          <Text>{center(line, titleWidth)}</Text>
          <Text color="red">{shield[i] ?? shield[0]}</Text>
        </Text>
      ))}
      <Text> </Text>
      <Text>{center('UNIVERSITY LIFE SIMULATOR', FRAME.cols)}</Text>
    </Box>
  )
}

function App() {
  const { exit } = useApp()
  const [options, setOptions] = useState<Options | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [hometown, setHometown] = useState('Espoo, Finland')
  const [schoolType, setSchoolType] = useState('finnish upper secondary')
  const [programIdx, setProgramIdx] = useState(0)
  const [targetTrack, setTargetTrack] = useState('')

  const [picks, setPicks] = useState<Pick[]>([])
  const [cursor, setCursor] = useState(0)
  const [pane, setPane] = useState<'identity' | 'traits'>('traits')
  const [field, setField] = useState(0)
  const [valid, setValid] = useState<Validation | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [busy, setBusy] = useState(false)
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [planning, setPlanning] = useState(false)

  useEffect(() => {
    fetch(`${BASE}/api/creation/options`)
      .then((r) => r.json() as Promise<Options>)
      .then((o) => setOptions(o))
      .catch(() =>
        setError(`No server on ${BASE}. Start it with \`npm run server\` in another window.`),
      )
  }, [])

  // Fetched once the character exists, so that `enter` on the sheet opens the planner
  // instantly rather than on a spinner.
  useEffect(() => {
    if (!sheet || catalogue) return
    fetch(`${BASE}/api/day/activities`)
      .then((r) => r.json() as Promise<Catalogue>)
      .then(setCatalogue)
      .catch(() => {})
  }, [sheet, catalogue])

  const build = () => ({
    hometown,
    schoolType,
    program: PROGRAMS[programIdx]!,
    ...(targetTrack.trim() === '' ? {} : { targetTrack: targetTrack.trim() }),
    traits: picks,
  })

  // Re-validate on every edit. The screen never computes; it asks.
  useEffect(() => {
    if (!options) return
    if (picks.length === 0) {
      setValid(null)
      return
    }
    let stale = false
    post('/api/creation/validate', build())
      .then(({ json }) => {
        if (!stale) setValid(json as Validation)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, picks, hometown, schoolType, programIdx, targetTrack])

  const toggle = (t: TraitOpt) => {
    setPicks((prev) =>
      prev.some((p) => p.id === t.id)
        ? prev.filter((p) => p.id !== t.id)
        : [
            ...prev,
            t.grantsLanguageFrom.length > 0
              ? { id: t.id, language: t.grantsLanguageFrom[0]! }
              : { id: t.id },
          ],
    )
  }

  const cycleLanguage = (t: TraitOpt, dir: number) => {
    if (t.grantsLanguageFrom.length === 0) return
    setPicks((prev) =>
      prev.map((p) => {
        if (p.id !== t.id) return p
        const i = Math.max(0, t.grantsLanguageFrom.indexOf(p.language ?? ''))
        const next = (i + dir + t.grantsLanguageFrom.length) % t.grantsLanguageFrom.length
        return { id: p.id, language: t.grantsLanguageFrom[next]! }
      }),
    )
  }

  const submit = async () => {
    setBusy(true)
    const created = await post('/api/game/new', build())
    if (created.status !== 201) {
      setValid({ ok: false, problems: created.json.problems ?? [] })
      setBusy(false)
      return
    }
    // Round-trip through SQLite: the sheet is read back from the save, not from memory.
    // That is the whole point of Tier 0 — a save written, reloaded, and rendered.
    const res = await fetch(`${BASE}/api/game/${created.json.gameId}`)
    setSheet((await res.json()) as Sheet)
    setBusy(false)
  }

  useInput((input, key) => {
    // `q` quits everywhere except the identity pane, where it is a letter someone typing
    // "Quebec" has every right to expect.
    if (key.escape || (key.ctrl && input === 'c')) return exit()
    if (input === 'q' && pane !== 'identity') return exit()
    if (sheet) {
      if (!planning && input === 'c') {
        openWindow('scripts/calendar.tsx', [sheet.id])
        return
      }
      // The sheet offers the planner. The calendar is a separate window.
      if (!planning && key.return && catalogue) setPlanning(true)
      return
    }
    if (!options) return

    if (key.tab) {
      setPane((p) => (p === 'traits' ? 'identity' : 'traits'))
      return
    }

    if (pane === 'identity') {
      if (key.upArrow) return setField((f) => (f + 3) % 4)
      if (key.downArrow) return setField((f) => (f + 1) % 4)
      if (field === 2) {
        if (key.leftArrow) return setProgramIdx((i) => (i + PROGRAMS.length - 1) % PROGRAMS.length)
        if (key.rightArrow) return setProgramIdx((i) => (i + 1) % PROGRAMS.length)
        return
      }
      const setter = field === 0 ? setHometown : field === 1 ? setSchoolType : setTargetTrack
      if (key.backspace || key.delete) return setter((s) => s.slice(0, -1))
      if (input && !key.ctrl && !key.meta && !key.return) return setter((s) => s + input)
      return
    }

    const list = options.traits
    const here = list[cursor]
    if (key.upArrow) return setCursor((c) => (c + list.length - 1) % list.length)
    if (key.downArrow) return setCursor((c) => (c + 1) % list.length)
    if (input === ' ' && here) return toggle(here)
    if (key.leftArrow && here) return cycleLanguage(here, -1)
    if (key.rightArrow && here) return cycleLanguage(here, +1)
    if (input === 'p' && options.presets[0]) {
      const p = options.presets[0]
      setHometown(p.hometown)
      setSchoolType(p.schoolType)
      setProgramIdx(Math.max(0, PROGRAMS.indexOf(p.program as (typeof PROGRAMS)[number])))
      setTargetTrack(p.targetTrack ?? '')
      setPicks(p.traits.map((t) => ({ id: t.id, ...(t.language ? { language: t.language } : {}) })))
      return
    }
    if (input === 'x') return setPicks([])
    if (key.return && valid?.ok && !busy) void submit()
  })

  if (error) {
    return (
      <Box flexDirection="column">
        <Text bold>HARVARD</Text>
        <Text> </Text>
        <Text color="red">{error}</Text>
        <Text> </Text>
        <Text dimColor>q to quit</Text>
      </Box>
    )
  }
  if (!options) return <Text dimColor>reading content…</Text>

  if (sheet && planning && catalogue) {
    return (
      <Planner
        gameId={sheet.id}
        catalogue={catalogue}
        onClose={() => {
          setPlanning(false)
          // Re-read the save rather than patch the copy in memory. The day that just resolved
          // exists as one action in SQLite; everything on the sheet is replayed from it.
          void fetch(`${BASE}/api/game/${sheet.id}`)
            .then((r) => r.json() as Promise<Sheet>)
            .then(setSheet)
            .catch(() => {})
        }}
      />
    )
  }
  if (sheet) return <CharacterSheet sheet={sheet} ready={catalogue !== null} />

  const picked = new Set(picks.map((p) => p.id))
  const net = (valid?.spent ?? 0) - (valid?.refunded ?? 0)
  const left = options.budget - net

  // A scrolling window on the list, kept exactly PANES.list rows tall whether the pool holds
  // 21 traits or 200. The cursor sits mid-pane until it reaches either end.
  const half = Math.floor(PANES.list / 2)
  const last = Math.max(0, options.traits.length - PANES.list)
  const start = Math.min(Math.max(0, cursor - half), last)
  const window = options.traits.slice(start, start + PANES.list)
  const here = options.traits[cursor]

  // Every pane below is given a fixed height and every row a fixed width. The screen is a
  // grid the player learns the shape of, not a document that reflows under them.
  const detail = here ? detailLines(here) : []

  return (
    <Box flexDirection="column">
      <CreationBanner />
      <Box>
        <Box width={38}>
          <Text bold>character creation</Text>
        </Box>
        <Box width={FRAME.cols - 38} justifyContent="flex-end">
          <Text dimColor>
            content {options.contentHash} · budget {options.budget} · refunds ≤{' '}
            {options.refundCap}
          </Text>
        </Box>
      </Box>
      <Text dimColor>{rule()}</Text>

      <Box height={PANES.list}>
        <Box flexDirection="column" width={COLUMNS.list}>
          {window.map((t) => {
            const on = picked.has(t.id)
            const lang = picks.find((p) => p.id === t.id)?.language
            const row =
              (on ? '[x] ' : '[ ] ') +
              pad(t.name, 30) +
              sign(t.cost).padStart(4) +
              (lang ? `  ${lang}` : '')
            return (
              <Text key={t.id} inverse={here?.id === t.id && pane === 'traits'}>
                {pad(row, COLUMNS.list)}
              </Text>
            )
          })}
        </Box>

        <Box flexDirection="column" marginLeft={COLUMNS.gap}>
          <Text>
            spent <Text bold>{valid?.spent ?? 0}</Text> · refunded{' '}
            <Text bold>{valid?.refunded ?? 0}</Text> · net <Text bold>{net}</Text>
          </Text>
          <Text color={left === 0 ? 'green' : 'yellow'}>
            {left === 0 ? 'budget spent exactly' : left > 0 ? `${left} left` : `over by ${-left}`}
          </Text>
          <Text> </Text>
          {options.subjectTags.map((tag) => {
            const v = valid?.levels?.[tag] ?? 0
            return (
              <Text key={tag} dimColor={v === 0}>
                {pad(tag, 12)}
                {v === 0 ? '  0' : sign(v).padStart(3)}
              </Text>
            )
          })}
        </Box>
      </Box>

      <Text dimColor>{rule()}</Text>

      <Box flexDirection="column" height={PANES.detail}>
        {fill(detail, PANES.detail).map((line, i) => (
          <Row key={i} line={line} />
        ))}
      </Box>

      <Text dimColor>{rule()}</Text>

      <Box flexDirection="column">
        <Text>
          <Text dimColor>hometown </Text>
          <Text inverse={pane === 'identity' && field === 0}>{pad(hometown || '—', 26)}</Text>
          <Text dimColor> school </Text>
          <Text inverse={pane === 'identity' && field === 1}>{pad(schoolType || '—', 28)}</Text>
        </Text>
        <Text>
          <Text dimColor>program  </Text>
          <Text inverse={pane === 'identity' && field === 2}>{pad(PROGRAMS[programIdx]!, 26)}</Text>
          <Text dimColor> track  </Text>
          <Text inverse={pane === 'identity' && field === 3}>
            {pad(targetTrack || 'undecided', 28)}
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column" height={PANES.problems} marginTop={1}>
        {fill(
          (valid?.ok === false ? valid.problems ?? [] : []).map((p) => ({
            text: `· ${p.message}`,
            color: 'yellow',
          })),
          PANES.problems,
        ).map((line, i) => (
          <Row key={i} line={line} />
        ))}
      </Box>

      <Box flexGrow={1} />
      <Text dimColor>{rule()}</Text>
      <Text dimColor>
        ↑↓ move · space take/drop · ←→ language · p preset · x clear · tab identity ·{' '}
        {busy ? 'matriculating…' : valid?.ok ? 'enter MATRICULATE' : 'enter (blocked)'} · q quit
      </Text>
    </Box>
  )
}

/**
 * The highlighted trait, explained. Deliberately the same five rows for every trait —
 * a pane that grows when a trait happens to exclude three others is a pane that shoves the
 * keybindings around while the player is reading them.
 */
function detailLines(t: TraitOpt): Line[] {
  const lines: Line[] = [
    {
      text: t.name + (t.kinds.length > 0 ? `  [${t.kinds.join(' · ')}]` : ''),
      bold: true,
    },
  ]
  if (t.blurb) lines.push({ text: t.blurb, dim: true })
  if (t.requiresOneOf.length > 0) {
    lines.push({ text: `then exactly one of: ${t.requiresOneOf.join(' · ')}`, color: 'cyan' })
  }
  if (t.requiresAnyOf.length > 0) {
    lines.push({ text: `needs: ${t.requiresAnyOf.join(' or ')}`, color: 'cyan' })
  }
  if (t.excludes.length > 0) {
    lines.push({ text: `closes: ${t.excludes.join(' · ')}`, color: 'magenta' })
  }
  if (t.structural && t.why) lines.push({ text: t.why, dim: true })
  if (t.derivedCost !== null && t.derivedCost !== t.cost) {
    lines.push({
      text: `schedule says ${sign(t.derivedCost)}, authored ${sign(t.cost)}`,
      dim: true,
    })
  }
  return lines
}

function CharacterSheet({ sheet, ready }: { sheet: Sheet; ready: boolean }) {
  const c = sheet.creation
  const s = sheet.state
  return (
    <Box flexDirection="column">
      <Text bold>HARVARD — the character, read back from the save</Text>
      <Text dimColor>{rule()}</Text>
      <Text>
        <Text dimColor>save    </Text>
        {sheet.id}
      </Text>
      <Text>
        <Text dimColor>content </Text>
        {sheet.contentHash}
        {sheet.staleContent ? <Text color="yellow"> (content has changed since)</Text> : null}
      </Text>
      <Text>
        <Text dimColor>from    </Text>
        {c.hometown} · {c.schoolType} · {c.program}
        {c.targetTrack ? ` · aiming at ${c.targetTrack}` : ''}
      </Text>
      {c.languages.length > 0 ? (
        <Text>
          <Text dimColor>speaks  </Text>
          {c.languages.join(', ')}
        </Text>
      ) : null}
      <Text> </Text>
      <Text bold>traits</Text>
      {c.traits.map((t, i) => (
        <Text key={t.id}>
          {'  '}
          {(sheet.traitNames[i] ?? t.id).padEnd(30)}
          {sign(t.cost).padStart(3)}
          {t.language ? `  ${t.language}` : ''}
        </Text>
      ))}
      <Text> </Text>
      <Text bold>levels</Text>
      {Object.entries(sheet.levels ?? {}).map(([tag, v]) => (
        <Text key={tag} dimColor={v === 0}>
          {'  '}
          {tag.padEnd(12)}
          {v === 0 ? '  0' : sign(v).padStart(3)}
        </Text>
      ))}
      <Text> </Text>
      <Text bold>the day ahead</Text>
      <Text>
        {'  '}
        {s.dateLong}
        <Text dimColor>{`  ·  day ${s.day}`}</Text>
      </Text>
      <Text dimColor>
        {'  '}
        energy {s.body.energy.toFixed(0)} · stress {s.body.stress.toFixed(0)} · condition{' '}
        {s.body.condition.toFixed(0)}
      </Text>
      {/* The log is the save. Nothing here is stored — it is replayed from the actions. */}
      {s.log.slice(-4).map((line, i) => (
        <Text key={i} dimColor>
          {'  '}
          {pad(line, FRAME.cols - 2)}
        </Text>
      ))}
      <Box flexGrow={1} />
      <Text dimColor>{rule()}</Text>
      <Text dimColor>
        {sheet.actionCount} {sheet.actionCount === 1 ? 'day' : 'days'} logged ·{' '}
        {ready ? 'enter PLAN THE DAY · c calendar window' : 'reading the day…'} · q quit
      </Text>
    </Box>
  )
}

claimScreen()
render(
  <Canvas>
    <App />
  </Canvas>,
)
