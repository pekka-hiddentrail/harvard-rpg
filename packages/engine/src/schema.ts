import { z } from 'zod'

/**
 * Content and state schemas. One Zod schema per shape, and the TypeScript types are
 * *inferred* from it rather than declared alongside — so a content file and a runtime
 * value can never disagree about what a trait is.
 *
 * This module is pure. No fs, no crypto, no clock. The loader lives in `packages/content`
 * precisely so that the engine keeps that property (ARCHITECTURE §2).
 */

// ── subject tags: the closed thirteen (GAME_DESIGN §4.1) ────────────────────────────
/**
 * Widened from seven to thirteen once the real ~160-course stub set showed the original
 * seven could not describe it: a Gen Ed asks for `ethics` and `discussion`, organic
 * chemistry asks for `lab` and `memorization`, and neither had anywhere to say so.
 *
 * Still **closed**, and for the same reason as before (§4.1) — every course stub carries
 * these, so a fourteenth means revisiting all of them. The widening happened deliberately
 * *before* the stubs were authored, which is the only cheap moment for it.
 *
 * `math` stays first: `app.ts` seeds the bot's standing routine from `subjectTags[0]`.
 */
export const SUBJECT_TAGS = [
  'math',
  'stats',
  'code',
  'writing',
  'reading',
  'lab',
  'discussion',
  'proof',
  'visual',
  'language',
  'fieldwork',
  'memorization',
  'ethics',
] as const

export const SubjectTag = z.enum(SUBJECT_TAGS)
export type SubjectTag = z.infer<typeof SubjectTag>

