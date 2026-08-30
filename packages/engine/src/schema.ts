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

/**
 * The day's numbers (r7, Tier 1). Every one of these is a **TIER 1 PLACEHOLDER** in the
 * same sense as `tagWeights`: they are authored guesses whose job is to be falsified by
 * the balance bot (ARCHITECTURE §11), not settled truths.
 */
const HungerRow = z
  .object({
    /** Bands elapsed since food, at or past which this row applies. */
    after: z.number().positive(),
    yieldMult: z.number().positive(),
    /** Energy drained per band while this hungry. */
    energy: z.number(),
  })
  .strict()

const FatigueRow = z
  .object({ atOrBelow: z.number(), yieldMult: z.number().positive() })
  .strict()

export const DayRules = z
  .object({
    /** Tier 1 plays one authored day. Tier 2's calendar replaces this field. */
    firstDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startEnergy: z.number(),
    startStress: z.number(),
    startCondition: z.number(),
    /** You slept; you did not eat. The clock does not start at zero (§3.5). */
    startBandsSinceFood: z.number().nonnegative(),
    /** A snack buys you this many bands — and the *next* one buys half as many (§3.5). */
    snackDefersBands: z.number().positive(),
    /** Ascending by `after`. The gap clock is the only thing that prices a meal. */
    hunger: z.array(HungerRow).min(1),
    /** Ascending by `atOrBelow`. */
    fatigue: z.array(FatigueRow).min(1),
    /** Working the Night band is borrowing against tomorrow (§3.1). */
    night: z
      .object({ energyPerBand: z.number(), stressPerBand: z.number() })
      .strict(),
    sleepEnergyPerBand: z.number(),
    /** Scaled by Condition — which is what makes the morning run a Stress buffer (§8). */
    sleepStressPerBand: z.number(),
    /**
     * Condition decays on its own, every day, and gains taper as it rises. Without both,
     * a daily run walks Condition to 100 in a month and the slow axis stops being one.
     */
    conditionDailyDrift: z.number().nonpositive(),
  })
  .strict()
  .refine((d) => d.hunger.every((r, i) => i === 0 || r.after > (d.hunger[i - 1]?.after ?? 0)), {
    message: 'rules.day.hunger must be sorted ascending by `after`',
  })
  .refine(
    (d) => d.fatigue.every((r, i) => i === 0 || r.atOrBelow > (d.fatigue[i - 1]?.atOrBelow ?? 0)),
    { message: 'rules.day.fatigue must be sorted ascending by `atOrBelow`' },
  )
export type DayRules = z.infer<typeof DayRules>

export const Rules = z
  .object({
    creation: z
      .object({
        budget: z.number().int().positive(),
        refundCap: z.number().int().nonnegative(),
        priceTolerance: z.number().int().nonnegative(),
      })
      .strict(),
    day: DayRules,
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

export const RequirementGroup = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(['course', 'set', 'sequence', 'tag']).default('course'),
    need: z.number().int().min(1).default(1),
    from: z.array(z.string()).default([]),
    oneOf: z.array(z.string()).default([]),
    anyOf: z.array(z.string()).default([]),
    counts: z.array(z.string()).default([]),
    subjectTag: z.string().optional(),
    optional: z.boolean().default(false),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    sequence: z.array(z.string()).default([]),
  })
  .strict()
  .refine((r) => !(r.kind === 'sequence' && r.sequence.length === 0), {
    message: 'sequence requirements must name at least one course in the order they should be taken',
  })
export type RequirementGroup = z.infer<typeof RequirementGroup>

export const CourseHint = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    likelyTracks: z.array(z.string()).default([]),
    countsToward: z.array(z.string()).default([]),
    leadsTo: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
  })
  .strict()
export type CourseHint = z.infer<typeof CourseHint>

export const Track = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    field: z.string().min(1),
    honorsEligible: z.boolean().default(false),
    thesisRequired: z.boolean().default(false),
    declareBy: z
      .object({
        year: z.number().int().positive(),
        term: z.enum(['fall', 'spring']),
      })
      .strict()
      .optional(),
    requirements: z.array(RequirementGroup).default([]),
    courseHints: z.array(CourseHint).default([]),
    diploma: z.string().optional(),
  })
  .strict()
export type Track = z.infer<typeof Track>

export const TrackPack = z
  .object({
    version: z.number().int(),
    id: z.string().min(1),
    tracks: z.array(Track).min(1),
  })
  .strict()
export type TrackPack = z.infer<typeof TrackPack>

// ── syllabus: the academic spine (Tier 2, GAME_DESIGN §4.1) ─────────────────────────
export const Weekday = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
export type Weekday = z.infer<typeof Weekday>

/** Harvard's three real class-meeting patterns. MWF meets three times a week at 50
 * minutes each; TTh and MW meet twice a week at 75 minutes each. */
