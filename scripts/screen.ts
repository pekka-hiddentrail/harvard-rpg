import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadContent } from '@harvard/content'
import { buildApp } from '../packages/server/src/app.ts'
import { DAY_COLUMNS, FRAME, PANES, pad, rule, ruleLabel } from '../packages/client/src/layout.ts'
import {
  LEFT,
  TRACE_HEADER,
  bandLine,
  halfCell,
  optionLine,
  statusLine,
} from '../packages/client/src/Planner.tsx'

/**
 * Print the day planner as text: `npm run screen -- [cursorHalf]`.
 *
 * ARCHITECTURE §11 puts the interface risk of Tier 1 on this one screen — "if allocating a
 * Tuesday on a half-band grid is unpleasant to look at, that is a fact worth owning at Tier
 * 1". Owning it requires *looking* at it, and looking at it should not require opening a
 * window, resizing a terminal and clicking through character creation first.
 *
 * So this drives the real server in-process (`app.inject`, no socket) and calls the same pure
 * line builders the Ink components render. Nothing here is a mock: the numbers came out of
 * the engine, over HTTP, exactly as they will in play. What it cannot show is colour and the
 * cursor's inverse video.
 */

const here = dirname(fileURLToPath(import.meta.url))
const content = loadContent(join(here, '..', 'content'))
const { app } = buildApp({ content, dbFile: ':memory:' })
await app.ready()

const preset = content.presets.find((p) => p.id === 'pekka')
if (!preset) throw new Error('content/presets/pekka.yaml is missing')
const { id: _id, name: _name, ...build } = preset

const created = await app.inject({ method: 'POST', url: '/api/game/new', payload: build })
const { gameId } = created.json() as { gameId: string }

const catalogue = (await app.inject({ method: 'GET', url: '/api/day/activities' })).json()
const cursor = Number(process.argv[2] ?? 5)
const per = catalogue.halvesPerBand as number
const band = Math.floor(cursor / per)

const preview = await app.inject({
  method: 'POST',
  url: `/api/game/${gameId}/day/preview`,
  payload: { placements: catalogue.routine },
})
const view = preview.json()

const byId = new Map<string, any>(catalogue.activities.map((a: any) => [a.id, a]))
const banks = (id: string): boolean => (byId.get(id)?.prices[0]?.hours ?? null) !== null
const options: any[] = (catalogue.canPlace[band] ?? []).flatMap((id: string) => {
  const a = byId.get(id)
  return a ? [a] : []
})

const out: string[] = []
const say = (text = '') => out.push(pad(text, FRAME.cols))

say(
  pad(view.dateLong, 46) +
    `day ${view.day} · ${view.freeHalves} halves unspent · banked ${view.hours.total.toFixed(1)} h`.padStart(
      FRAME.cols - 46,
    ),
)
say(ruleLabel(`${TRACE_HEADER} `, LEFT))
for (const b of catalogue.bands) say(bandLine(b, view, cursor, per, band, banks).text)
say(rule())
say(
  pad(
    `${catalogue.bands[band]?.label ?? ''}${cursor % per === 1 ? ' · second half' : ''} — what do you do?`,
    FRAME.cols - 22,
  ) + 'bands=hours banked',
)
for (let i = 0; i < PANES.options; i++) {
  const a = options[i]
  say(a ? optionLine(a, i, per).text : '')
}
say(rule())
for (let i = 0; i < PANES.problems; i++) {
  const p = view.problems[i]
  say(p ? `· ${p.message}` : '')
}
say(rule())
say(statusLine(view).text)
say(rule())
say('↑↓ band · ←→ half · 1-9 place · +/- length · t subject · x clear · p routine · r RESOLVE · q quit')

console.log(`\n${'═'.repeat(FRAME.cols)}`)
console.log(out.join('\n'))
console.log('═'.repeat(FRAME.cols))
console.log(
  `\n${out.length} rows of ${FRAME.rows} · widest row ${Math.max(...out.map((l) => l.length))} of ${FRAME.cols}` +
    ` · band row ${Object.values(DAY_COLUMNS).reduce((s, w) => s + w, 0)} columns`,
)
console.log(`cursor at half ${cursor} (band ${band}${cursor % per === 1 ? ', second half' : ''}) — ${halfCell(view.grid, band, per, cursor)}`)

await app.close()
