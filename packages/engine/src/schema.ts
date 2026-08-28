import { z } from 'zod'

/**
 * Content and state schemas. One Zod schema per shape, and the TypeScript types are
 * *inferred* from it rather than declared alongside — so a content file and a runtime
 * value can never disagree about what a trait is.
 *
 * This module is pure. No fs, no crypto, no clock. The loader lives in `packages/content`
 * precisely so that the engine keeps that property (ARCHITECTURE §2).
 */

// ── subject tags: the closed seven (GAME_DESIGN §4.1) ───────────────────────────────
export const SUBJECT_TAGS = [
  'math',
  'stats',
  'code',
  'writing',
  'reading',
  'lab',
  'discussion',
] as const

export const SubjectTag = z.enum(SUBJECT_TAGS)
export type SubjectTag = z.infer<typeof SubjectTag>

/** A level per subject tag. Seven numbers, and nothing else in state may hold one. */
export type Levels = Record<SubjectTag, number>

export const zeroLevels = (): Levels =>
  Object.fromEntries(SUBJECT_TAGS.map((t) => [t, 0])) as Levels

// ── traits ──────────────────────────────────────────────────────────────────────────
export const Trait = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    blurb: z.string().default(''),
    /** Negative spends from the budget, positive refunds into it. */
    cost: z.number().int(),
    /** Kind tags — what *sort* of fact this is. Affinity's second tier (§7.4). */
    kinds: z.array(z.string()).default([]),
    /** Subject tags this trait moves. A different namespace from `kinds`, always. */
    affects: z.record(SubjectTag, z.number().int()).default({}),
    excludes: z.array(z.string()).default([]),
    /** At least one of these must be in the build. */
    requiresAnyOf: z.array(z.string()).default([]),
    /** Exactly one of these must be in the build — the mandatory-child shape (r11). */
    requiresOneOf: z.array(z.string()).default([]),
    /** Picking this trait means picking one language from the list. */
    grantsLanguageFrom: z.array(z.string()).default([]),
    contagious: z.boolean().default(false),
    /** Authored opt-in: this trait bonds even though it is a hindrance (§7.7). */
    bonding: z.boolean().default(false),
    hidden: z.boolean().default(false),
    /** Effect is not a subject level, so priceTrait() does not check it (§7.8). */
    structural: z.boolean().default(false),
    /** Required whenever `structural` is true. The flag is otherwise an excuse. */
    why: z.string().optional(),
  })
  .strict()
  .refine((t) => !t.structural || (t.why && t.why.length > 0), {
    message: 'a structural trait must say `why` — see GAME_DESIGN §7.8',
  })
export type Trait = z.infer<typeof Trait>

export const TraitPack = z
  .object({
    version: z.number().int(),
    id: z.string().min(1),
    traits: z.array(Trait).min(1),
  })
  .strict()
export type TraitPack = z.infer<typeof TraitPack>

// ── rules ───────────────────────────────────────────────────────────────────────────
const ShapeRow = z
  .object({
    primary: z.number().int().nonnegative(),
    secondary: z.number().int().nonnegative(),
    points: z.number().int().positive(),
  })
  .strict()

export const Rules = z
  .object({
    creation: z
      .object({
        budget: z.number().int().positive(),
        refundCap: z.number().int().nonnegative(),
        priceTolerance: z.number().int().nonnegative(),
      })
      .strict(),
    subjectTags: z.array(SubjectTag),
    schedule: z
      .object({
        buy: z.array(ShapeRow).min(1),
        refund: z.array(ShapeRow).min(1),
        maxRefundPerTrait: z.number().int().positive(),
      })
      .strict(),
    tagWeights: z.record(SubjectTag, z.number().positive()),
  })
  .strict()
  .refine((r) => SUBJECT_TAGS.every((t) => r.subjectTags.includes(t)), {
    message: 'rules.subjectTags must list all seven subject tags',
  })
export type Rules = z.infer<typeof Rules>

// ── the build the player submits, and the block that gets saved ──────────────────────
export const TraitPick = z
  .object({ id: z.string().min(1), language: z.string().optional() })
  .strict()
export type TraitPick = z.infer<typeof TraitPick>

export const BuildRequest = z
  .object({
    hometown: z.string().min(1),
    schoolType: z.string().min(1),
    program: z.enum(['degree', 'exchange_term', 'exchange_year', 'visiting']),
    targetTrack: z.string().optional(),
    traits: z.array(TraitPick).min(1),
  })
  .strict()
export type BuildRequest = z.infer<typeof BuildRequest>

export const Preset = BuildRequest.extend({
  id: z.string().min(1),
  name: z.string().min(1),
}).strict()
export type Preset = z.infer<typeof Preset>

/**
 * The immutable creation block. Seed material, not an action — the event log describes a
 * character *playing*, so there is nothing in it before the character (ARCHITECTURE §4).
 *
 * Costs are kept even though nothing reads them in play: the epilogue can say what you
 * chose to be bad at, and a save must stay re-validatable against the content it was
 * created under. Starting levels are NOT stored — they are derived at boot (§8).
 */
export const CreationBlock = z
  .object({
    hometown: z.string(),
    schoolType: z.string(),
    program: BuildRequest.shape.program,
    targetTrack: z.string().optional(),
    budget: z.number().int(),
    traits: z.array(
      z.object({ id: z.string(), cost: z.number().int(), language: z.string().optional() }),
    ),
    languages: z.array(z.string()),
  })
  .strict()
export type CreationBlock = z.infer<typeof CreationBlock>

/**
 * The save. Tier 0 writes `actions: []` and never replays anything — but the shape is
 * complete from the first commit, because the alternative is retrofitting event sourcing
 * through three layers at Tier 2 (ARCHITECTURE §11.1).
 */
export const Save = z
  .object({
    id: z.string(),
    seed: z.string(),
    contentHash: z.string(),
    creation: CreationBlock,
    actions: z.array(z.unknown()),
  })
  .strict()
export type Save = z.infer<typeof Save>