/** A level per subject tag. Thirteen numbers, and nothing else in state may hold one. */
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
    academics: z
      .object({
        /**
         * A soft warning line at shopping week (§4.6), not a hard block — going over
         * is allowed, the game just says so. GAME_DESIGN §4.6.
         */
        semesterEffortCap: z.number().int().positive(),
        /**
         * The shape of the degree, which is what makes a track's feasibility a *number*
         * rather than a vibe: `k` remaining terms × `coursesPerTerm` slots is the budget
         * every requirement group is competing for (GAME_DESIGN §9.3). Authored here rather
         * than as a constant in the solver because "four courses a term for eight terms" is
         * a rule about Harvard, and the solver should not be the place it is written down.
         */
        coursesPerTerm: z.number().int().positive(),
        termsToDegree: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .refine((r) => SUBJECT_TAGS.every((t) => r.subjectTags.includes(t)), {
    message: `rules.subjectTags must list every subject tag (all ${SUBJECT_TAGS.length} of them)`,
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
    /**
     * What the department's brochure says that this schema cannot express — *"21b/22a are the
     * default routes"*, *"Math Ma + Mb count as one combined credit"*, *"thesis OR four extra
     * courses"*. Authored prose, never parsed: the solver surfaces it verbatim next to the
     * group so a rule the graph can't enforce is at least a rule the player can read. Adding
     * machinery for each of these would be a worse trade than saying them out loud.
     */
    notes: z.array(z.string()).default([]),
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

/**
 * One file under `content/tracks/`, which is one track — not a pack of them. The earlier
 * `TrackPack` shape (`{ version, id, tracks: [...] }`) was never what any of the seven files
 * on disk looked like, and nothing loaded them, so nothing caught it. `version` is optional
 * because only one of the seven carries it; it is read and discarded, like every other pack's.
 */
export const TrackFile = Track.extend({
  version: z.number().int().optional(),
}).strict()
export type TrackFile = z.infer<typeof TrackFile>

// ── syllabus: the academic spine (Tier 2, GAME_DESIGN §4.1) ─────────────────────────
export const Weekday = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
export type Weekday = z.infer<typeof Weekday>

/**
 * The weekly shapes a course meeting comes in. The first three are Harvard's real *block*
 * patterns, which is what `BLOCK_STARTS` grids against: MWF meets three times a week at 50
 * minutes each; TTh and MW meet twice a week at 75 minutes each.
 *
 * The last three are the off-block shapes the real ~160-course catalogue turned out to
 * need, and they are deliberately not block slots: a `Th` science lab, a `W` junior
 * tutorial, and the `MTWThF` daily elementary language class all run longer (or shorter)
 * than any block, at times the registrar publishes per course rather than off the grid.
 * They live here rather than as hand-written `time` ranges because what's actually known
 * about them is *which day and roughly how long* — inventing a start time per course would
 * look more precise than the data is (see `time` on `Meeting`).
 */
export const MeetingPattern = z.enum(['MWF', 'TTh', 'MW', 'Th', 'W', 'MTWThF'])
export type MeetingPattern = z.infer<typeof MeetingPattern>

/**
 * Real, closed facts about the block schedule — not authored per course. Minutes are **per
 * meeting day**: `meetingHours` multiplies by `days.length`, so `MTWThF` is 5 h/week and
 * `Th` is 3 h.
 */
export const BLOCK_MINUTES: Record<MeetingPattern, number> = {
  MWF: 50,
  TTh: 75,
  MW: 75,
  /** A science lab section: one long afternoon, the standard three hours. */
  Th: 180,
  /** A tutorial — junior/sophomore tutorials and Econ 970 meet once a week for two hours. */
  W: 120,
  /** Elementary language: an hour a day, five days a week. */
  MTWThF: 60,
}
export const BLOCK_STARTS = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30'] as const

/** Evening starts, for the meetings that don't fit the daytime grid — a three-hour lab or a
 * two-hour tutorial. Separate from `BLOCK_STARTS` because these are not block slots. */
export const BLOCK_NIGHT_STARTS = ['18:00', '19:30'] as const

/**
 * Whether attendance is actually expected. Real rule of thumb: sections, labs and
 * tutorials are `mandatory` (so are language classes and every Gen Ed course, regardless
 * of meeting type — Gen Ed isn't modeled as its own flag since no current course needs it,
 * but a future one should still mark its lecture `mandatory`); a large, recorded lecture is
 * typically `flexible`.
 *
 * `expected` is the middle case, and the most common one in the real catalogue — a
 * 20-person seminar or a 50-person lecture where nobody takes attendance but everybody
 * notices. It carries no mechanical cost yet; §4.3's missed-attendance inflation is where
 * it will land, and the point of recording it now is that the distinction is a fact about
 * the course, not a rule about the player, so it belongs in content whether or not a rule
 * reads it yet.
 */
export const Attendance = z.enum(['mandatory', 'expected', 'flexible'])
export type Attendance = z.infer<typeof Attendance>

/** Registrar identifiers are strings so leading zeroes remain significant. */
export const CourseId = z.string().regex(/^\d{3}$/, 'course id must be exactly three digits')
export type CourseId = z.infer<typeof CourseId>

export const SectionId = z.string().regex(/^\d{3}$/, 'section id must be exactly three digits')
export type SectionId = z.infer<typeof SectionId>

/** Stable human-readable code used in authored content and URLs, such as `cs50`. */
export const CourseCode = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*$/,
    'course code must start with a letter and contain only lowercase letters and digits',
  )
export type CourseCode = z.infer<typeof CourseCode>

/**
 * What kind of room you are in. `section` appears on `CourseSlot` rather than here in
 * practice — a syllabus names the pattern its sections share, the slot pool names the
 * instances. `drill` is the daily elementary-language class (Latin 1, Greek 1); it is not
 * called `language` because a subject tag already owns that string and §7.8's whole point
 * is that one string never serves two meanings.
 */
export const MeetingType = z.enum([
  'lecture',
  'section',
  'lab',
  'seminar',
  'tutorial',
  'activeLearning',
  'drill',
])
export type MeetingType = z.infer<typeof MeetingType>

export const Meeting = z
  .object({
    type: MeetingType,
    days: z.array(Weekday).min(1),
    /**
     * One of the three real block patterns, when this meeting is a canonical class
     * slot — absent for ad hoc arrangements (e.g. a TF-scheduled discussion section).
     * Deliberately no specific start time: content declares the pattern and never pins one
     * of `BLOCK_STARTS`/`BLOCK_NIGHT_STARTS`, because for 169 of the catalogue's 335
     * meetings that is genuinely all the import knew.
     *
     * `schedule.ts` resolves a pattern to a slot when something needs to draw the week —
     * derived from the course code, so every player sees the same hour, and overridden the
     * moment a real `time` is authored. A concrete section's slot comes from `CourseSlot`,
     * which does publish a `time`.
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
    attendance: Attendance,
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
    /** The course half of this slot's six-digit `(id, section)` identity. */
    id: CourseId,
    /** The concrete instance half of this slot's six-digit `(id, section)` identity. */
    section: SectionId,
    courseCode: CourseCode,
    type: MeetingType,
    pattern: MeetingPattern.optional(),
    /** The one real time this instance runs, e.g. `"09:00-11:45"`. */
    time: z.string().min(1),
    days: z.array(Weekday).min(1),
    size: z.number().int().positive(),
    attendance: Attendance,
    demand: z.number().int().min(1).max(10),
    /** Seats already taken. Seeded content, not derived — shopping week may move it. */
    occupied: z.number().int().nonnegative().default(0),
    /**
     * Present only for courses taught as many theme-varying sections (Expos 20). A
     * player's actual section is drawn from the pool of slots that have these set.
     */
    theme: z.string().min(1).optional(),
    blurb: z.string().min(1).optional(),
    instructor: z.string().min(1).optional(),
  })
  .strict()
  .refine((s) => s.occupied <= s.size, { message: 'occupied cannot exceed size' })
export type CourseSlot = z.infer<typeof CourseSlot>

/** The complete shopping-cart pool; composite slot identifiers must be unique. */
export const CourseSlotList = z.array(CourseSlot).superRefine((slots, ctx) => {
  const seen = new Set<string>()
  for (const [index, slot] of slots.entries()) {
    const key = `${slot.id}${slot.section}`
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'section'],
        message: `duplicate course slot identifier \`${key}\``,
      })
    }
    seen.add(key)
  }
})
export type CourseSlotList = z.infer<typeof CourseSlotList>

