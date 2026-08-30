import { useEffect, useState } from 'react'
import type { CharacterIdentity } from './CharacterGenerationScreen.tsx'
import { createRng, pickIndex } from './rng.ts'

// The trait pool pattern from TraitSelectionScreen.tsx applies here too: the server owns
// the content, this screen only asks and renders (ARCHITECTURE §4).
const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

type Meeting = {
  type: string
  days: string[]
  pattern: 'MWF' | 'TTh' | 'MW' | null
  time: string | null
  size: number
  attendance: 'mandatory' | 'flexible'
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

type Course = {
  id: string
  title: string
  difficulty: number
  workloadHint: string
  demands: Record<string, number>
  meetings: Meeting[]
  sessions: Session[]
  assignments: Assignment[]
}

type CourseSlot = {
  id: string | null
  course: string
  type: string
  pattern: 'MWF' | 'TTh' | 'MW' | null
  time: string
  days: string[]
  size: number
  attendance: 'mandatory' | 'flexible'
  occupied: number
  room: string | null
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
const PATTERN_MINUTES: Record<string, number> = { MWF: 50, TTh: 75, MW: 75 }

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
  const byType = new Map<string, 'mandatory' | 'flexible'>()
  for (const m of course.meetings) byType.set(m.type, m.attendance)
  for (const s of slots) if (s.course === course.id) byType.set(s.type, s.attendance)
  return [...byType.entries()].map(([type, attendance]) => `${capitalize(type)} ${attendance}`).join(', ')
}

/** A deterministic section pick per playthrough — same seed, same section, every time.
 * Only courses with theme-bearing slots (Expos 20) vary this way; a course whose slots
 * have no `theme` (CS50's sections) just isn't offered a pick here. */
const pickSection = (course: Course, slots: CourseSlot[], seed: string): CourseSlot | null => {
  const pool = slots.filter((s) => s.course === course.id && s.theme)
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
                      {section && <span className="course-instructor">Section {section.id} · {section.instructor} · {section.days.join('/')} {section.time}</span>}
                      <span className="course-summary">
                        difficulty {c.difficulty} · {c.workloadHint}
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
                      <p className="course-instructor">Section {section.id} · {section.instructor} · {section.days.join('/')} {section.time}</p>
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

                <h3>Sessions</h3>
                <ol className="course-sessions">
                  {selected.sessions.map((s) => (
                    <li key={s.n}>
                      <span className="session-date">{s.date}</span>
                      <span className="session-topic">{s.topic}</span>
                    </li>
                  ))}
                </ol>

                {slots.filter((s) => s.course === selected.id).length > 0 && (
                  <>
                    <h3>Section slots</h3>
                    {/* Occupancy is a registration-time concern, not a browsing one --
                        it belongs to a not-yet-built "choose your section" step that
                        happens after committing to the course, not here. */}
                    <ul className="course-slots">
                      {slots
                        .filter((s) => s.course === selected.id)
                        .map((s, i) => (
                          <li key={i}>
                            <span className="slot-time">
                              {s.id ? `${s.id} · ` : ''}{s.days.join('/')} {s.time}{s.room ? ` · ${s.room}` : ''}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

