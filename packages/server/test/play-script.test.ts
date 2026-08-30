import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ensureServer } from '../../../scripts/play.ts'

describe('ensureServer', () => {
  it('starts the server when it is down and waits until it answers', async () => {
    const spawnCalls: string[] = []
    const fetchCalls: string[] = []

    let firstFetch = true

    const started = await ensureServer({
      fetch: async (url: string | URL) => {
        fetchCalls.push(String(url))
        if (firstFetch) {
          firstFetch = false
          return { ok: false } as Response
        }
        return { ok: true } as Response
      },
      spawn: (...args: [string, string[], Record<string, unknown>]) => {
        spawnCalls.push(args[0])
        return { unref: () => undefined } as ReturnType<typeof import('node:child_process').spawn>
      },
      setTimeout: (fn: () => void) => {
        fn()
        return 0 as any
      },
    })

    assert.equal(started, true)
    assert.ok(spawnCalls.length > 0)
    assert.ok(fetchCalls.length > 0)
  })
})
