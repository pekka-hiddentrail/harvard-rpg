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

// ── shopping week (Tier 2, §4.6) ─────────────────────────────────────────────────────

/**
 * A build that is *bad with numbers* — math −2, which puts Math 21b's `math: 3` ask at a gap
 * of +5 and closes it. This is r11's own worked example, and it is the only way to reach the
 * not-survivable branch from real content: no trait grants worse than −2 and no course asks
 * more than 3, so +5 is exactly the extreme the catalogue can currently produce.
 */
const badWithNumbersBuild = () => {
  const preset = content.presets.find((p) => p.id === 'pekka')
  assert.ok(preset)
  const { id: _id, name: _name, ...build } = preset
  return {
    ...build,
    traits: [
      ...build.traits.filter((t) => t.id !== 'long_mathematics'),
      { id: 'bad_with_numbers' },
      // Two more to spend the budget exactly, which `validateBuild` insists on.
      { id: 'prep_school_writer' },
      { id: 'lab_hands' },
    ],
  }
}

const newGameFrom = async (payload: object): Promise<string> => {
  const created = await app.inject({ method: 'POST', url: '/api/game/new', payload })
  assert.equal(created.statusCode, 201, created.body)
  return created.json().gameId as string
}

const shopping = async (id: string) => {
  const res = await app.inject({ method: 'GET', url: `/api/game/${id}/shopping` })
  assert.equal(res.statusCode, 200, res.body)
  return res.json()
}

type PricedRow = {
  courseCode: string
  effort: number
  open: boolean
  drivingTag: string | null
  baseWeeklyHours: number
  personalWeeklyHours: number
  gaps: { tag: string; courseLevel: number; playerLevel: number; gap: number; multiplier?: number | null }[]
  sections?: { section: string }[]
}

const courseIn = (body: { courses: PricedRow[] }, code: string): PricedRow => {
  const found = body.courses.find((c) => c.courseCode === code)
  assert.ok(found, `${code} missing from the shopping payload`)
  return found
}

describe('GET /api/game/:id/shopping', () => {
  it('prices every course for this player, and says why it costs what it costs', async () => {
    const body = await shopping(await newGame())
    assert.equal(body.contentHash, content.hash)
    assert.equal(body.term, content.terms[0]?.id)
    assert.equal(body.cap, content.rules.academics.semesterEffortCap)
    assert.equal(body.courses.length, content.courses.length)

    // Pekka is code 0 against CS50's `code: 2` ask and math 2 against its `math: 1`, so the
    // course costs him more than its base — and the reason is `code`, not `math`.
    const cs50 = courseIn(body, 'cs50')
    assert.ok(cs50.personalWeeklyHours > cs50.baseWeeklyHours)
    assert.equal(cs50.drivingTag, 'code')
    assert.equal(cs50.open, true)
    const code = cs50.gaps.find((g) => g.tag === 'code')
    assert.equal(code?.gap, 2)
    assert.equal(code?.multiplier, 1.7)
    // Being *ahead* on math reads as a discount on that share, not as a penalty.
    assert.equal(cs50.gaps.find((g) => g.tag === 'math')?.gap, -1)
  })

  it('starts with an empty card and a summary that complains about nothing', async () => {
    const body = await shopping(await newGame())
    assert.deepEqual(body.enrolled, [])
    assert.equal(body.summary.effortTotal, 0)
    assert.equal(body.summary.over, false)
    assert.deepEqual(body.summary.closed, [])
  })

  it('carries the real section pool for courses that have one', async () => {
    const body = await shopping(await newGame())
    assert.ok(courseIn(body, 'expos20').sections!.length > 1, 'Expos 20 is many sections')
    // A course with no slot pool gets an empty list, not a missing key.
    assert.deepEqual(courseIn(body, 'chem17').sections, [])
  })

  it('closes a course with its reason attached, never as a bare refusal', async () => {
    const body = await shopping(await newGameFrom(badWithNumbersBuild()))
    const math21b = courseIn(body, 'math21b')
    assert.equal(math21b.open, false)
    assert.equal(math21b.drivingTag, 'math')
    // r11's mockup, field for field: "wants math 3, you −2, gap +5".
    const math = math21b.gaps.find((g) => g.tag === 'math')
    assert.equal(math?.courseLevel, 3)
    assert.equal(math?.playerLevel, -2)
    assert.equal(math?.gap, 5)
    // No multiplier at a closed gap — the course is shut, not merely expensive. (JSON drops
    // the `undefined`, so the key is simply absent.)
    assert.equal(math?.multiplier ?? null, null)
  })

  it('404s on a save that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/game/nope/shopping' })
    assert.equal(res.statusCode, 404)
  })
})