export const MeetingPattern = z.enum(['MWF', 'TTh', 'MW'])
export type MeetingPattern = z.infer<typeof MeetingPattern>

/** Real, closed facts about the block schedule — not authored per course. */
export const BLOCK_MINUTES: Record<MeetingPattern, number> = { MWF: 50, TTh: 75, MW: 75 }
export const BLOCK_STARTS = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30'] as const
export const BLOCK_NIGHT_STARTS = ['18:00', '19:30'] as const

export const Meeting = z
  .object({
    type: z.enum(['lecture', 'section', 'lab', 'seminar']),
    days: z.array(Weekday).min(1),
    /**
     * One of the three real block patterns, when this meeting is a canonical class
     * slot — absent for ad hoc arrangements (e.g. a TF-scheduled discussion section).
     * Deliberately no specific start time: which of `BLOCK_STARTS`/`BLOCK_NIGHT_STARTS`
     * a given section lands on is a registration-time fact (the shopping cart, not built
     * yet), so content declares the pattern/range and never pins one slot.
     */
    pattern: MeetingPattern.optional(),
    /**
     * A concrete, always-published time (e.g. `"09:00-10:30"`), for the rare meeting
     * that really does run at one fixed slot for everyone — a big shared lecture, not a
     * small section. Distinct from `pattern`: a lecture like CS50's doesn't necessarily
     * even fit one of the three canonical block durations.
     */
    time: z.string().min(1).optional(),
    size: z.number().int().positive(),
    /** True when this meeting is the small, section-sized half of the course. */
    sections: z.boolean().default(false),
  })
  .strict()
export type Meeting = z.infer<typeof Meeting>

/**
 * A real, concrete, schedulable section instance — the "shopping cart" pool a student
 * actually picks from. Distinct from `Meeting`: a `Meeting` on a `Syllabus` names the
 * pattern/range shared by every section of a course; a `CourseSlot` is one specific,
 * capacity-tracked offering of it (GAME_DESIGN's shopping week, §4).
 */
export const CourseSlot = z
  .object({
    course: z.string().min(1),
    type: z.enum(['lecture', 'section', 'lab', 'seminar']),
    pattern: MeetingPattern.optional(),
    /** The one real time this instance runs, e.g. `"09:00-11:45"`. */
    time: z.string().min(1),
    days: z.array(Weekday).min(1),
    size: z.number().int().positive(),
    /** Seats already taken. Seeded content, not derived — shopping week may move it. */
    occupied: z.number().int().nonnegative().default(0),
  })
  .strict()
  .refine((s) => s.occupied <= s.size, { message: 'occupied cannot exceed size' })
export type CourseSlot = z.infer<typeof CourseSlot>

export const Session = z
  .object({
    n: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    topic: z.string().min(1),
  })
  .strict()
export type Session = z.infer<typeof Session>

export const AssignmentKind = z.enum(['pset', 'exam', 'final', 'project', 'essay'])
export type AssignmentKind = z.infer<typeof AssignmentKind>

