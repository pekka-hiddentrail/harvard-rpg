import {
  SUBJECT_TAGS,
  zeroLevels,
  type Levels,
  type Rules,
  type SubjectTag,
  type Trait,
  type TraitPick,
  type BuildRequest,
  type CreationBlock,
} from './schema.ts'

/**
 * Character creation. GAME_DESIGN §7.8.
 *
 * Three jobs, in dependency order:
 *   priceTrait()     — what a trait *should* cost, derived from its shape
 *   validateBuild()  — is this build legal, and if not, exactly why
 *   resolveLevels()  — what the build *did* to the seven subject levels
 *
 * Pure. No i/o, no clock, no randomness.
 */

export type TraitIndex = ReadonlyMap<string, Trait>

export const indexTraits = (traits: readonly Trait[]): TraitIndex =>
  new Map(traits.map((t) => [t.id, t]))

// ── priceTrait ──────────────────────────────────────────────────────────────────────

/** The shape of a trait's level effects: how far the biggest and second-biggest move. */
export type Shape = {
  primary: number
  secondary: number
  primaryTag: SubjectTag | null
  direction: 'buy' | 'refund' | 'none'
}

export function shapeOf(trait: Trait): Shape {
  const entries = Object.entries(trait.affects).filter(([, d]) => d !== 0) as [
    SubjectTag,
    number,
  ][]
  if (entries.length === 0) {
    return { primary: 0, secondary: 0, primaryTag: null, direction: 'none' }
  }
  // A trait must not push in both directions at once. `bad with numbers` is -2/-1, never
  // -2/+1: a trait that both hurts and helps the curriculum is two traits.
  const positive = entries.some(([, d]) => d > 0)
  const negative = entries.some(([, d]) => d < 0)
  if (positive && negative) {
    return { primary: 0, secondary: 0, primaryTag: null, direction: 'none' }
  }
  const sorted = [...entries].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  const first = sorted[0]!
  const second = sorted[1]
  return {
    primary: Math.abs(first[1]),
    secondary: second ? Math.abs(second[1]) : 0,
    primaryTag: first[0],
    direction: positive ? 'buy' : 'refund',
  }
}

export type Price = { points: number; shape: Shape } | { points: null; reason: string }

/**
 * `cost = round( schedule(shape) × weight(the specific tag) )`.
 *
 * Costs round **up** and refunds round **down**: the player is the one hunting
 * mispricings, so bias every rounding against them and the residual errors come out
 * boring instead of exploitable.
 *
 * Returns a signed number on the same convention as `Trait.cost` — negative spends.
 */
export function priceTrait(trait: Trait, rules: Rules): Price {
  if (trait.structural) return { points: null, reason: 'structural — outside the schedule' }
  const shape = shapeOf(trait)
  if (shape.direction === 'none' || shape.primaryTag === null) {
    return { points: null, reason: 'no single-direction level effect to price' }
  }
  const table = shape.direction === 'buy' ? rules.schedule.buy : rules.schedule.refund
  const row = table.find((r) => r.primary === shape.primary && r.secondary === shape.secondary)
  if (!row) {
    return {
      points: null,
      reason: `shape (primary ${shape.primary}, secondary ${shape.secondary}) is not on the ${shape.direction} schedule`,
    }
  }
  const weight = rules.tagWeights[shape.primaryTag] ?? 1
  const raw = row.points * weight
  const points = shape.direction === 'buy' ? -Math.ceil(raw) : Math.floor(raw)
  return { points, shape }
}

// ── validateBuild ───────────────────────────────────────────────────────────────────

export type Problem = { code: string; message: string }

export type ValidBuild = {
  ok: true
  picks: readonly TraitPick[]
  spent: number
  refunded: number
  levels: Levels
  languages: readonly string[]
}
export type BuildResult = ValidBuild | { ok: false; problems: Problem[] }

/**
 * Five checks. Each one reports the arithmetic or the missing prerequisite by name,
 * because this is a screen the player is actively editing — the r8 requirement that a
 * refusal is information rather than an error.
 */