describe('POST /api/game/:id/shopping/preview', () => {
  // `await`ed rather than returned bare: fastify's `inject` is overloaded to be either a
  // promise or a chainable builder, and only awaiting it narrows to a `Response`.
  const preview = async (id: string, courseCodes: string[]) =>
    await app.inject({ method: 'POST', url: `/api/game/${id}/shopping/preview`, payload: { courseCodes } })

  it('totals a tentative cart without filing anything', async () => {
    const id = await newGame()
    const res = await preview(id, ['cs50', 'expos20', 'chem17'])
    assert.equal(res.statusCode, 200, res.body)
    const body = res.json()
    assert.equal(body.courses.length, 3)

    // The total is the sum of the rows on the same screen — addable by hand, which is the
    // property r11's "an argument they can check" actually rests on.
    const sum = body.courses.reduce((n: number, c: PricedRow) => n + c.effort, 0)
    assert.equal(body.summary.effortTotal, sum)

    // ...and nothing was committed.
    assert.deepEqual((await shopping(id)).enrolled, [])
  })

  it('warns above the semester effort cap and still refuses nothing', async () => {
    const id = await newGame()
    // Four of the heaviest courses in the catalogue, against a cap of 28.
    const res = await preview(id, ['chem17', 'chem27', 'ls1a', 'ps11'])
    assert.equal(res.statusCode, 200, 'over the cap is a warning, not an error')
    const { summary } = res.json()
    assert.ok(summary.effortTotal > content.rules.academics.semesterEffortCap)
    assert.equal(summary.over, true)
    assert.equal(summary.overBy, summary.effortTotal - content.rules.academics.semesterEffortCap)
  })

  it('names a closed course in the cart separately from being over the cap', async () => {
    const id = await newGameFrom(badWithNumbersBuild())
    const res = await preview(id, ['cs50', 'math21b'])
    assert.equal(res.statusCode, 200)
    const { summary } = res.json()
    assert.deepEqual(summary.closed, ['math21b'])
    assert.equal(summary.over, false, 'two courses is not too many; one of them is just shut')
  })

  it('totals an empty cart rather than erroring on it', async () => {
    const res = await preview(await newGame(), [])
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().summary.effortTotal, 0)
  })

  it('404s on a course code that is not in the catalogue', async () => {
    const res = await preview(await newGame(), ['cs50', 'not_a_course'])
    assert.equal(res.statusCode, 404)
    assert.match(res.json().error, /not_a_course/)
  })
})

