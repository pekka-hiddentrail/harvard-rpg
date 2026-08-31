import { parseHourRange, type CourseSlot } from '@harvard/engine'

/**
 * A course's `effort`/bracket derivation (`@harvard/engine`'s `effort.ts`) only reads its
 * own `meetings` — the pattern every section shares. A section's real, concrete length
 * lives in `sections.yaml` instead, because which section a student lands in is a
 * registration-time fact (GAME_DESIGN §4.1), not something a syllabus pins. Joining the
 * two belongs here, in the content loader, not in the engine (ARCHITECTURE §11.1: engine
 * imports neither narrator nor content's loader).
 *
 * Averages every section/lab slot for a course code — when they're all the same length
 * (the common case; CS50's six sections are all 165 minutes), that average is exact.
 * Once a player has actually registered, feed that slot's own length in instead — the
 * estimate is meant to sharpen after shopping week, not just once, ever.
 */
export function representativeSectionHours(courseCode: string, slots: readonly CourseSlot[]): number {
  const sections = slots.filter(
    (s) => s.courseCode === courseCode && (s.type === 'section' || s.type === 'lab'),
  )
  if (sections.length === 0) return 0
  const total = sections.reduce((sum, s) => sum + parseHourRange(s.time), 0)
  return total / sections.length
}
