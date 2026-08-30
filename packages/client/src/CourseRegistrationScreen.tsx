import { useEffect, useState } from 'react'

// The trait pool pattern from TraitSelectionScreen.tsx applies here too: the server owns
// the content, this screen only asks and renders (ARCHITECTURE §4).
const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

type Meeting = {
  type: string
  days: string[]
  band: string
  size: number
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

type CoursesResponse = { contentHash: string; courses: Course[] }

const dueOf = (a: Assignment): string | null => a.date ?? a.due ?? null

type CourseRegistrationScreenProps = {
  onBack: () => void
}

// The course catalogue: a browse view over the real, authored syllabi in
// `content/courses/*.yaml`. Registration itself — demand gaps, the requirement solver,
// enrolling into a term — is still Tier 2 content that does not exist yet.
export function CourseRegistrationScreen({ onBack }: CourseRegistrationScreenProps) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}/api/courses`)
      .then((r) => r.json() as Promise<CoursesResponse>)
      .then((res) => {
        setCourses(res.courses)
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
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === selectedId ? 'course-list-item selected' : 'course-list-item'}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <span className="course-title">{c.title}</span>
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
              ))}
            </ul>

            {selected && (
              <article className="course-detail" aria-label={selected.title}>
                <h2>{selected.title}</h2>
                <p className="course-meetings">
                  {selected.meetings
                    .map((m) => `${m.type} · ${m.days.join('/')} · ${m.band}${m.sections ? ' (section)' : ''}`)
                    .join(' · ')}
                </p>

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
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