describe('POST /api/game/:id/shopping/enrol and /drop', () => {
  // `payload: object` rather than `unknown`: `inject` is overloaded, and an `unknown` payload
  // makes it resolve to the chainable-builder overload instead of the promise one.
  const enrol = async (id: string, payload: object) =>
    await app.inject({ method: 'POST', url: `/api/game/${id}/shopping/enrol`, payload })
  const drop = async (id: string, courseCode: string) =>
    await app.inject({ method: 'POST', url: `/api/game/${id}/shopping/drop`, payload: { courseCode } })
  const term = content.terms[0]?.id

  it('files a course into the save, and the save is the log', async () => {
    const id = await newGame()
    const res = await enrol(id, { courseCode: 'chem17' })
    assert.equal(res.statusCode, 200, res.body)
    const body = res.json()
    assert.deepEqual(body.enrolled, [{ term, courseCode: 'chem17' }])
    assert.equal(body.actionCount, 1)

    // Reloaded from SQLite and replayed, it is still there — enrolment is derived from the
    // action log, never stored as a field of its own (ARCHITECTURE §3).
    const reloaded = await shopping(id)
    assert.deepEqual(reloaded.enrolled, [{ term, courseCode: 'chem17' }])
    assert.equal(reloaded.summary.effortTotal, courseIn(reloaded, 'chem17').effort)
  })

  it('accumulates a card and drops off it', async () => {
    const id = await newGame()
    await enrol(id, { courseCode: 'chem17' })
    await enrol(id, { courseCode: 'gened1046' })
    const after = (await drop(id, 'chem17')).json()
    assert.deepEqual(after.enrolled.map((e: { courseCode: string }) => e.courseCode), ['gened1046'])
    // Three actions, not one: the drop is a fact in the history, not an erasure of the enrol.
    assert.equal(after.actionCount, 3)
  })

  it('goes over the effort cap when asked to, and says so in a 200', async () => {
    const id = await newGame()
    for (const courseCode of ['chem17', 'chem27', 'ls1a', 'ps11']) {
      assert.equal((await enrol(id, { courseCode })).statusCode, 200, courseCode)
    }
    const { summary } = await shopping(id)
    assert.equal(summary.over, true, 'the cap is a line, not a wall (§4.6)')
    assert.ok(summary.overBy > 0)
  })

  it('refuses a not-survivable course, with the gap that closed it', async () => {
    const id = await newGameFrom(badWithNumbersBuild())
    const res = await enrol(id, { courseCode: 'math21b' })
    assert.equal(res.statusCode, 422)
    const body = res.json()
    assert.match(body.error, /not survivable/)
    assert.equal(body.drivingTag, 'math')
    assert.equal(body.gaps.find((g: { tag: string }) => g.tag === 'math').gap, 5)
    // Refused means nothing was written.
    assert.deepEqual((await shopping(id)).enrolled, [])
  })

  it('needs a section when the course is taught as many, and takes the one you picked', async () => {
    const id = await newGame()
    const missing = await enrol(id, { courseCode: 'expos20' })
    assert.equal(missing.statusCode, 422)
    assert.match(missing.json().error, /needs a section/)
    assert.ok(missing.json().sections.length > 1, 'and it lists which ones exist')

    const section = content.slots.find((s) => s.courseCode === 'expos20')?.section
    assert.ok(section)
    const filed = await enrol(id, { courseCode: 'expos20', section })
    assert.equal(filed.statusCode, 200, filed.body)
    assert.deepEqual(filed.json().enrolled, [{ term, courseCode: 'expos20', section }])
  })

  it('switches sections rather than filing the course twice', async () => {
    const id = await newGame()
    const [first, second] = content.slots.filter((s) => s.courseCode === 'expos20')
    assert.ok(first && second)
    await enrol(id, { courseCode: 'expos20', section: first.section })
    const res = await enrol(id, { courseCode: 'expos20', section: second.section })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.json().enrolled, [{ term, courseCode: 'expos20', section: second.section }])
  })

  it('refuses a section that does not exist', async () => {
    const res = await enrol(await newGame(), { courseCode: 'expos20', section: '999' })
    assert.equal(res.statusCode, 422)
    assert.match(res.json().error, /no section 999/)
  })

  it('refuses to drop a course that was never filed', async () => {
    const id = await newGame()
    const res = await drop(id, 'chem17')
    assert.equal(res.statusCode, 422)
    assert.match(res.json().error, /not enrolled/)
    // And appended nothing: a no-op in the log would be a lie about what happened.
    assert.equal((await shopping(id)).enrolled.length, 0)
  })

  it('404s an unknown course and 400s a malformed body', async () => {
    const id = await newGame()
    assert.equal((await enrol(id, { courseCode: 'not_a_course' })).statusCode, 404)
    assert.equal((await enrol(id, { nope: true })).statusCode, 400)
    assert.equal((await enrol(id, { courseCode: 'cs50', extra: 1 })).statusCode, 400)
  })

  it('leaks no seed and no outcome', async () => {
    const id = await newGame()
    const filed = await enrol(id, { courseCode: 'chem17' })
    const priced = await app.inject({ method: 'GET', url: `/api/game/${id}/shopping` })
    for (const res of [filed, priced]) {
      assert.equal(/"seed"/.test(res.body), false)
      // §4.4: price, never outcome. No grade, no letter, no card anywhere in a price.
      assert.equal(/"grade"|"letter"|"cards"/.test(res.body), false)
    }
  })
})