export const Assignment = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    kind: AssignmentKind,
    assigned: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Exams and finals happen on a `date`, often outside normal class time. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    time: z.string().optional(),
    estHours: z.number().positive().optional(),
    weight: z.number().min(0).max(1),
    dependsOnSessions: z.array(z.number().int().positive()).default([]),
    /** Range shorthand kept as strings, e.g. `"1-12"`, so authors don't hand-expand them. */
    coversSessions: z.array(z.string()).default([]),
    /** Per-item override of the default 10/16 hour thresholds (§4.4). */
    brackets: z
      .object({ moderate: z.number().positive(), narrow: z.number().positive() })
      .strict()
      .optional(),
    stages: z
      .array(
        z
          .object({ id: z.string().min(1), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
          .strict(),
      )
      .default([]),
    /** The one authored "abandon sunk work at a discount" mechanic (§4.1). */
    resettable: z
      .object({
        carryover: z.number().min(0).max(1),
        before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
      .optional(),
    /** Player-facing guidance text — same job as `CourseHint.notes`. */
    notes: z.array(z.string()).default([]),
  })
  .strict()
  .refine((a) => (a.kind === 'exam' || a.kind === 'final' ? !!a.date : !!a.due), {
    message: 'exam/final assignments need a `date`; pset/project/essay assignments need a `due` date',
  })
export type Assignment = z.infer<typeof Assignment>

export const Syllabus = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    /** Overall workload weight — what shopping week compares (§4.1). */
    difficulty: z.number().int().min(1).max(10),
    workloadHint: z.string().min(1),
    /** r11 — what the course asks of you, per subject tag. */
    demands: z.record(SubjectTag, z.number().int().nonnegative()),
    meetings: z.array(Meeting).min(1),
    sessions: z.array(Session).min(1),
    assignments: z.array(Assignment).default([]),
    /**
     * Some courses (Expos 20, notably) are taught as many parallel sections that share
     * one structural skeleton — same units, same weights, same meeting pattern/range —
     * but each section picks its own theme and instructor. When present, a player's
     * actual section is drawn from this pool rather than always using `title`. Meeting
     * time is deliberately absent here too, for the same reason a `Meeting` never pins
     * one: it's a registration-time fact, not authored content.
     */
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1),
            theme: z.string().min(1),
            blurb: z.string().min(1),
            instructor: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
export type Syllabus = z.infer<typeof Syllabus>

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

// ── activities: what you can put in a band (§3.1) ────────────────────────────────────

/**
 * What an activity is *aimed at*. Tier 1 aims study at a subject tag because there are no
 * courses yet; Tier 2 replaces `'subject'` with assessments and assignments, and the
 * `target` field on a placement stops changing shape after that.
 */
export const ActivityTargets = z.enum(['none', 'subject'])
export type ActivityTargets = z.infer<typeof ActivityTargets>

export const Activity = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    blurb: z.string().default(''),
    /** study · meal · snack · exercise · rest · errand · social · sleep. Open, like `kinds`. */
    kind: z.string().min(1),
    targets: ActivityTargets.default('none'),
    /** Length in **half-bands**. `minHalves: 1` means it fits in a leftover half. */
    minHalves: z.number().int().positive(),
    maxHalves: z.number().int().positive(),
    /** The world sets the length — a lecture, a section, the Sunday long run. */
    fixed: z.boolean().default(false),
    /** Bands this may occupy. Empty = anywhere. An anchor names its drift here (§3.5). */
    allowedBands: z.array(z.number().int().nonnegative()).default([]),
    /**
     * Hours banked, by duration: `curve[halves - 1]`. Empty for activities that bank none.
     *
     * **The curve is the spin-up rule** (§3.1), not a separate mechanic. A study curve
     * opens at `0.0`, so a half-band session buys nothing — the half is spent finding the
     * seat and opening the notes. Its 1.5-band entry is ~1.7× its 1-band entry, because
     * overrunning a session you are already spun up for is the cheapest hour in the game.
     * A curve that keeps a full rate in its first half (reading notes already open) simply
     * opens at half a band's worth instead. One authored array covers both cases.
     */
    curve: z.array(z.number().nonnegative()).default([]),
    /** Applied per band occupied, whatever the yield. */
    perBand: z
      .object({
        energy: z.number().default(0),
        stress: z.number().default(0),
        condition: z.number().default(0),
      })
      .strict()
      .default({}),
    /** A meal resets the gap clock; a snack defers it and costs Condition (§3.5). */
    food: z.enum(['none', 'meal', 'snack']).default('none'),
    /** Ends the day, and pays Stress back at a rate Condition sets (§8). */
    sleep: z.boolean().default(false),
  })
  .strict()
  .refine((a) => a.maxHalves >= a.minHalves, { message: 'maxHalves must be ≥ minHalves' })
  .refine((a) => !a.fixed || a.minHalves === a.maxHalves, {
    message: 'a fixed-length activity must have minHalves === maxHalves',
  })
  .refine((a) => a.curve.length === 0 || a.curve.length === a.maxHalves, {
    message: 'curve must have exactly one entry per half-band up to maxHalves',
  })
export type Activity = z.infer<typeof Activity>

export const ActivityPack = z
  .object({ version: z.number().int(), activities: z.array(Activity).min(1) })
  .strict()
export type ActivityPack = z.infer<typeof ActivityPack>

// ── the actions: what the player did (ARCHITECTURE §3) ───────────────────────────────

/**
 * One allocation. `start` is a **half-band index** (band × 2, +1 for the second half) and
 * `halves` is its length, which is how r7's 1.5-band sessions exist without a second event
 * model: a placement that starts on a band boundary and runs three halves takes the whole
 * of one band and the first half of the next.
 */
export const Placement = z
  .object({
    start: z.number().int().min(0),
    halves: z.number().int().positive(),
    activity: z.string().min(1),
    /** A subject tag at Tier 1 (see `ActivityTargets`). */
    target: z.string().optional(),
    withPeople: z.array(z.string()).default([]),
  })
  .strict()
export type Placement = z.infer<typeof Placement>

/** The Tier 1 action, and the first real entry in the log. */
export const PlanDay = z
  .object({
    type: z.literal('plan_day'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    placements: z.array(Placement),
  })
  .strict()
export type PlanDay = z.infer<typeof PlanDay>

export const Action = z.discriminatedUnion('type', [PlanDay])
export type Action = z.infer<typeof Action>

/**
 * The save. Tier 0 wrote `actions: []`; Tier 1 gives the array its union, which is the
 * whole reason the field shipped empty rather than absent (ARCHITECTURE §11.1).
 */
export const Save = z
  .object({
    id: z.string(),
    seed: z.string(),
    contentHash: z.string(),
    creation: CreationBlock,
    actions: z.array(Action),
  })
  .strict()
export type Save = z.infer<typeof Save>
