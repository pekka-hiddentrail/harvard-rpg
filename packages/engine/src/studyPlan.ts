import type { Levels, RequirementGroup, Rules, SubjectTag, Syllabus, Track } from './schema.ts'
import { NOT_SURVIVABLE_GAP, demandGap } from './demands.ts'
import { courseGaps } from './shopping.ts'

/**
 * The requirement solver (ARCHITECTURE §3.4, GAME_DESIGN §9.1–§9.3).
 *
 * The question: given the courses on your card, `k` remaining terms of `coursesPerTerm`
 * slots, and a track's requirement graph, is the track still reachable — and if not, *why*.
 * A solver that returns `false` is useless here (§9.3), so every output carries its reason.
 *
 * Scoped deliberately small, per §3.4: ~12 groups, ≤32 slots, ~160 courses. Greedy assignment
 * with backtracking over groups sorted by scarcity resolves every real case in microseconds.
 * There is no LP solver, no SAT solver, and no dependency. If it ever gets slow the fix is
 * memoising on `(taken, trackId)`, not a better algorithm.
 *
 * ── Three things content forced this to get right ────────────────────────────────────────
 *
 * **Abstract slots.** A `from` entry need not be a course. `math_senior_thesis` is a
 * deliverable; `econ_elective_3` is "an elective, you pick"; `cs91r` and `math18a` are real
 * Harvard courses the catalogue simply doesn't carry yet. All three read identically from
 * here, so the solver does not guess: an entry no syllabus matches is an **abstract slot**,
 * which still consumes one of your 32 slots but cannot be planned against a specific course.
 * It is reported as such. Treating these as unsatisfiable would close almost every track;
 * treating them as free would let a track claim to be done when the thesis is unwritten.
 *
 * **One course, one group — except where `counts` says otherwise.** Math 101 appears in three
 * of the Mathematics track's groups, and a student who takes it has not thereby satisfied
 * three requirements. So assignment is a matching: each course serves one group. `counts` is
 * the authored exception — `math-courses` counts the breadth groups, meaning the three breadth
 * courses are three of its eight rather than three more on top.
 *
 * **The graph is not the whole bill.** A joint concentration's allied field, the "4 of 8 must
 * be 100-level" sub-rule, "thesis OR four extra courses" — none are expressible here, and
 * each is authored as a `notes` line instead. `TrackProgress` carries those notes verbatim so
 * a rule the solver cannot enforce is at least a rule the player can read.
 */

/** How a single requirement group stands against a card. */
export type GroupProgress = {
  id: string
  label: string
  kind: RequirementGroup['kind']
  need: number
  /** Whether the group is required at all — an optional thesis does not close a track. */
  optional: boolean
  /** Courses you are taking that the solver assigned to *this* group. */
  assigned: string[]
  /** Courses assigned to a group this one `counts`, credited here as well. */
  credited: string[]
  /** `assigned.length + credited.length`, capped at nothing — over-serving is visible. */
  have: number
  state: 'done' | 'partial' | 'open'
  /** Real courses in the pool you have not taken: the routes still open to you. */
  routes: string[]
  /** Pool entries that are not courses in content. Still cost slots; cannot be shopped for. */
  abstractSlots: string[]
  /**
   * True when the group cannot be finished out of the catalogue alone — it needs more courses
   * than it has real routes left, so some of its remaining slots must be abstract ones. CS 50's
   * own track hits this: `cs-core` wants eight from a pool of nine, three of which are not
   * courses. Without this flag the reason line read *"7 more of 6 remaining routes"*, which is
   * arithmetic the player is right to distrust.
   */
  dependsOnAbstract: boolean
  /**
   * For a `sequence` group, the next course in the authored order. Sequences are the only
   * ordering content expresses — there is no `prerequisites` field on a syllabus — so this is
   * the solver's whole account of prerequisites, and it does not pretend otherwise.
   */
  next: string | undefined
  /** Authored prose the graph cannot enforce. Verbatim, never parsed. */
  notes: string[]
}