export function validateBuild(
  build: BuildRequest,
  index: TraitIndex,
  rules: Rules,
): BuildResult {
  const problems: Problem[] = []
  const push = (code: string, message: string) => problems.push({ code, message })

  // 1. every id exists in the packs this save is pinned to
  const picks: TraitPick[] = []
  const seen = new Set<string>()
  for (const pick of build.traits) {
    const trait = index.get(pick.id)
    if (!trait) {
      push('unknown_trait', `No trait \`${pick.id}\` in the pinned packs.`)
      continue
    }
    if (seen.has(pick.id)) {
      push('duplicate_trait', `${trait.name} is picked twice.`)
      continue
    }
    seen.add(pick.id)
    picks.push(pick)
  }
  if (problems.length > 0) return { ok: false, problems }

  const chosen = picks.map((p) => index.get(p.id)!)

  // 2. the budget, exactly. Not ≤ — there is no banking, so "left 0" is always the goal.
  const spent = chosen.reduce((n, t) => n + (t.cost < 0 ? -t.cost : 0), 0)
  const refunded = chosen.reduce((n, t) => n + (t.cost > 0 ? t.cost : 0), 0)
  const net = spent - refunded
  if (net !== rules.creation.budget) {
    const left = rules.creation.budget - net
    push(
      'budget',
      left > 0
        ? `${left} point${left === 1 ? '' : 's'} unspent. The budget must be spent exactly.`
        : `Over budget by ${-left}.`,
    )
  }

  // 3. the refund cap — on total refund, not on the number of hindrances
  if (refunded > rules.creation.refundCap) {
    push(
      'refund_cap',
      `Refunds total ${refunded}, and the cap is ${rules.creation.refundCap}.`,
    )
  }

  // 4. exclusions, then prerequisites. Declarative and order-independent, which is the
  //    whole reason §7.8 chose `excludes` over a strip mechanic.
  for (const trait of chosen) {
    for (const other of trait.excludes) {
      if (seen.has(other)) {
        push(
          'excluded',
          `${trait.name} cannot be taken with ${index.get(other)?.name ?? other}.`,
        )
      }
    }
    if (trait.requiresAnyOf.length > 0 && !trait.requiresAnyOf.some((id) => seen.has(id))) {
      const names = trait.requiresAnyOf.map((id) => index.get(id)?.name ?? id).join(' or ')
      push('requires_any', `${trait.name} requires ${names}; you have neither.`)
    }
    if (trait.requiresOneOf.length > 0) {
      const picked = trait.requiresOneOf.filter((id) => seen.has(id))
      if (picked.length === 0) {
        const names = trait.requiresOneOf.map((id) => index.get(id)?.name ?? id).join(' · ')
        push('requires_one', `${trait.name} requires exactly one of: ${names}.`)
      } else if (picked.length > 1) {
        const names = picked.map((id) => index.get(id)?.name ?? id).join(' and ')
        push('requires_one', `${trait.name} allows only one of ${names}.`)
      }
    }
    // 5. a trait offering languages must have one chosen
    const pick = picks.find((p) => p.id === trait.id)!
    if (trait.grantsLanguageFrom.length > 0) {
      if (!pick.language) {
        push('language_unchosen', `${trait.name} needs a language chosen.`)
      } else if (!trait.grantsLanguageFrom.includes(pick.language)) {
        push(
          'language_invalid',
          `${pick.language} is not one of ${trait.name}'s languages.`,
        )
      }
    } else if (pick.language) {
      push('language_unexpected', `${trait.name} does not grant a language.`)
    }
  }

  if (problems.length > 0) return { ok: false, problems }

  return {
    ok: true,
    picks,
    spent,
    refunded,
    levels: resolveLevels(picks, index),
    languages: picks.flatMap((p) => (p.language ? [p.language] : [])),
  }
}

// ── resolveLevels ───────────────────────────────────────────────────────────────────

/**
 * Fold `affects` across the trait set. This is the whole of r10's argument made
 * mechanical: nothing but traits is ever bought, and the levels are what the traits *did*.
 */
export function resolveLevels(picks: readonly TraitPick[], index: TraitIndex): Levels {
  const levels = zeroLevels()
  for (const pick of picks) {
    const trait = index.get(pick.id)
    if (!trait) continue
    for (const tag of SUBJECT_TAGS) {
      levels[tag] += trait.affects[tag] ?? 0
    }
  }
  return levels
}

/** The immutable block that goes into the save. */
export function toCreationBlock(
  build: BuildRequest,
  valid: ValidBuild,
  index: TraitIndex,
  rules: Rules,
): CreationBlock {
  return {
    hometown: build.hometown,
    schoolType: build.schoolType,
    program: build.program,
    ...(build.targetTrack === undefined ? {} : { targetTrack: build.targetTrack }),
    budget: rules.creation.budget,
    traits: valid.picks.map((p) => ({
      id: p.id,
      cost: index.get(p.id)!.cost,
      ...(p.language === undefined ? {} : { language: p.language }),
    })),
    languages: [...valid.languages],
  }
}