describe('GET /api/game/:id/term', () => {
  const enrol = async (id: string, payload: object) =>
    await app.inject({ method: 'POST', url: `/api/game/${id}/shopping/enrol`, payload })

  type Plan = {
    term: string
    firstDay: string
    lastDay: string
    courses: { courseCode: string; section?: string; meetings: { type: string; time: string; derivedTime: boolean; startBand: number; endBand: number }[] }[]
    days: { date: string; freeBands: number; density: string; conflicts: unknown[] }[]
    weeks: { week: number; monday: string; due: { courseCode: string; date: string }[]; baseHours: number; personalHours: number; freeBands: number; pressure: number }[]
    collisions: { a: string; b: string; severity: string; dates: string[]; derived: boolean }[]
    peakWeeks: number[]
  }

  const plan = async (id: string): Promise<Plan> => {
    const res = await app.inject({ method: 'GET', url: `/api/game/${id}/term` })
    assert.equal(res.statusCode, 200, res.body)
    return res.json().plan as Plan
  }

  it('answers with an empty term for a save that has enrolled in nothing', async () => {
    const p = await plan(await newGame())
    assert.deepEqual(p.courses, [])
    assert.equal(p.collisions.length, 0)
    // The days are still there, all of them free — an empty schedule is a real schedule, not
    // a missing one, and this is the screen a player sees before shopping week.
    assert.equal(p.days[0]?.date, content.terms[0]?.firstDay)
    assert.ok(p.weeks.length >= 14)
    assert.equal(p.weeks.every((w) => w.due.length === 0 && w.pressure === 0), true)
    assert.deepEqual(p.peakWeeks, [])
  })

  it('places every enrolled course on the band grid, saying which times are guessed', async () => {
    const id = await newGame()
    // CS50 is taught as many sections, so filing it means picking one — and the slot is what
    // carries the real published time.
    assert.equal((await enrol(id, { courseCode: 'cs50', section: '011' })).statusCode, 200)
    assert.equal((await enrol(id, { courseCode: 'ls1a' })).statusCode, 200)
    const p = await plan(id)
    assert.deepEqual(p.courses.map((c) => c.courseCode).sort(), ['cs50', 'ls1a'])
    for (const c of p.courses) {
      for (const m of c.meetings) {
        assert.match(m.time, /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/, `${c.courseCode} ${m.type}: ${m.time}`)
        assert.ok(m.endBand > m.startBand, `${c.courseCode} ${m.type} occupies no band`)
      }
    }
    // CS50 publishes its lecture time; LS 1A's lab is pattern-only, so it is derived. The
    // distinction has to survive the wire, or the client cannot tell the player which is real.
    const cs50 = p.courses.find((c) => c.courseCode === 'cs50')
    assert.equal(cs50?.meetings.find((m) => m.type === 'lecture')?.derivedTime, false)
    assert.equal(p.courses.find((c) => c.courseCode === 'ls1a')?.meetings.some((m) => m.derivedTime), true)
  })

  it('empties Thanksgiving week even with a full card', async () => {
    const id = await newGame()
    await enrol(id, { courseCode: 'cs50', section: '011' })
    for (const courseCode of ['ls1a', 'chem17']) await enrol(id, { courseCode })
    const p = await plan(id)
    const thanksgiving = p.weeks.find((w) => w.monday === '2026-11-23')
    assert.ok(thanksgiving, 'no week starting 2026-11-23')
    assert.equal(thanksgiving.freeBands, 7 * 11)
    assert.equal(thanksgiving.due.length, 0)
  })

  it('prices the same term differently for a player who is behind', async () => {
    // Same card, two builds. The hours due are a fact about the syllabus; the hours *you* owe
    // are not — which is the whole of §4.5, now visible per week rather than only per term.
    const strong = await newGame()
    const weak = await newGameFrom(badWithNumbersBuild())
    // Stat 110 asks `math 1, stats 3`, and `bad_with_numbers` is behind on both — unlike
    // Chem 17, where the same swap buys `lab_hands` and the weak build is the *cheaper* one.
    for (const id of [strong, weak]) {
      assert.equal((await enrol(id, { courseCode: 'stat110' })).statusCode, 200)
    }

    const [a, b] = [await plan(strong), await plan(weak)]
    const busiest = (p: Plan) => p.weeks.reduce((m, w) => (w.personalHours > m.personalHours ? w : m))
    assert.equal(busiest(a).baseHours, busiest(b).baseHours, 'the syllabus did not change')
    assert.ok(busiest(b).personalHours > busiest(a).personalHours, 'but the term did')
    for (const p of [a, b]) for (const w of p.weeks) assert.equal(Number.isFinite(w.personalHours), true)
  })

  it('reports a clash once per meeting pair, with its dates', async () => {
    const id = await newGame()
    // cs50 and math21b both hold a 09:00 lecture — one published, one derived off the block
    // grid — on the days they share.
    assert.equal((await enrol(id, { courseCode: 'cs50', section: '011' })).statusCode, 200)
    assert.equal((await enrol(id, { courseCode: 'math21b' })).statusCode, 200)
    const p = await plan(id)
    assert.ok(p.collisions.length >= 1, 'no collision found')
    const clash = p.collisions.find((c) => c.a.startsWith('cs50') && c.b.startsWith('math21b'))
    assert.ok(clash, JSON.stringify(p.collisions))
    assert.ok(clash.dates.length > 1, 'a recurring clash reported only once')
    assert.equal(clash.derived, true)
    // Every folded date is also in the per-day list, which is what a single day's view reads.
    const conflicted = new Set(p.days.filter((d) => d.conflicts.length > 0).map((d) => d.date))
    for (const date of clash.dates) assert.ok(conflicted.has(date), `${date} missing from days`)
  })

  it('404s an unknown save and leaks no seed and no outcome', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/game/nope/term' })).statusCode, 404)
    const id = await newGame()
    await enrol(id, { courseCode: 'cs50', section: '011' })
    const res = await app.inject({ method: 'GET', url: `/api/game/${id}/term` })
    assert.equal(/"seed"/.test(res.body), false)
    assert.equal(/"grade"|"letter"|"cards"|"lean"/.test(res.body), false)
  })
})