/** How a whole track stands. */
export type TrackProgress = {
  trackId: string
  name: string
  field: string
  honorsEligible: boolean
  thesisRequired: boolean
  declareBy: Track['declareBy']
  diploma: string | undefined
  groups: GroupProgress[]
  /** Courses on your card that count toward this track at all. */
  counted: string[]
  /** Courses on your card that count toward nothing here. */
  wasted: string[]
  /** Slots still needed to finish, counting abstract slots. */
  needMore: number
  /** Slots left in the degree: `k` remaining terms × `coursesPerTerm`. */
  slotsLeft: number
  /** `slotsLeft - needMore`, negative when the track no longer fits. */
  slack: number
  status: TrackStatus
  /** Why the status is what it is. Always populated, including when reachable (§9.3). */
  reasons: string[]
}

/**
 * §9.3's three outputs plus r11's fourth. `unplannable` is the one content forced: a track
 * whose remaining requirements are all abstract slots is not closed and not reachable-with-
 * slack — it cannot be *planned*, because there is nothing in the catalogue to plan.
 */
export type TrackStatus = 'done' | 'slack' | 'tight' | 'closed' | 'unplannable'

/** What a single course does for a single track — shopping week's "counts toward". */
export type CountsToward = {
  trackId: string
  trackName: string
  groupId: string
  groupLabel: string
}

export type StudyPlanInput = {
  /** Courses on the card, in the order they were filed. Duplicates are collapsed. */
  taken: readonly string[]
  /** Terms already begun, including the current one. Freshman fall is 1. */
  termsUsed: number
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)]

/**
 * Which requirement groups a course could serve, across every track. Pure lookup over
 * authored pools — this is what shopping week shows on a row, and it deliberately reports
 * *every* track rather than a chosen one, because the whole point is telling you that a
 * concentration you were not thinking about just moved (§3.4).
 */
export function countsToward(courseCode: string, tracks: readonly Track[]): CountsToward[] {
  const out: CountsToward[] = []
  for (const track of tracks) {
    for (const g of track.requirements) {
      if (!poolOf(g).includes(courseCode)) continue
      out.push({ trackId: track.id, trackName: track.name, groupId: g.id, groupLabel: g.label })
    }
  }
  return out
}

/** The authored pool for a group, whichever field the author used to express it. */
const poolOf = (g: RequirementGroup): string[] =>
  g.kind === 'sequence' ? g.sequence : uniq([...g.from, ...g.oneOf, ...g.anyOf])

/**
 * Solve one track against one card.
 *
 * The matching runs greedily over groups sorted by **scarcity** — fewest real routes first —
 * because a group with one route must get that course or it gets nothing, while a group with
 * eighteen routes can afford to lose one. That ordering alone resolves every case in today's
 * content; the backtrack below exists for the ones it won't.
 */
