import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import {
  Preset,
  Rules,
  TraitPack,
  indexTraits,
  type Trait,
  type TraitIndex,
} from '@harvard/engine'

/**
 * The content loader. This package exists so that `@harvard/engine` can keep its "no i/o"
 * property — the schemas live in the engine, the reading of files lives here
 * (ARCHITECTURE §2).
 *
 * Content is not state. Syllabi, trait packs, rules and presets are authored, committed,
 * and **hash-pinned**: a save records the hash it was created under, because a later trait
 * pack shifts rarity and would otherwise silently move every Affinity weight in every
 * existing save (§7.8, ARCHITECTURE §11.1).
 */

export type Content = {
  rules: Rules
  packs: TraitPack[]
  traits: Trait[]
  index: TraitIndex
  presets: Preset[]
  /** sha256 over every content file, sorted by path. Pinned into each save. */
  hash: string
}

const read = (path: string) => readFileSync(path, 'utf8')

const listYaml = (dir: string): string[] => {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((n) => n.endsWith('.yaml') || n.endsWith('.yml'))
    .sort()
    .map((n) => join(dir, n))
}

export function loadContent(root: string): Content {
  const files: { path: string; text: string }[] = []
  const take = (path: string) => {
    const text = read(path)
    files.push({ path, text })
    return text
  }

  const rules = Rules.parse(parse(take(join(root, 'rules.yaml'))))

  const packPaths = listYaml(join(root, 'traits'))
  if (packPaths.length === 0) throw new Error(`no trait packs found under ${root}/traits`)
  const packs = packPaths.map((p, i) => {
    const parsed = TraitPack.safeParse(parse(take(p)))
    if (!parsed.success) {
      throw new Error(`${p} is not a valid trait pack:\n${describe(parsed.error)}`)
    }
    // `core` must be the first pack: ordering is part of the hash, and rarity is computed
    // against the pool in a fixed order so that two loads agree.
    if (i === 0 && parsed.data.id !== 'core') {
      throw new Error(`the first trait pack must be \`core\`, found \`${parsed.data.id}\``)
    }
    return parsed.data
  })

  const traits = packs.flatMap((p) => p.traits)
  assertUniqueIds(traits)
  const index = indexTraits(traits)
  assertReferencesResolve(traits, index)
  assertNamespacesDisjoint(traits)

  const presets = listYaml(join(root, 'presets')).map((p) => {
    const parsed = Preset.safeParse(parse(take(p)))
    if (!parsed.success) {
      throw new Error(`${p} is not a valid preset:\n${describe(parsed.error)}`)
    }
    return parsed.data
  })

  // Sorted by path so the hash does not depend on directory-read order.
  const h = createHash('sha256')
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path.replaceAll('\\', '/').split('/content/').pop() ?? f.path)
    h.update('\0')
    h.update(f.text.replaceAll('\r\n', '\n'))
    h.update('\0')
  }

  return { rules, packs, traits, index, presets, hash: h.digest('hex').slice(0, 16) }
}

const describe = (e: { issues: { path: (string | number)[]; message: string }[] }) =>
  e.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')

/** Ids are append-only and globally unique across packs — presets and saves cite them. */
function assertUniqueIds(traits: readonly Trait[]): void {
  const seen = new Set<string>()
  for (const t of traits) {
    if (seen.has(t.id)) throw new Error(`duplicate trait id \`${t.id}\` across packs`)
    seen.add(t.id)
  }
}

/** A dangling `excludes` or `requires` is a content bug that would surface as a crash. */
function assertReferencesResolve(traits: readonly Trait[], index: TraitIndex): void {
  for (const t of traits) {
    for (const [field, ids] of [
      ['excludes', t.excludes],
      ['requiresAnyOf', t.requiresAnyOf],
      ['requiresOneOf', t.requiresOneOf],
    ] as const) {
      for (const id of ids) {
        if (!index.has(id)) {
          throw new Error(`trait \`${t.id}\`.${field} points at unknown trait \`${id}\``)
        }
      }
    }
  }
}

/**
 * The two tag namespaces must never merge (§7.8). A schema that lets one string serve both
 * will eventually let a trait grant Affinity for being bad at calculus.
 */
function assertNamespacesDisjoint(traits: readonly Trait[]): void {
  const kinds = new Set(traits.flatMap((t) => t.kinds))
  for (const t of traits) {
    for (const tag of Object.keys(t.affects)) {
      if (kinds.has(tag)) {
        throw new Error(
          `\`${tag}\` is used as both a subject tag and a kind tag — see GAME_DESIGN §7.8`,
        )
      }
    }
  }
}
