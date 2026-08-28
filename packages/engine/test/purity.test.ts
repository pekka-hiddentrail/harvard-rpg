import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * The boundary test. ARCHITECTURE §11.1 promised these rules would be enforced rather than
 * merely written down; they ship as a grep instead of an ESLint config — same enforcement,
 * no toolchain.
 *
 * Three properties, each of which is cheap to hold now and expensive to restore later:
 *
 *   1. the engine is deterministic — no clock, no randomness. `GameState = replay(seed,
 *      actions)` is false the moment one `Math.random()` gets in, and it fails silently:
 *      saves keep loading, they just stop meaning the same thing.
 *   2. the engine does no i/o and imports neither the narrator nor the content loader.
 *      The narrator direction matters most: a simulation that can ask the LLM for a number
 *      is a simulation whose consequences are not reproducible (§1).
 *   3. the client holds zero game rules — it cannot compute a cost, a level, or a grade.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

const sources = (dir: string): string[] => {
  const out: string[] = []
  const walk = (d: string) => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true, encoding: 'utf8' })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
  }
  walk(dir)
  return out
}

const scan = (dir: string, patterns: [RegExp, string][]) => {
  const offences: string[] = []
  for (const file of sources(join(repo, dir))) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    for (const [pattern, why] of patterns) {
      lines.forEach((line, i) => {
        // A mention in a comment is a design note, not a call.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        if (pattern.test(line)) {
          offences.push(`${relative(repo, file)}:${i + 1} — ${why}\n    ${line.trim()}`)
        }
      })
    }
  }
  return offences
}

describe('engine boundaries', () => {
  it('has no clock and no randomness', () => {
    const offences = scan('packages/engine/src', [
      [/\bMath\.random\b/, 'the engine must be deterministic; draws come from the seed'],
      [/\bDate\.now\b/, 'the engine must not read the wall clock; in-game time is state'],
      [/\bnew Date\b/, 'the engine must not read the wall clock; in-game time is state'],
      [/\bperformance\.now\b/, 'the engine must not read the wall clock'],
      [/\bcrypto\.randomUUID\b/, 'ids must derive from the seed'],
    ])
    assert.deepEqual(offences, [], `\n${offences.join('\n')}\n`)
  })

  it('does no i/o and imports neither the narrator nor the content loader', () => {
    const offences = scan('packages/engine/src', [
      [/from\s+['"]node:(fs|crypto|http|https|child_process|net|os)['"]/, 'the engine does no i/o'],
      [/require\(['"]node:/, 'the engine does no i/o'],
      [/from\s+['"]@harvard\/(narrator|content|server|client)['"]/, 'the engine sits below every other package'],
      [/from\s+['"](fastify|better-sqlite3|ink|react|@anthropic-ai\/sdk)['"]/, 'the engine has one dependency, and it is zod'],
    ])
    assert.deepEqual(offences, [], `\n${offences.join('\n')}\n`)
  })
})

describe('client boundaries', () => {
  it('holds no game rules — it asks the server', () => {
    const offences = scan('packages/client/src', [
      [/from\s+['"]@harvard\/(engine|content|server)['"]/, 'the client must not import the rules'],
      [/from\s+['"](better-sqlite3|node:fs)['"]/, 'the client must not touch the save'],
      [/\bANTHROPIC_API_KEY\b/, 'the key is read server-side at boot and never leaves it'],
    ])
    assert.deepEqual(offences, [], `\n${offences.join('\n')}\n`)
  })
})

describe('the packages exist as declared', () => {
  it('engine declares zod and nothing else', () => {
    const pkg = JSON.parse(
      readFileSync(join(repo, 'packages/engine/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['zod'])
  })

  it('client declares no @harvard dependency', () => {
    const pkg = JSON.parse(
      readFileSync(join(repo, 'packages/client/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }
    assert.deepEqual(
      Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@harvard/')),
      [],
    )
  })
})
