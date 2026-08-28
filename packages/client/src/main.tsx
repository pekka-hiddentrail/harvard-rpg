import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'

/**
 * The Tier 0 client: character creation, then the character sheet.
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
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as any }
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

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

  useEffect(() => {
    fetch(`${BASE}/api/creation/options`)
      .then((r) => r.json() as Promise<Options>)
      .then((o) => setOptions(o))
      .catch(() =>
        setError(`No server on ${BASE}. Start it with \`npm run server\` in another window.`),
      )
  }, [])

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
    if (key.escape || (key.ctrl && input === 'c')) return exit()
    if (sheet) {
      if (input === 'q') exit()
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

  if (error) return <Text color="red">{error}</Text>
  if (!options) return <Text dimColor>reading content…</Text>

  if (sheet) return <CharacterSheet sheet={sheet} />

  const picked = new Set(picks.map((p) => p.id))
  const net = (valid?.spent ?? 0) - (valid?.refunded ?? 0)
  const left = options.budget - net

  // A window on the list, so the layout does not depend on the terminal being tall.
  const WINDOW = 14
  const start = Math.max(0, Math.min(cursor - Math.floor(WINDOW / 2), options.traits.length - WINDOW))
  const window = options.traits.slice(Math.max(0, start), Math.max(0, start) + WINDOW)
  const here = options.traits[cursor]

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>HARVARD — character creation</Text>
        <Text dimColor>
          content {options.contentHash} · budget {options.budget} · refund cap{' '}
          {options.refundCap}
        </Text>
      </Box>
      <Text dimColor>{'─'.repeat(78)}</Text>

      <Box>
        <Box flexDirection="column" width={46}>
          {window.map((t) => {
            const on = picked.has(t.id)
            const lang = picks.find((p) => p.id === t.id)?.language
            const isHere = options.traits[cursor]?.id === t.id
            return (
              <Text key={t.id} inverse={isHere && pane === 'traits'}>
                {on ? '[x] ' : '[ ] '}
                {t.name.padEnd(28).slice(0, 28)}
                {String(sign(t.cost)).padStart(4)}
                {lang ? `  ${lang}` : ''}
              </Text>
            )
          })}
        </Box>

        <Box flexDirection="column" marginLeft={2}>
          <Text>
            spent <Text bold>{valid?.spent ?? 0}</Text> · refunded{' '}
            <Text bold>{valid?.refunded ?? 0}</Text> · net <Text bold>{net}</Text>
          </Text>
          <Text color={left === 0 ? 'green' : 'yellow'}>
            {left === 0 ? 'budget spent exactly ✓' : left > 0 ? `${left} left` : `over by ${-left}`}
          </Text>
          <Text> </Text>
          {options.subjectTags.map((tag) => {
            const v = valid?.levels?.[tag] ?? 0
            return (
              <Text key={tag} dimColor={v === 0}>
                {tag.padEnd(12)}
                {v === 0 ? '  0' : sign(v).padStart(3)}
              </Text>
            )
          })}
        </Box>
      </Box>

      <Text dimColor>{'─'.repeat(78)}</Text>

      {here ? (
        <Box flexDirection="column">
          <Text>
            <Text bold>{here.name}</Text>
            {here.kinds.length > 0 ? <Text dimColor> [{here.kinds.join(' · ')}]</Text> : null}
          </Text>
          {here.blurb ? <Text dimColor>{here.blurb}</Text> : null}
          {here.requiresOneOf.length > 0 ? (
            <Text color="cyan">requires exactly one of: {here.requiresOneOf.join(' · ')}</Text>
          ) : null}
          {here.requiresAnyOf.length > 0 ? (
            <Text color="cyan">requires: {here.requiresAnyOf.join(' or ')}</Text>
          ) : null}
          {here.excludes.length > 0 ? (
            <Text color="magenta">closes: {here.excludes.join(' · ')}</Text>
          ) : null}
          {here.structural && here.why ? <Text dimColor>{here.why}</Text> : null}
          {here.derivedCost !== null && here.derivedCost !== here.cost ? (
            <Text dimColor>schedule says {sign(here.derivedCost)}, authored {sign(here.cost)}</Text>
          ) : null}
        </Box>
      ) : null}

      <Text> </Text>
      <Box flexDirection="column">
        <Text>
          <Text dimColor>hometown </Text>
          <Text inverse={pane === 'identity' && field === 0}>{hometown || '—'}</Text>
          <Text dimColor>  school </Text>
          <Text inverse={pane === 'identity' && field === 1}>{schoolType || '—'}</Text>
        </Text>
        <Text>
          <Text dimColor>program </Text>
          <Text inverse={pane === 'identity' && field === 2}>{PROGRAMS[programIdx]}</Text>
          <Text dimColor>  track </Text>
          <Text inverse={pane === 'identity' && field === 3}>{targetTrack || 'undecided'}</Text>
        </Text>
      </Box>

      {valid && !valid.ok ? (
        <Box flexDirection="column" marginTop={1}>
          {(valid.problems ?? []).map((p, i) => (
            <Text key={i} color="yellow">
              · {p.message}
            </Text>
          ))}
        </Box>
      ) : null}

      <Text> </Text>
      <Text dimColor>
        ↑↓ move · space take/drop · ←→ language · p preset · x clear · tab identity ·{' '}
        {valid?.ok ? 'enter MATRICULATE' : 'enter (blocked)'} · esc quit
      </Text>
    </Box>
  )
}

function CharacterSheet({ sheet }: { sheet: Sheet }) {
  const c = sheet.creation
  return (
    <Box flexDirection="column">
      <Text bold>HARVARD — the character, read back from the save</Text>
      <Text dimColor>{'─'.repeat(78)}</Text>
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
      <Text dimColor>
        {sheet.actionCount} actions logged. Term has not started — that is Tier 1. · q quit
      </Text>
    </Box>
  )
}

render(<App />)