/**
 * No `date` here on purpose. A session's real date is a function of the course's
 * `meetings` pattern and the shared term calendar (`Term`, below) — computed once by
 * `fitSessions`, not hand-typed per course and re-derived against holidays three times.
 */
export const Session = z
  .object({
    n: z.number().int().positive(),
    topic: z.string().min(1),
  })
  .strict()
export type Session = z.infer<typeof Session>

/**
 * The one shared term calendar every course's `meetings` is fit against — term bounds
 * and holiday closures declared once, not re-derived by hand in every syllabus.
 */
export const Term = z
  .object({
    id: z.string().min(1),
    firstDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  })
  .strict()
export type Term = z.infer<typeof Term>

/**
 * A date expressed relative to the term, not pinned absolutely — the same reason `Session`
 * carries no date (see `fitSessions.ts`): a holiday shifting which real day a course's Nth
 * weekly meeting falls on must not silently invalidate an authored due date.
 *
 * `week` is the term week: 1-indexed, Monday-anchored, counted from the Monday on or before
 * the term's `firstDay` (so week 1 always contains the first day of classes, even when that
 * day is a Tuesday). Exactly one of `session`/`day` says which day of that week:
 *
 * - `session` picks the Nth of the course's OWN real meetings that week — holiday-proof, so
 *   if Monday is a holiday, "week 5, session 1" is whichever day actually met that week, not
 *   literally Monday. Use this for anything tied to the course's own meeting pattern.
 * - `day` names an explicit weekday, for a date that isn't one of the course's own meetings
 *   at all — an evening exam outside the lecture pattern, a final-project deadline that
 *   falls in reading period.
 */
export const CourseWeek = z
  .object({
    week: z.number().int().positive(),
    session: z.number().int().positive().optional(),
    day: Weekday.optional(),
  })
  .strict()
  .refine((w) => (w.session == null) !== (w.day == null), {
    message: 'a CourseWeek needs exactly one of `session` or `day`, not both and not neither',
  })
export type CourseWeek = z.infer<typeof CourseWeek>

export const AssignmentKind = z.enum(['pset', 'exam', 'final', 'project', 'essay'])
export type AssignmentKind = z.infer<typeof AssignmentKind>

export const Assignment = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    kind: AssignmentKind,
    assigned: CourseWeek.optional(),
    due: CourseWeek.optional(),
    /** Exams and finals happen on a `date`, often outside normal class time. */
    date: CourseWeek.optional(),
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
      .array(z.object({ id: z.string().min(1), due: CourseWeek }).strict())
      .default([]),
    /** The one authored "abandon sunk work at a discount" mechanic (§4.1). */
    resettable: z
      .object({ carryover: z.number().min(0).max(1), before: CourseWeek })
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

export const OfficeHourLength = z
  .string()
  .regex(/^(?:free|[1-9]\d* minutes?)$/, 'office-hour length must be `free` or a duration such as `20 minutes`')
export type OfficeHourLength = z.infer<typeof OfficeHourLength>

/** One published opportunity to get help outside the course's regular meetings. */
export const OfficeHour = z
  .object({
    type: z.literal('officeHour'),
    length: OfficeHourLength,
    /** Whether a student must reserve a specific appointment rather than drop in. */
    booked: z.boolean(),
    days: z.array(Weekday).min(1),
    time: z.string().min(1),
    location: z.string().min(1),
    /**
     * How contested this office hour is. **Optional, and normally absent**: the standing
     * rule is one below the course's own demand, so an authored value carries no
     * information that `effectiveOfficeHourDemand` can't compute — and a stub can't know
     * the number anyway, since the course's demand is itself derived. Author it only to
     * record a genuine exception.
     */
    demand: z.number().int().min(1).max(10).optional(),
  })
  .strict()
