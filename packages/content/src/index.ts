import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import {
  ActivityPack,
  BAND_COUNT,
  CourseSlotList,
  Preset,
  Rules,
  SUBJECT_TAGS,
  Syllabus,
  Term,
  TraitPack,
  TrackFile,
  fitSessions,
  indexActivities,
  indexTraits,
  type Activity,
  type ActivityIndex,
  type CourseSlot,
  type SubjectTag,
  type Track,
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
  activities: Activity[]
  activityIndex: ActivityIndex
  presets: Preset[]
  /** Real, authored course syllabi (Tier 2, GAME_DESIGN §4.1). */
  courses: Syllabus[]
  /** The real, concrete, capacity-tracked section-slot pool (the shopping cart). */
  slots: CourseSlot[]
  /** Shared term calendars every course's `meetings` is fit against (`fitSessions`). */
  terms: Term[]
  /** The concentrations a card can be judged against (GAME_DESIGN §9.1). */
  tracks: Track[]
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

  const activityPack = ActivityPack.safeParse(parse(take(join(root, 'activities.yaml'))))
  if (!activityPack.success) {
    throw new Error(`activities.yaml is not a valid activity pack:\n${describe(activityPack.error)}`)
  }
  const activities = activityPack.data.activities
  assertActivitiesUsable(activities)
  const activityIndex = indexActivities(activities)

  const presets = listYaml(join(root, 'presets')).map((p) => {
    const parsed = Preset.safeParse(parse(take(p)))
    if (!parsed.success) {
      throw new Error(`${p} is not a valid preset:\n${describe(parsed.error)}`)
    }
    return parsed.data
  })

  const courses = listYaml(join(root, 'courses')).map((p) => {
    const parsed = Syllabus.safeParse(parse(take(p)))
    if (!parsed.success) {
      throw new Error(`${p} is not a valid course syllabus:\n${describe(parsed.error)}`)
    }
    return parsed.data
  })
  assertUniqueCourses(courses)

  const slotsPath = join(root, 'sections.yaml')
  const slotsParsed = CourseSlotList.safeParse(parse(take(slotsPath)))
  if (!slotsParsed.success) {
    throw new Error(`sections.yaml is not a valid section-slot list:\n${describe(slotsParsed.error)}`)
  }
  const slots = slotsParsed.data
  assertCourseSlotsResolve(courses, slots)

  const terms = listYaml(join(root, 'calendar')).map((p) => {
    const parsed = Term.safeParse(parse(take(p)))
    if (!parsed.success) {
      throw new Error(`${p} is not a valid term calendar:\n${describe(parsed.error)}`)
    }
    return parsed.data
  })

  const tracks = listYaml(join(root, 'tracks')).map((p) => {
    const parsed = TrackFile.safeParse(parse(take(p)))
    if (!parsed.success) {
      throw new Error(`${p} is not a valid track:\n${describe(parsed.error)}`)
    }
    // `version` is read for the hash and discarded, like every other pack's.
    const { version: _version, ...track } = parsed.data
    return track
  })
  assertTracksUsable(tracks, courses)

  // Fails at boot, not at first render, if a course's session count drifts from its
  // meeting pattern × the shared term's real dates (a miscounted holiday, e.g.).
  const primaryTerm = terms[0]
  if (primaryTerm) {
    for (const course of courses) fitSessions(course, primaryTerm)
  }

  // Sorted by path so the hash does not depend on directory-read order.
  const h = createHash('sha256')
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    h.update(f.path.replaceAll('\\', '/').split('/content/').pop() ?? f.path)
    h.update('\0')
    h.update(f.text.replaceAll('\r\n', '\n'))
    h.update('\0')
  }

  return {
    rules,
    packs,
    traits,
    index,
    activities,
    activityIndex,
    presets,
    courses,
    slots,
    terms,
    tracks,
    hash: h.digest('hex').slice(0, 16),
  }
}

/**
 * Semantic checks on the activity pack. Zod has already checked the shape; these are the
 * ones that would otherwise surface as a day that cannot be planned (ARCHITECTURE §3.2).
 */
function assertActivitiesUsable(activities: readonly Activity[]): void {
  const seen = new Set<string>()
  for (const a of activities) {
    if (seen.has(a.id)) throw new Error(`duplicate activity id \`${a.id}\``)
    seen.add(a.id)

    for (const b of a.allowedBands) {
      if (b >= BAND_COUNT) {
        throw new Error(`activity \`${a.id}\` allows band ${b}; there are only ${BAND_COUNT}`)
      }
    }
    if (a.allowedBands.length > 0 && a.allowedBands.length * 2 < a.minHalves) {
      throw new Error(`activity \`${a.id}\` cannot fit its own minimum in the bands it allows`)
    }
    // A curve that dips means a longer session banks less than a shorter one, which would
    // make "stop early" a strategy for reasons no rule intends.
    for (const [i, v] of a.curve.entries()) {
      if (i > 0 && v < (a.curve[i - 1] ?? 0)) {
        throw new Error(`activity \`${a.id}\` has a curve that falls at ${i + 1} halves`)
      }
    }
  }

  if (!activities.some((a) => a.food === 'meal')) throw new Error('no activity feeds you')
  if (!activities.some((a) => a.sleep)) throw new Error('no activity ends the day')
  if (!activities.some((a) => a.curve.length > 0)) throw new Error('no activity banks hours')
}

