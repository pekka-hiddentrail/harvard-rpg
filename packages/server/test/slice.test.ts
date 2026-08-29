import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { loadContent } from '@harvard/content'
import { buildApp } from '../src/app.ts'

/**
 * The Tier 0 claim, tested: a save written, reloaded, and rendered — over HTTP, through the
 * engine, into SQLite and back. If this passes, the stack hangs together, which was the
 * whole reason the vertical slice came first (ARCHITECTURE §11).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'content')
const content = loadContent(root)
const { app } = buildApp({ content, dbFile: ':memory:' })

before(() => app.ready())
after(() => app.close())

const pekkaBuild = () => {
  const preset = content.presets.find((p) => p.id === 'pekka')
  assert.ok(preset, 'content/presets/pekka.yaml is missing')
  const { id: _id, name: _name, ...build } = preset
  return build
}

describe('GET /api/creation/options', () => {
  it('hands the client everything it needs and no rules', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/creation/options' })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.contentHash, content.hash)
    assert.equal(body.budget, content.rules.creation.budget)
    assert.ok(body.traits.length > 0)
    assert.ok(body.presets.some((p: { id: string }) => p.id === 'pekka'))
    // No reach number at Tier 0 — the NPC pool arrives at Tier 3, and a stub here would be
    // a wrong number on the one screen where the player is making irreversible choices.
    assert.equal('reach' in body, false)
    assert.ok(body.traits.every((t: Record<string, unknown>) => !('reach' in t)))
  })
})

describe('POST /api/creation/validate', () => {
  it('accepts the preset', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/creation/validate',
      payload: pekkaBuild(),
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.ok, true)
    assert.equal(body.spent - body.refunded, content.rules.creation.budget)
  })

  it('explains a refusal instead of merely refusing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/creation/validate',
      payload: { ...pekkaBuild(), traits: [{ id: 'outgoing' }] },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.ok, false)
    assert.ok(body.problems.length > 0)
    assert.match(body.problems[0].message, /\w{4,}/)
  })

  it('rejects a malformed body at the schema, with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/creation/validate',
      payload: { hometown: 'Espoo', traits: [] },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('the round trip', () => {
  it('writes a save, reads it back, and derives the levels again', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/game/new',
      payload: pekkaBuild(),
    })
    assert.equal(created.statusCode, 201)
    const { gameId } = created.json()
    assert.ok(gameId)

    const loaded = await app.inject({ method: 'GET', url: `/api/game/${gameId}` })
    assert.equal(loaded.statusCode, 200)
    const sheet = loaded.json()

    assert.equal(sheet.contentHash, content.hash)
    assert.equal(sheet.staleContent, false)
    assert.equal(sheet.actionCount, 0)
    assert.equal(sheet.creation.hometown, pekkaBuild().hometown)
    assert.deepEqual(sheet.creation.languages, ['Swedish'])
    assert.ok(sheet.traitNames.length === sheet.creation.traits.length)

    // The save does not store levels; they came back because the server recomputed them.
    assert.equal('levels' in sheet.creation, false)
    assert.ok(sheet.levels.math > 0)

    // Nor does the save leak the seed to the client. Nothing at Tier 0 needs it, and once
    // grading exists, a client that knows the seed knows the draw (§4.7).
    assert.equal('seed' in sheet, false)
  })

  it('refuses an illegal build with 422 and never writes it', async () => {
    const bad = { ...pekkaBuild(), traits: [{ id: 'outgoing' }] }
    const res = await app.inject({ method: 'POST', url: '/api/game/new', payload: bad })
    assert.equal(res.statusCode, 422)
    assert.ok(res.json().problems.length > 0)
  })

  it('404s on a save that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/game/not-a-save' })
    assert.equal(res.statusCode, 404)
  })
})

// ── the day (Tier 1) ─────────────────────────────────────────────────────────────────

const newGame = async (): Promise<string> => {
  const created = await app.inject({ method: 'POST', url: '/api/game/new', payload: pekkaBuild() })
  assert.equal(created.statusCode, 201)
  return created.json().gameId as string
}

const catalogue = async () => {
  const res = await app.inject({ method: 'GET', url: '/api/day/activities' })
  assert.equal(res.statusCode, 200)
  return res.json()
}

describe('GET /api/day/activities', () => {
  it('hands the client a day it can draw without knowing a single rule', async () => {
    const body = await catalogue()
    assert.equal(body.bands.length, 11)
    assert.equal(body.halfCount, 22)
    assert.equal(body.halvesPerBand, 2)
    assert.equal(body.canPlace.length, 11)
    assert.ok(body.activities.length > 0)
    assert.deepEqual(body.subjectTags, content.rules.subjectTags)
  })

  it('precomputes the price ladder, since a price is a rule', () => {
    // §12: an option shows its price and never its outcome. The price comes off the curve,
    // which lives behind this boundary — so the client is handed the numbers, not the array.
    return catalogue().then((body) => {
      const study = body.activities.find((a: { id: string }) => a.id === 'study')
      assert.ok(study)
      assert.equal(study.prices.length, study.maxHalves - study.minHalves + 1)
      assert.equal(study.prices[0].hours, 0, 'half a band of study is priced at nothing')
      assert.equal(study.prices[0].label, '0.5 bands')
      // Null rather than zero for something that was never going to bank hours. Zero is a
      // fact about study; for lunch it would be a lie about what lunch is for.
      const lunch = body.activities.find((a: { id: string }) => a.id === 'lunch')
      assert.equal(lunch.prices[0].hours, null)
    })
  })

  it('says which bands will take what, so the client filters without the rule', async () => {
    const body = await catalogue()
    assert.ok(body.canPlace[0].includes('run'), 'the wakeup run belongs to band 0')
    assert.equal(body.canPlace[5].includes('run'), false)
    // An activity with an empty `allowedBands` goes anywhere — that is what lets a meal band
    // be converted to study and the gap clock charge for it.
    assert.ok(body.canPlace.every((ids: string[]) => ids.includes('study')))
  })

  it('prefills the standing routine, so a day is a few keystrokes (§3.2)', async () => {
    const body = await catalogue()
    assert.ok(Array.isArray(body.routine) && body.routine.length > 0)
    const ids = new Set(body.routine.map((p: { activity: string }) => p.activity))
    for (const needed of ['run', 'breakfast', 'lunch', 'dinner', 'sleep', 'study']) {
      assert.ok(ids.has(needed), `the routine should include ${needed}`)
    }
    // And it must actually resolve — a prefill that errors is worse than an empty grid.
    const id = await newGame()
    const preview = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements: body.routine },
    })
    assert.equal(preview.statusCode, 200)
    assert.equal(preview.json().ok, true)
  })
})

describe('POST /api/game/:id/day/preview', () => {
  it('resolves a candidate day and returns a grid the client can draw', async () => {
    const id = await newGame()
    const res = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: {
        placements: [
          { start: 4, halves: 3, activity: 'study', target: 'math', withPeople: [] },
          { start: 8, halves: 2, activity: 'lunch', withPeople: [] },
        ],
      },
    })
    assert.equal(res.statusCode, 200)
    const day = res.json()

    assert.equal(day.day, 1)
    assert.equal(day.date, content.rules.day.firstDay)
    assert.match(day.dateLong, /^Monday, /)
    assert.equal(day.grid.length, 22)
    // A 1.5-band session is three consecutive halves pointing at the same placement. This is
    // the thing the half grid exists to make visible instead of silently rounding away.
    assert.deepEqual(day.grid.slice(4, 7), [0, 0, 0])
    assert.equal(day.grid[3], null)
    assert.equal(day.grid[7], null)
    assert.deepEqual(day.grid.slice(8, 10), [1, 1])
    // 1.7 off the curve, times 0.95 — this plan skips breakfast, so the third half of the
    // session crosses the first hunger threshold and the block is charged the average.
    assert.equal(day.hours.total, 1.6)
    assert.equal(day.ok, true)
  })

  it('sends the per-half trace the planner draws its side pane from', async () => {
    // The client computes nothing (§12), and the gap clock is the mechanic Tier 1 exists to
    // build — so the server has to hand over the clock *per half*, not just its peak. A
    // meal at band 4 has to read zero on band 4's row and climb again after it.
    const id = await newGame()
    const res = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements: [{ start: 8, halves: 2, activity: 'lunch', withPeople: [] }] },
    })
    const { trace } = res.json() as {
      trace: { gap: number; energy: number; stress: number; mult: number }[]
    }
    assert.equal(trace.length, 22)
    assert.equal(trace[9]?.gap, 0, 'the half you ate in has to read zero')
    assert.ok((trace[8]?.gap ?? 0) > 0, 'and the half before it must not')
    assert.equal(trace[11]?.gap, 1)
    // Every entry carries what the half was paid at, so the pane can price a free band.
    assert.ok(trace.every((t) => t.mult > 0 && t.mult <= 1))
  })

  it('echoes the submitted plan back, so the two copies cannot drift', async () => {
    const id = await newGame()
    const placements = [{ start: 4, halves: 2, activity: 'study', target: 'code', withPeople: [] }]
    const res = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements },
    })
    assert.deepEqual(res.json().submitted, placements)
  })

  it('reports notes without refusing, and errors without resolving', async () => {
    const id = await newGame()
    const notes = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements: [{ start: 4, halves: 1, activity: 'study', target: 'math', withPeople: [] }] },
    })
    assert.equal(notes.json().ok, true, 'a half-band of study is legal and banks nothing')
    assert.ok(notes.json().problems.some((p: { code: string }) => p.code === 'spin_up'))

    const errors = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements: [{ start: 10, halves: 2, activity: 'run', withPeople: [] }] },
    })
    assert.equal(errors.json().ok, false)
    assert.ok(errors.json().problems.some((p: { code: string }) => p.code === 'wrong_band'))
  })

  it('changes nothing — it is a dry run', async () => {
    const id = await newGame()
    await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements: [{ start: 4, halves: 4, activity: 'study', target: 'math', withPeople: [] }] },
    })
    const sheet = await app.inject({ method: 'GET', url: `/api/game/${id}` })
    assert.equal(sheet.json().actionCount, 0)
    assert.equal(sheet.json().state.day, 1)
  })

  it('400s on a malformed placement and 404s on a missing save', async () => {
    const id = await newGame()
    const bad = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/preview`,
      payload: { placements: [{ start: -1, halves: 0, activity: 'study' }] },
    })
    assert.equal(bad.statusCode, 400)

    const missing = await app.inject({
      method: 'POST',
      url: '/api/game/not-a-save/day/preview',
      payload: { placements: [] },
    })
    assert.equal(missing.statusCode, 404)
  })
})

describe('POST /api/game/:id/day/resolve', () => {
  const day = (subject: string) => [
    { start: 0, halves: 2, activity: 'run', withPeople: [] },
    { start: 2, halves: 2, activity: 'breakfast', withPeople: [] },
    { start: 4, halves: 4, activity: 'study', target: subject, withPeople: [] },
    { start: 8, halves: 2, activity: 'lunch', withPeople: [] },
    { start: 16, halves: 2, activity: 'dinner', withPeople: [] },
    { start: 20, halves: 2, activity: 'sleep', withPeople: [] },
  ]

  it('appends one action, and the sheet replays it', async () => {
    const id = await newGame()
    const res = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/resolve`,
      payload: { placements: day('math') },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.actionCount, 1)
    assert.equal(body.log.length, 1)
    assert.match(body.log[0], /^Mon 30 Aug — /)
    assert.ok(body.hoursBySubject.math > 0)
    assert.equal(body.next.day, 2)
    assert.equal(body.next.date, '2027-08-31')

    // The save is the log (§3): the sheet holds no day state, it replays the action.
    const sheet = (await app.inject({ method: 'GET', url: `/api/game/${id}` })).json()
    assert.equal(sheet.actionCount, 1)
    assert.equal(sheet.state.day, 2)
    assert.equal(sheet.state.date, '2027-08-31')
    assert.deepEqual(sheet.state.log, body.log)
    assert.equal(sheet.state.hoursBySubject.math, body.hoursBySubject.math)
  })

  it('carries the body into tomorrow rather than resetting it', async () => {
    const id = await newGame()
    await app.inject({ method: 'POST', url: `/api/game/${id}/day/resolve`, payload: { placements: day('math') } })
    const first = (await app.inject({ method: 'GET', url: `/api/game/${id}` })).json().state.body
    await app.inject({ method: 'POST', url: `/api/game/${id}/day/resolve`, payload: { placements: day('code') } })
    const second = (await app.inject({ method: 'GET', url: `/api/game/${id}` })).json().state
    assert.equal(second.day, 3)
    // Condition drifts without maintenance, which is what makes it the slow axis (§8).
    assert.ok(second.body.condition !== first.condition)
    assert.ok(second.hoursBySubject.math > 0 && second.hoursBySubject.code > 0)
  })

  it('refuses an illegal day with 422 and writes nothing', async () => {
    const id = await newGame()
    const res = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/resolve`,
      payload: {
        placements: [
          { start: 4, halves: 4, activity: 'study', target: 'math', withPeople: [] },
          { start: 5, halves: 2, activity: 'read', target: 'math', withPeople: [] },
        ],
      },
    })
    assert.equal(res.statusCode, 422)
    const problems = res.json().problems
    assert.ok(problems.some((p: { code: string }) => p.code === 'overlap'))
    // Only errors come back — a note is not a reason to refuse a day.
    assert.ok(problems.every((p: { severity: string }) => p.severity === 'error'))

    const sheet = (await app.inject({ method: 'GET', url: `/api/game/${id}` })).json()
    assert.equal(sheet.actionCount, 0)
  })

  it('accepts a day with notes on it, because nothing here forbids you', async () => {
    // No meal, no sleep, and a stranded half of study. All noted, all allowed — the day
    // resolves and the consequences arrive as numbers rather than as a refusal (§3.5).
    const id = await newGame()
    const res = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/resolve`,
      payload: { placements: [{ start: 4, halves: 1, activity: 'study', target: 'math', withPeople: [] }] },
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().day.hours.total, 0)
    assert.match(res.json().log[0], /never went to bed/)
  })

  it('is reproducible: the same actions replay to the same day', async () => {
    const a = await newGame()
    const b = await newGame()
    for (const id of [a, b]) {
      await app.inject({ method: 'POST', url: `/api/game/${id}/day/resolve`, payload: { placements: day('math') } })
    }
    const sheetA = (await app.inject({ method: 'GET', url: `/api/game/${a}` })).json().state
    const sheetB = (await app.inject({ method: 'GET', url: `/api/game/${b}` })).json().state
    assert.deepEqual(sheetA, sheetB, 'two saves with the same actions must resolve identically')
  })
})

describe('the day routes leak nothing', () => {
  it('never returns the seed', async () => {
    const id = await newGame()
    const resolved = await app.inject({
      method: 'POST',
      url: `/api/game/${id}/day/resolve`,
      payload: { placements: [{ start: 4, halves: 4, activity: 'study', target: 'math', withPeople: [] }] },
    })
    // Tier 1 has no draw to hide yet, but the habit is the point: the CI leak test at Tier 2
    // is this assertion grown teeth, and it is much cheaper to never start leaking.
    for (const res of [resolved, await app.inject({ method: 'GET', url: `/api/game/${id}` })]) {
      assert.equal(/"seed"/.test(res.body), false)
    }
  })
})
