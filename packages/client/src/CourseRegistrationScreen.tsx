import { useEffect, useState } from 'react'
import type { CharacterIdentity } from './CharacterGenerationScreen.tsx'
import { createRng, pickIndex } from './rng.ts'

// The trait pool pattern from TraitSelectionScreen.tsx applies here too: the server owns
// the content, this screen only asks and renders (ARCHITECTURE §4).
const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

/** Mirrors the engine's `MeetingPattern`. Named so `PATTERN_MINUTES` below has to cover
 * every case — a widened enum should break this build, not print `undefined min`. */
type MeetingPattern = 'MWF' | 'TTh' | 'MW' | 'Th' | 'W' | 'MTWThF'

type Attendance = 'mandatory' | 'expected' | 'flexible'

type Meeting = {
  type: string
  days: string[]
  pattern: MeetingPattern | null
  time: string | null
  size: number
  attendance: Attendance
  sections: boolean
}

type Session = { n: number; date: string; topic: string }

type Stage = { id: string; due: string }

type Assignment = {
  id: string
  title: string | null
  kind: string
  assigned: string | null
  due: string | null
  date: string | null
  time: string | null
  estHours: number | null
  weight: number
  dependsOnSessions: number[]
  coversSessions: string[]
  stages: Stage[]
}

type OfficeHour = {
  type: 'officeHour'
  length: string
  booked: boolean
  days: string[]
  time: string
  location: string
  demand: number
}

type Course = {
  id: string
  courseCode: string
  title: string
  demand: number
  workloadHint: string
  demands: Record<string, number>
  meetings: Meeting[]
  officeHours: OfficeHour[]
  sessions: Session[]
  assignments: Assignment[]
}

type CourseSlot = {
  id: string
  section: string
  courseCode: string
  type: string
  pattern: MeetingPattern | null
  time: string
  days: string[]
  size: number
  attendance: Attendance
  demand: number
  occupied: number
  theme: string | null
  blurb: string | null
  instructor: string | null
}

type CoursesResponse = { contentHash: string; courses: Course[]; slots: CourseSlot[] }

const dueOf = (a: Assignment): string | null => a.date ?? a.due ?? null

// Real Harvard block-schedule facts (ARCHITECTURE: the client holds zero game rules, but
// this is fixed, public trivia, not a rule the engine computes -- same category as the
// weekday names). The exact slot within a pattern is a registration-time choice (the
// "Crimson Cart"), never authored, so it's never shown here either.
/** A label, not a rule — the engine's `BLOCK_MINUTES` is the real table. Exhaustive over
 * `MeetingPattern` on purpose, so it cannot drift into printing a blank duration. */
const PATTERN_MINUTES: Record<MeetingPattern, number> = {
  MWF: 50,
  TTh: 75,
  MW: 75,
  Th: 180,
  W: 120,
  MTWThF: 60,
}

const meetingsLabel = (meetings: Meeting[]): string =>
  meetings
    .map((m) => {
      const length = m.time ? ` ${m.time}` : m.pattern ? ` (${PATTERN_MINUTES[m.pattern]} min)` : ''
      return `${m.type} · ${m.days.join('/')}${length}${m.sections ? ' (section)' : ''}`
    })
    .join(' · ')

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** "Lecture flexible, Section mandatory" -- one entry per distinct meeting type, drawn
 * from the course's own meetings plus any matching real section slots. */
const attendanceSummary = (course: Course, slots: CourseSlot[]): string => {
  const byType = new Map<string, Attendance>()
  for (const m of course.meetings) byType.set(m.type, m.attendance)
  for (const s of slots) if (s.id === course.id) byType.set(s.type, s.attendance)
  return [...byType.entries()].map(([type, attendance]) => `${capitalize(type)} ${attendance}`).join(', ')
}

/** A deterministic section pick per playthrough — same seed, same section, every time.
 * Only courses with theme-bearing slots (Expos 20) vary this way; a course whose slots
 * have no `theme` (CS50's sections) just isn't offered a pick here. */
const pickSection = (course: Course, slots: CourseSlot[], seed: string): CourseSlot | null => {
  const pool = slots.filter((s) => s.id === course.id && s.theme)
  if (pool.length === 0) return null
  const rng = createRng(`${seed}:${course.id}`)
  return pool[pickIndex(rng, pool.length)]!
}

type CourseRegistrationScreenProps = {
  identity: CharacterIdentity
  onBack: () => void
}