export type OfficeHour = z.infer<typeof OfficeHour>

export const Syllabus = z
  .object({
    id: CourseId,
    courseCode: CourseCode,
    title: z.string().min(1),
    /**
     * Overall workload weight — what shopping week compares (§4.1). **Optional, and
     * normally absent**: `effectiveDemand` (effort.ts) derives it from the course's own
     * meetings, assignments and `demands`, so authoring it is an explicit override for a
     * course whose real workload is known to differ from what its structure implies.
     * Deriving is the point — 160 stubs must not carry 160 hand-guessed numbers that go
     * stale the moment their assignments are transcribed.
     */
    demand: z.number().int().min(1).max(10).optional(),
    /** Same: derived by `effectiveWorkloadHint` unless a real published figure is known. */
    workloadHint: z.string().min(1).optional(),
    /** r11 — what the course asks of you, per subject tag. */
    demands: z.record(SubjectTag, z.number().int().nonnegative()),
    meetings: z.array(Meeting).min(1),
    officeHours: z.array(OfficeHour).min(1),
    /**
     * Empty means **not authored yet** — a stub whose real syllabus hasn't been transcribed.
     * `fitSessions` skips an empty spine rather than throwing; a non-empty one must still
     * match the term calendar exactly. The distinction is the point: "no sessions" is a
     * legitimate state for one of the ~160 stubs, "35 sessions when the calendar says 36"
     * never is, and collapsing the two would cost the only check that catches a miscounted
     * holiday.
     */
    sessions: z.array(Session).default([]),
    /** Same convention as `sessions`: empty means unauthored, not "ungraded". */
    assignments: z.array(Assignment).default([]),
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
 * What an activity is *aimed at*. Tier 1 had only `'subject'`, because there were no courses
 * to aim at; Tier 2 adds `'course'` and keeps both, since they are not two spellings of one
 * thing. A band aimed at a course banks into that course's next unfinished item *and* splits
 * across every tag it demands (§4.4 step 1, `splitHoursByDemand`); a band aimed at a bare
 * subject banks only the tag, and at half rate when nothing on the card demands it
 * (`ISOLATED_STUDY_DISCOUNT`). Teaching yourself Greek nobody is examining you on is a real
 * and deliberately worse use of an afternoon, so the distinction has to survive in the data.
 *
 * `'subjectOrCourse'` is study and reading, which legitimately do either. The four-way enum
 * beats an array of allowed kinds: three activities use it, and `validatePlan` gets to stay a
 * switch rather than a set-membership test.
 */
export const ActivityTargets = z.enum(['none', 'subject', 'course', 'subjectOrCourse'])
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
    /**
     * A subject tag or an enrolled course code, per the activity's `targets`. A bare code and
     * never `course.item`: the player aims at the course and the engine banks into whatever
     * that course's nearest unfinished item is (§4.4 step 1). Which item that was is reported
     * back afterwards rather than chosen up front — "work on what's next" is both how a term
     * actually goes and one fewer decision per band.
     */
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

/**
 * Filing a course on your study card (§4.6). The Tier 2 actions, and the first two that
 * aren't a day.
 *
 * Both name their `term`, so a save that runs past one term folds into the right enrolment
 * instead of accumulating every course the character ever took into one list.
 *
 * `section` is a `CourseSlot.section`, not a slot id — the id is a content-file detail, the
 * section label ("A", "12") is the thing a player picked and the thing a schedule prints.
 * Optional because most courses have exactly one shape and nothing to choose.
 *
 * Add *and* drop, rather than one action carrying a whole course set, because that is what
 * add/drop is: a course you file in September and drop in October has to leave a trace in
 * the log, and a set-replacing action would erase the fact that you were ever in it.
 */
export const EnrolCourse = z
  .object({
    type: z.literal('enrol_course'),
    term: z.string().min(1),
    courseCode: z.string().min(1),
    section: z.string().min(1).optional(),
  })
  .strict()
export type EnrolCourse = z.infer<typeof EnrolCourse>

export const DropCourse = z
  .object({
    type: z.literal('drop_course'),
    term: z.string().min(1),
    courseCode: z.string().min(1),
  })
  .strict()
export type DropCourse = z.infer<typeof DropCourse>

export const Action = z.discriminatedUnion('type', [PlanDay, EnrolCourse, DropCourse])
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