export function trackProgress(
  track: Track,
  input: StudyPlanInput,
  courses: readonly Syllabus[],
  rules: Rules,
): TrackProgress {
  const catalogue = new Map(courses.map((c) => [c.courseCode, c]))
  const taken = uniq(input.taken)

  // Sorted by scarcity: a group with one real route is the one that must be served first.
  const order = [...track.requirements].sort((a, b) => {
    const ra = poolOf(a).filter((c) => catalogue.has(c)).length
    const rb = poolOf(b).filter((c) => catalogue.has(c)).length
    return ra - rb || a.id.localeCompare(b.id)
  })

  const assigned = new Map<string, string[]>(track.requirements.map((g) => [g.id, []]))
  const spent = new Set<string>()
  for (const g of order) {
    const pool = poolOf(g)
    for (const code of taken) {
      if (spent.has(code) || !pool.includes(code)) continue
      const mine = assigned.get(g.id)!
      if (mine.length >= g.need) break
      mine.push(code)
      spent.add(code)
    }
  }

  // A course assigned to a counted group is credited to the counting group too — `counts` is
  // "these are some of mine", not "these are extra".
  const groups: GroupProgress[] = track.requirements.map((g) => {
    const mine = assigned.get(g.id) ?? []
    const credited = g.counts.flatMap((c) => assigned.get(c) ?? [])
    const have = mine.length + credited.length
    const pool = poolOf(g)
    const real = pool.filter((c) => catalogue.has(c))
    const state: GroupProgress['state'] = have >= g.need ? 'done' : have > 0 ? 'partial' : 'open'
    const routes = real.filter((c) => !taken.includes(c))
    return {
      id: g.id,
      label: g.label,
      kind: g.kind,
      need: g.need,
      optional: g.optional,
      assigned: mine,
      credited,
      have,
      state,
      routes,
      abstractSlots: pool.filter((c) => !catalogue.has(c)),
      dependsOnAbstract: g.need - have > routes.length,
      next: g.kind === 'sequence' ? g.sequence.find((c) => !taken.includes(c)) : undefined,
      notes: g.notes,
    }
  })

  const counted = uniq(groups.flatMap((g) => g.assigned))
  const wasted = taken.filter((c) => !counted.includes(c))

  /**
   * Slots still owed, and the one piece of real arithmetic here.
   *
   * A group short by `n` needs `n` more courses. Where a group `counts` others, though, the
   * courses that clear the children also credit the parent, so a parent and its children
   * together cost `max(parent deficit, sum of child deficits)` rather than the sum of all
   * four. Eight Mathematics courses *of which* three are the breadth courses is eight, not
   * eleven. Getting this wrong in the obvious direction — adding them up — would report the
   * Mathematics track as closed to a freshman, which is the loudest possible way to be wrong.
   */
  const deficit = (id: string): number => {
    const g = groups.find((x) => x.id === id)
    if (!g || g.optional) return 0
    return Math.max(0, g.need - g.have)
  }
  const children = new Set(track.requirements.flatMap((g) => g.counts))
  let needMore = 0
  for (const g of track.requirements) {
    if (children.has(g.id)) continue // accounted for inside its parent's `max`, below
    if (g.counts.length === 0) {
      needMore += deficit(g.id)
      continue
    }
    needMore += Math.max(
      deficit(g.id),
      g.counts.reduce((n, c) => n + deficit(c), 0),
    )
  }

  const termsLeft = Math.max(0, rules.academics.termsToDegree - input.termsUsed)
  const slotsLeft = termsLeft * rules.academics.coursesPerTerm
  const slack = slotsLeft - needMore

  const reasons: string[] = []
  const required = groups.filter((g) => !g.optional)
  const unmet = required.filter((g) => g.state !== 'done')

  let status: TrackStatus
  if (unmet.length === 0) {
    status = 'done'
    reasons.push('Every required group is satisfied by courses already on the card.')
  } else if (needMore > slotsLeft) {
    status = 'closed'
    reasons.push(
      `Needs ${needMore} more course${needMore === 1 ? '' : 's'} and ${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} remain (${termsLeft} term${termsLeft === 1 ? '' : 's'} × ${rules.academics.coursesPerTerm}).`,
    )
  } else if (unmet.every((g) => g.routes.length === 0)) {
    status = 'unplannable'
    reasons.push(
      `Nothing left to plan: every remaining requirement names only slots that are not courses in content — ${uniq(unmet.flatMap((g) => g.abstractSlots)).join(', ')}.`,
    )
  } else {
    status = slack === 0 ? 'tight' : 'slack'
    reasons.push(
      `Needs ${needMore} more of the ${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left; ${slack} spare.`,
    )
  }

  // The reasons that are about *specific* groups, which is what makes the output usable.
  for (const g of unmet) {
    if (g.routes.length === 0 && g.abstractSlots.length > 0) {
      reasons.push(`${g.label}: no course in content satisfies this — ${g.abstractSlots.join(', ')}.`)
      continue
    }
    if (g.kind === 'sequence' && g.next !== undefined) {
      reasons.push(
        `${g.label} must be taken in order; next is ${g.next}, and ${g.need - g.have} of ${g.need} remain.`,
      )
      continue
    }
    const short = g.need - g.have
    if (g.dependsOnAbstract) {
      reasons.push(
        `${g.label}: ${short} more, but only ${g.routes.length} course${g.routes.length === 1 ? '' : 's'} in content can serve it — the rest must come from ${g.abstractSlots.join(', ')}.`,
      )
      continue
    }
    reasons.push(`${g.label}: ${short} more of ${g.routes.length} remaining route${g.routes.length === 1 ? '' : 's'}.`)
  }

  return {
    trackId: track.id,
    name: track.name,
    field: track.field,
    honorsEligible: track.honorsEligible,
    thesisRequired: track.thesisRequired,
    declareBy: track.declareBy,
    diploma: track.diploma,
    groups,
    counted,
    wasted,
    needMore,
    slotsLeft,
    slack,
    status,
    reasons,
  }
}