describe('GET /api/game/:id/plan', () => {
  type Group = {
    id: string
    label: string
    need: number
    have: number
    state: string
    optional: boolean
    assigned: string[]
    credited: string[]
    routes: string[]
    abstractSlots: string[]
    dependsOnAbstract: boolean
    next?: string
    notes: string[]
  }
  type TrackRow = {
    trackId: string
    name: string
    status: string
    needMore: number
    slotsLeft: number
    slack: number
    counted: string[]
    wasted: string[]
    reasons: string[]
    groups: Group[]
  }
  type Body = {
    taken: string[]
    termsUsed: number
    tracks: TrackRow[]
    blocked: { blocked: string; tag: string; gap: number; via: { courseCode: string; demand: number }[] }[]
  }

  const studyPlanOf = async (id: string): Promise<Body> => {
    const res = await app.inject({ method: 'GET', url: `/api/game/${id}/plan` })
    assert.equal(res.statusCode, 200, res.body)
    return res.json() as Body
  }

  it('solves every track for a save that has enrolled in nothing', async () => {
    const body = await studyPlanOf(await newGame())
    // §3.4: all of them, always. A "chosen track" fast path is how the planner stops being
    // able to tell you a concentration you were not thinking about just closed.
    assert.equal(body.tracks.length, content.tracks.length)
    assert.deepEqual(body.taken, [])
    assert.equal(body.termsUsed, 1)
    // Nothing taken, eight terms of four: every track is still comfortably reachable.
    assert.ok(body.tracks.every((t) => t.status === 'slack'), JSON.stringify(body.tracks.map((t) => [t.trackId, t.status])))
    assert.ok(body.tracks.every((t) => t.slotsLeft === 28))
  })

  it('credits a filed course to the concentration it serves, and says what it does not', async () => {
    const id = await newGame()
    await app.inject({ method: 'POST', url: `/api/game/${id}/shopping/enrol`, payload: { courseCode: 'math21b' } })
    const body = await studyPlanOf(id)
    assert.deepEqual(body.taken, ['math21b'])
    const mbb = body.tracks.find((t) => t.trackId === 'cs_mbb')!
    assert.deepEqual(mbb.counted, ['math21b'])
    assert.equal(mbb.groups.find((g) => g.id === 'linear-algebra')?.state, 'done')
    // The same course counts elsewhere too, which is the point of running every track.
    assert.equal(body.tracks.find((t) => t.trackId === 'math')?.counted.length, 1)
    // And it does nothing at all for the econ tracks.
    assert.deepEqual(body.tracks.find((t) => t.trackId === 'econ_basic')?.wasted, ['math21b'])
  })

  it('does not let one course satisfy three groups just because three groups list it', async () => {
    // Math 101 appears in the Mathematics track's math-courses, breadth-algebra and
    // breadth-geometry-topology. Taking it is one course.
    const id = await newGame()
    await app.inject({ method: 'POST', url: `/api/game/${id}/shopping/enrol`, payload: { courseCode: 'math101' } })
    const math = (await studyPlanOf(id)).tracks.find((t) => t.trackId === 'math')!
    const satisfied = math.groups.filter((g) => g.state === 'done')
    assert.equal(satisfied.length, 1)
    // `counts` still credits the parent: the breadth course is one of the eight, not a ninth.
    const big = math.groups.find((g) => g.id === 'math-courses')!
    assert.equal(big.have, 1)
    assert.deepEqual(big.credited, ['math101'])
    assert.deepEqual(big.assigned, [])
  })

  it('carries the authored notes the graph cannot enforce', async () => {
    const math = (await studyPlanOf(await newGame())).tracks.find((t) => t.trackId === 'math')!
    const thesis = math.groups.find((g) => g.id === 'thesis')!
    assert.equal(thesis.optional, true)
    // "thesis OR four extra courses" is not expressible, so it is said out loud instead.
    assert.match(thesis.notes.join(' '), /thesis OR four extra courses/)
  })

  it('reports a requirement no course in content can satisfy as exactly that', async () => {
    const math = (await studyPlanOf(await newGame())).tracks.find((t) => t.trackId === 'math')!
    const paper = math.groups.find((g) => g.id === 'expository-paper')!
    assert.deepEqual(paper.routes, [])
    assert.deepEqual(paper.abstractSlots, ['math_expository_paper'])
    // §9.3: report why. Silently satisfying it would let the track claim to be finished.
    assert.match(math.reasons.join('\n'), /Math Expository Requirement: no course in content satisfies this/)
  })

  it('names the next course of a sequence rather than the whole sequence', async () => {
    const econ = (await studyPlanOf(await newGame())).tracks.find((t) => t.trackId === 'econ_basic')!
    const seq = econ.groups.find((g) => g.next !== undefined)!
    assert.equal(seq.next, 'econ10a')
    assert.match(econ.reasons.join('\n'), /must be taken in order; next is econ10a/)
  })

  it('surfaces "counts toward" on the catalogue, with no save needed', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/courses' })
    assert.equal(res.statusCode, 200)
    const body = res.json() as {
      tracks: { id: string }[]
      courses: { courseCode: string; countsToward: { trackId: string; groupId: string; groupLabel: string }[] }[]
    }
    assert.equal(body.tracks.length, content.tracks.length)
    const cs50 = body.courses.find((c) => c.courseCode === 'cs50')!
    assert.ok(cs50.countsToward.some((r) => r.trackId === 'cs_mbb' && r.groupId === 'cs-core'))
    // Expos 20 is a college-wide requirement, and there is no college-wide requirements file
    // in content — so it honestly counts toward no concentration rather than being faked.
    assert.deepEqual(body.courses.find((c) => c.courseCode === 'expos20')?.countsToward, [])
  })

  it('names a way out of a course a weak build is shut out of, rather than only refusing', async () => {
    const weak = await newGameFrom(badWithNumbersBuild())
    const body = await studyPlanOf(weak)
    // r11 (§9.3): the honest answer is "closed this year, and here is the cheapest way to open
    // it". A `blocked` entry with an empty `via` would be a refusal wearing a suggestion's suit.
    for (const b of body.blocked) {
      assert.ok(b.via.length > 0, `${b.blocked} is shut on ${b.tag} with no route out`)
      assert.deepEqual(b.via.map((v) => v.demand), [...b.via.map((v) => v.demand)].sort((x, y) => x - y))
    }
  })

  it('404s for a save that does not exist, and leaks nothing when it does', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/game/nope/plan' })
    assert.equal(missing.statusCode, 404)
    const body = await app.inject({ method: 'GET', url: `/api/game/${await newGame()}/plan` })
    // §4.4: the study plan is about what a card forecloses, never about grades.
    for (const secret of ['grade', 'letter', 'cards', 'lean', 'seed']) {
      assert.ok(!body.body.includes(`"${secret}"`), `plan leaked ${secret}`)
    }
  })
})