// The course catalogue: a browse view over the real, authored syllabi in
// `content/courses/*.yaml`. Registration itself — demand gaps, the requirement solver,
// enrolling into a term — is still Tier 2 content that does not exist yet.
export function CourseRegistrationScreen({ identity, onBack }: CourseRegistrationScreenProps) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [slots, setSlots] = useState<CourseSlot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}/api/courses`)
      .then((r) => r.json() as Promise<CoursesResponse>)
      .then((res) => {
        setCourses(res.courses)
        setSlots(res.slots)
        setSelectedId((current) => current ?? res.courses[0]?.id ?? null)
      })
      .catch(() => setError(`No server on ${BASE}. Start it with \`npm run server\` in another window.`))
  }, [])

  const selected = courses?.find((c) => c.id === selectedId) ?? null

  return (
    <main className="course-registration-shell">
      <section className="course-registration-page" aria-labelledby="course-registration-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="course-registration-body">
          <p className="kicker">Course catalogue</p>
          <h1 id="course-registration-title">What's real so far.</h1>
          <p>
            Registration, demand gaps and the requirement solver arrive with Tier 2. These
            are the actual authored syllabi it will run on.
          </p>
        </div>

        {error && <p className="course-error">{error}</p>}

        {courses && (
          <div className="course-catalogue">
            <ul className="course-list">
              {courses.map((c) => {
                const section = pickSection(c, slots, identity.seed)
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={c.id === selectedId ? 'course-list-item selected' : 'course-list-item'}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <span className="course-title">{section ? `${c.title.split(':')[0]}: ${section.theme}` : c.title}</span>
                      {section && <span className="course-instructor">Section {section.section} · {section.instructor} · {section.days.join('/')} {section.time}</span>}
                      <span className="course-summary">
                        demand {c.demand} · {c.workloadHint}
                      </span>
                      <span className="course-demands">
                        {Object.entries(c.demands).map(([tag, level]) => (
                          <span key={tag} className="demand-chip">{tag} {level}</span>
                        ))}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {selected && (
              <article className="course-detail" aria-label={selected.title}>
                {(() => {
                  const section = pickSection(selected, slots, identity.seed)
                  return section ? (
                    <>
                      <h2>{selected.title.split(':')[0]}: {section.theme}</h2>
                      <p className="course-instructor">Section {section.section} · {section.instructor} · {section.days.join('/')} {section.time}</p>
                      <p className="course-blurb">"{section.blurb}"</p>
                    </>
                  ) : (
                    <h2>{selected.title}</h2>
                  )
                })()}
                <p className="course-meetings">
                  {meetingsLabel(selected.meetings)} — exact slot chosen at registration
                </p>
                <p className="course-attendance">{attendanceSummary(selected, slots)}</p>

                <h3>Office hours</h3>
                <ul className="course-slots">
                  {selected.officeHours.map((officeHour) => (
                    <li key={`${officeHour.days.join('-')}-${officeHour.time}-${officeHour.location}`}>
                      <span className="slot-time">
                        {officeHour.days.join('/')} {officeHour.time} · {officeHour.location} ·{' '}
                        {officeHour.length === 'free' ? 'open drop-in' : `${officeHour.length} slots`}
                        {officeHour.booked ? ' · booking required' : ''}
                      </span>
                    </li>
                  ))}
                </ul>

                <h3>Assignments</h3>
                <ul className="course-assignments">
                  {selected.assignments.map((a) => (
                    <li key={a.id}>
                      <span className="assignment-title">{a.title ?? a.id}</span>
                      <span className="assignment-meta">
                        {a.kind} · due {dueOf(a) ?? 'TBD'} · weight {Math.round(a.weight * 100)}%
                      </span>
                      {a.stages.length > 0 && (
                        <ul className="assignment-stages">
                          {a.stages.map((s) => (
                            <li key={s.id}>{s.id}: {s.due}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>

                {/* An empty spine means this course is still a stub whose real syllabus
                    hasn't been transcribed (see `Syllabus.sessions`) — say so, rather than
                    leaving a heading over an empty list. */}
                <h3>Sessions</h3>
                {selected.sessions.length === 0 ? (
                  <p className="course-unauthored">Session schedule not published yet.</p>
                ) : (
                  <ol className="course-sessions">
                    {selected.sessions.map((s) => (
                      <li key={s.n}>
                        <span className="session-date">{s.date}</span>
                        <span className="session-topic">{s.topic}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {/* Section slots are a cart concern, not a browsing one: which sections
                    exist only matters once you've committed to the course. That step
                    doesn't exist yet — see CourseSlot in packages/engine/src/schema.ts. */}
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