/**
 * Semantic checks on the tracks. The interesting thing here is what is *not* checked: a
 * course reference that no syllabus matches is **not** an error. `math_senior_thesis` and
 * `math_expository_paper` are deliverables rather than courses, so the catalogue is right not
 * to carry them, and the solver reports them as abstract slots (GAME_DESIGN §9.3). Nothing
 * mechanical can separate that from a typo, so this asserts only what is genuinely decidable
 * — and every one of these would otherwise surface as a track that silently cannot be
 * satisfied, which is the failure mode the whole component exists to prevent.
 */
function assertTracksUsable(tracks: readonly Track[], courses: readonly Syllabus[]): void {
  const trackIds = new Set<string>()
  const tagNames = new Set<string>(SUBJECT_TAGS)
  for (const t of tracks) {
    if (trackIds.has(t.id)) throw new Error(`duplicate track id \`${t.id}\``)
    trackIds.add(t.id)

    const groupIds = new Set<string>()
    for (const g of t.requirements) {
      if (groupIds.has(g.id)) throw new Error(`track \`${t.id}\`: duplicate requirement id \`${g.id}\``)
      groupIds.add(g.id)
    }

    for (const g of t.requirements) {
      for (const c of g.counts) {
        if (!groupIds.has(c)) {
          throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` counts \`${c}\`, which is not a requirement of this track`)
        }
        if (c === g.id) throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` counts itself`)
      }
      // A group asking for more courses than it names can never be satisfied, whatever the
      // player does. `tag` groups are exempt: they draw on the whole catalogue, not a list.
      if (g.kind !== 'tag') {
        const pool = g.kind === 'sequence' ? g.sequence : [...g.from, ...g.oneOf, ...g.anyOf]
        if (pool.length < g.need) {
          throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` needs ${g.need} but names only ${pool.length}`)
        }
        // A course listed twice makes the pool look bigger than it is, which is exactly how
        // the check above gets fooled into passing a group that cannot be satisfied.
        const seen = new Set<string>()
        for (const ref of pool) {
          if (seen.has(ref)) {
            throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` lists \`${ref}\` twice`)
          }
          seen.add(ref)
        }
      }
      if (g.kind === 'tag') {
        if (g.subjectTag === undefined) {
          throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` is a tag requirement with no \`subjectTag\``)
        }
        // §7.8: the subject tags are a closed namespace, so a misspelling here is decidable.
        if (!tagNames.has(g.subjectTag)) {
          throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` wants subject tag \`${g.subjectTag}\`, which is not one of the ${SUBJECT_TAGS.length}`)
        }
        if (!courses.some((c) => (c.demands[g.subjectTag as SubjectTag] ?? 0) > 0)) {
          throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` wants subject tag \`${g.subjectTag}\`, which no course in content asks for`)
        }
      }
      if (g.min !== undefined && g.max !== undefined && g.min > g.max) {
        throw new Error(`track \`${t.id}\`: requirement \`${g.id}\` has min ${g.min} above max ${g.max}`)
      }
    }

    for (const hint of t.courseHints) {
      for (const ref of hint.countsToward) {
        if (!groupIds.has(ref)) {
          throw new Error(`track \`${t.id}\`: hint \`${hint.id}\` counts toward \`${ref}\`, which is not a requirement of this track`)
        }
      }
    }
  }
}

export { representativeSectionHours } from './workload.ts'

const describe = (e: { issues: { path: (string | number)[]; message: string }[] }) =>
  e.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')

/** Course IDs and codes are both stable identifiers, so neither may be ambiguous. */
function assertUniqueCourses(courses: readonly Syllabus[]): void {
  const ids = new Set<string>()
  const codes = new Set<string>()
  for (const course of courses) {
    if (ids.has(course.id)) throw new Error(`duplicate course id \`${course.id}\``)
    if (codes.has(course.courseCode)) {
      throw new Error(`duplicate course code \`${course.courseCode}\``)
    }
    ids.add(course.id)
    codes.add(course.courseCode)
  }
}

/** A slot's numeric ID and readable code must identify the same authored syllabus. */
function assertCourseSlotsResolve(
  courses: readonly Syllabus[],
  slots: readonly CourseSlot[],
): void {
  const byId = new Map(courses.map((course) => [course.id, course]))
  for (const slot of slots) {
    const key = `${slot.id}${slot.section}`
    const course = byId.get(slot.id)
    if (!course) throw new Error(`course slot \`${key}\` points at unknown course id \`${slot.id}\``)
    if (course.courseCode !== slot.courseCode) {
      throw new Error(
        `course slot \`${key}\` uses code \`${slot.courseCode}\`; course \`${slot.id}\` uses \`${course.courseCode}\``,
      )
    }
  }
}

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