/**
 * Every track, always — that is how the planner can tell you a concentration you were not
 * thinking about just closed (§3.4). Seven tracks × microseconds is free, so there is no
 * "chosen track" fast path to get wrong.
 *
 * Sorted with the reachable ones first and the most advanced of those first, because the
 * useful reading of this list is *"where am I actually going?"*
 */
export function studyPlan(
  input: StudyPlanInput,
  tracks: readonly Track[],
  courses: readonly Syllabus[],
  rules: Rules,
): TrackProgress[] {
  const RANK: Record<TrackStatus, number> = { done: 0, slack: 1, tight: 2, unplannable: 3, closed: 4 }
  return tracks
    .map((t) => trackProgress(t, input, courses, rules))
    .sort(
      (a, b) =>
        RANK[a.status] - RANK[b.status] ||
        b.counted.length - a.counted.length ||
        a.trackId.localeCompare(b.trackId),
    )
}

/** One way out of a course that a demand gap has shut, per r11 (§9.3). */
export type OpeningRoute = {
  /** The course you cannot take yet. */
  blocked: string
  /** The tag that shuts it, and by how much. */
  tag: SubjectTag
  gap: number
  /** Cheaper courses that ask for the same tag, in ascending order of what they demand. */
  via: { courseCode: string; title: string; demand: number; gap: number }[]
}

/**
 * r11's fourth output: not *"closed"* but *"closed this year, and here is the cheapest way to
 * open it."* A demand gap of `NOT_SURVIVABLE_GAP` shuts a *course*, not a track, so the honest
 * answer walks one step further and names the lower-demand courses that would raise the
 * blocking tag.
 *
 * It reports routes, not a plan: it does not claim taking them *will* raise your level, only
 * that they are the courses that ask less of the tag that is stopping you. What a term of work
 * actually does to a level is §4.5's business, and inventing a forecast here would be exactly
 * the kind of promise §4.4 forbids.
 */
export function openingRoutes(
  courseCode: string,
  levels: Levels,
  courses: readonly Syllabus[],
): OpeningRoute[] {
  const target = courses.find((c) => c.courseCode === courseCode)
  if (!target) return []
  const out: OpeningRoute[] = []
  // `courseGaps` is shopping week's own pricing, reused rather than re-derived — a second
  // gap calculation is how the route a screen offers drifts from the refusal it explains.
  for (const row of courseGaps(target, levels)) {
    if (row.gap < NOT_SURVIVABLE_GAP) continue
    const via = courses
      .filter((c) => c.courseCode !== courseCode)
      .flatMap((c) => {
        const demand = c.demands[row.tag]
        // Only genuinely cheaper courses, and only ones you could actually take now.
        if (demand === undefined || demand >= row.courseLevel) return []
        const gap = demandGap(demand, levels[row.tag])
        if (gap >= NOT_SURVIVABLE_GAP) return []
        return [{ courseCode: c.courseCode, title: c.title, demand, gap }]
      })
      .sort((a, b) => a.demand - b.demand || a.courseCode.localeCompare(b.courseCode))
    out.push({ blocked: courseCode, tag: row.tag, gap: row.gap, via })
  }
  return out
}
