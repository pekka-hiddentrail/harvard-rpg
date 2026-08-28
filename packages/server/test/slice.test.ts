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
