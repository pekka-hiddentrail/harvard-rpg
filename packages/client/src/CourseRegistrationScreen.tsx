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

// ── shopping week (§4.6) ──────────────────────────────────────────────────────────────
// Everything below comes from `/api/game/:id/shopping`, already priced. The client computes
// no hours, no gap, no multiplier and no total — it renders what the engine said
// (ARCHITECTURE §4). Note what is *absent* from these types: there is no grade, no letter
// and no card anywhere in them, because §4.4 lets this screen show price and never outcome.

type GapRow = {
  tag: string
  courseLevel: number
  playerLevel: number
  gap: number
  /** Absent at a not-survivable gap — the course is shut, not merely expensive. */
  multiplier?: number
}

type PricedCourse = {
  courseCode: string
  title: string
  effort: number
  open: boolean
  gaps: GapRow[]
  fixedHours: number
  baseCourseworkHours: number
  personalCourseworkHours: number
  baseWeeklyHours: number
  personalWeeklyHours: number
  /** Absent when no tag is costing anything — a course entirely at or below your level. */
  drivingTag?: string
  sections: CourseSlot[]
}

type CartSummary = {
  effortTotal: number
  cap: number
  over: boolean
  overBy: number
  baseWeeklyHours: number
  personalWeeklyHours: number
  closed: string[]
}

type Enrolment = { term: string; courseCode: string; section?: string }

type ShoppingResponse = {
  contentHash: string
  term: string | null
  cap: number
  levels: Record<string, number>
  courses: PricedCourse[]
  enrolled: Enrolment[]
  summary: CartSummary
}

/** What a commit (`/enrol`, `/drop`) answers with. */
type CardResponse = { enrolled: Enrolment[]; courses: PricedCourse[]; summary: CartSummary }

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

const hours = (n: number): string => `~${n}h/wk`

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
  /** The save being shopped for. `null` renders the catalogue unpriced — see below. */
  gameId: string | null
  onBack: () => void
  /** Opens the term as enrolled. The loop this closes is the point: shopping week can only
   * quote a *total*, and a total cannot tell you your Tuesday is impossible — so the answer to
   * "is this card any good" lives on the calendar, and you come back here to change it. */
  onViewTerm?: (() => void) | undefined
}

/**
 * Shopping week (§4.6). Two fetches, joined on `courseCode`, because they answer two
 * different questions: `/api/courses` is what a course *is* (identical for every player,
 * content only), `/api/game/:id/shopping` is what it would cost *you* (needs a save).
 *
 * With no `gameId` the screen still renders — as the plain catalogue it was before, with no
 * prices. That is not a degraded mode to apologise for: an unpriced course list is exactly
 * what a course list is, and inventing gaps against a player who doesn't exist yet would be
 * the dishonest option.
 *
 * The screen obeys §4.4's two rules by having nothing else available to it: it is handed
 * hours, gaps and multipliers, and never a predicted grade. A closed course renders its
 * reason, because that is what the payload carries instead of a refusal.
 */
export function CourseRegistrationScreen({ identity, gameId, onBack, onViewTerm }: CourseRegistrationScreenProps) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [slots, setSlots] = useState<CourseSlot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [priced, setPriced] = useState<Map<string, PricedCourse>>(new Map())
  const [enrolled, setEnrolled] = useState<Enrolment[]>([])
  const [summary, setSummary] = useState<CartSummary | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  /** Per course, so switching courses in the list doesn't silently reset a section you picked. */
  const [sectionChoice, setSectionChoice] = useState<Record<string, string>>({})

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

  useEffect(() => {
    if (gameId === null) return
    fetch(`${BASE}/api/game/${gameId}/shopping`)
      .then((r) => r.json() as Promise<ShoppingResponse>)
      .then((res) => {
        setPriced(new Map(res.courses.map((c) => [c.courseCode, c])))
        setEnrolled(res.enrolled)
        setSummary(res.summary)
      })
      .catch(() => setError(`No server on ${BASE}. Start it with \`npm run server\` in another window.`))
  }, [gameId])

  const selected = courses?.find((c) => c.id === selectedId) ?? null
  const isEnrolled = (courseCode: string) => enrolled.some((e) => e.courseCode === courseCode)

  /**
   * Add or drop. The whole card comes back from the server, so this never patches its own
   * copy of the enrolment — the screen's state after a click is the server's answer, which is
   * the only way `summary` and the rows can be guaranteed to agree.
   *
   * A `422` is rendered, not swallowed: it carries the reason (a not-survivable gap, a section
   * that needs picking) and that reason is the whole point of §9.3.
   */
  const commit = (action: 'enrol' | 'drop', courseCode: string, section?: string) => {
    if (gameId === null || busy !== null) return
    setBusy(courseCode)
    setRefusal(null)
    fetch(`${BASE}/api/game/${gameId}/shopping/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(section === undefined ? { courseCode } : { courseCode, section }),
    })
      .then(async (r) => ({ status: r.status, body: (await r.json()) as unknown }))
      .then(({ status, body }) => {
        if (status === 200) {
          const card = body as CardResponse
          setEnrolled(card.enrolled)
          setSummary(card.summary)
          // Prices don't change on enrolling, but the card's rows come back repriced anyway,
          // so fold them in rather than keeping two copies that could drift.
          setPriced((current) => {
            const next = new Map(current)
            for (const c of card.courses) next.set(c.courseCode, { ...next.get(c.courseCode)!, ...c })
            return next
          })
          return
        }
        const problem = body as { error?: string; sections?: string[] }
        setRefusal(
          problem.sections
            ? `${problem.error} — pick one of: ${problem.sections.join(', ')}`
            : (problem.error ?? `The server refused that (${status}).`),
        )
      })
      .catch(() => setError(`No server on ${BASE}. Start it with \`npm run server\` in another window.`))
      .finally(() => setBusy(null))
  }

  return (
    <main className="course-registration-shell">
      <section className="course-registration-page" aria-labelledby="course-registration-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="course-registration-body">
          <p className="kicker">{gameId ? 'Shopping week' : 'Course catalogue'}</p>
          <h1 id="course-registration-title">
            {gameId ? 'What it would cost you.' : "What's real so far."}
          </h1>
          <p>
            {gameId
              ? 'Hours a week, priced against your own subject levels. What you make of them is not on this screen.'
              : 'The actual authored syllabi. Start a game to see what any of them would cost you.'}
          </p>
        </div>

        {error && <p className="course-error">{error}</p>}
        {refusal && <p className="course-refusal" role="status">{refusal}</p>}

        {summary && (
          <aside className="crimson-cart" aria-label="Crimson Cart">
            <h2>Crimson Cart</h2>
            {enrolled.length === 0 ? (
              <p className="cart-empty">Nothing on the card yet.</p>
            ) : (
              <ul className="cart-rows">
                {enrolled.map((e) => {
                  const p = priced.get(e.courseCode)
                  return (
                    <li key={e.courseCode}>
                      <span className="cart-course">
                        {p?.title ?? e.courseCode}
                        {e.section ? ` · section ${e.section}` : ''}
                      </span>
                      <span className="cart-price">
                        effort {p?.effort ?? '?'} · {p ? hours(p.personalWeeklyHours) : '—'}
                      </span>
                      <button
                        type="button"
                        className="cart-drop"
                        disabled={busy !== null}
                        onClick={() => commit('drop', e.courseCode)}
                      >
                        Drop
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {/* §4.6: the cap is a line, not a wall. It is named, in hours and in effort, and
                then the player decides. Nothing here disables anything. */}
            <p className={summary.over ? 'cart-total over' : 'cart-total'}>
              Effort {summary.effortTotal} / {summary.cap} · {hours(summary.personalWeeklyHours)}
              {summary.baseWeeklyHours !== summary.personalWeeklyHours
                ? ` (${hours(summary.baseWeeklyHours)} for someone prepared)`
                : ''}
            </p>
            {summary.over && (
              <p className="cart-warning">
                That is {summary.overBy} over the semester effort cap. People do it. It is
                usually the term they stop sleeping.
              </p>
            )}
            {onViewTerm && enrolled.length > 0 && (
              <button type="button" className="view-term-button" onClick={onViewTerm}>
                See the term this makes →
              </button>
            )}
          </aside>
        )}

        {courses && (
          <div className="course-catalogue">
            <ul className="course-list">
              {courses.map((c) => {
                const section = pickSection(c, slots, identity.seed)
                const p = priced.get(c.courseCode)
                const classes = ['course-list-item']
                if (c.id === selectedId) classes.push('selected')
                if (p && !p.open) classes.push('closed')
                if (isEnrolled(c.courseCode)) classes.push('enrolled')
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={classes.join(' ')}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <span className="course-title">{section ? `${c.title.split(':')[0]}: ${section.theme}` : c.title}</span>
                      {section && <span className="course-instructor">Section {section.section} · {section.instructor} · {section.days.join('/')} {section.time}</span>}
                      {/* Unpriced, this is the course's own workload; priced, it is yours.
                          `personalWeeklyHours` already has the gap multiplier in it, so the
                          base figure goes alongside rather than instead — the difference *is*
                          the demand gap, stated in the only unit that isn't a euphemism. */}
                      <span className="course-summary">
                        {p ? (
                          p.open ? (
                            <>
                              effort {p.effort} · {hours(p.personalWeeklyHours)}
                              {p.personalWeeklyHours !== p.baseWeeklyHours
                                ? ` (${hours(p.baseWeeklyHours)} prepared)`
                                : ''}
                            </>
                          ) : (
                            <span className="course-closed-note">not survivable at your level</span>
                          )
                        ) : (
                          <>demand {c.demand} · {c.workloadHint}</>
                        )}
                      </span>
                      <span className="course-demands">
                        {Object.entries(c.demands).map(([tag, level]) => {
                          const gap = p?.gaps.find((g) => g.tag === tag)
                          const chip = ['demand-chip']
                          if (gap && gap.gap > 0) chip.push('behind')
                          if (gap && gap.gap <= 0) chip.push('ready')
                          if (tag === p?.drivingTag) chip.push('driving')
                          return (
                            <span key={tag} className={chip.join(' ')}>
                              {tag} {level}
                              {gap && gap.gap !== 0 ? ` (${signed(gap.gap)})` : ''}
                            </span>
                          )
                        })}
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

                {(() => {
                  const p = priced.get(selected.courseCode)
                  if (!p) return null
                  const on = isEnrolled(selected.courseCode)
                  const chosen = sectionChoice[p.courseCode] ?? p.sections[0]?.section
                  return (
                    <div className="course-price">
                      <h3>What it costs you</h3>
                      {/* r11's table, as a table. Each row is one subject the course asks
                          about: what it asks, what you have, and what the difference does to
                          the coursework. The multiplier is the honest number — it is what the
                          engine will actually multiply by. */}
                      <table className="gap-table">
                        <thead>
                          <tr>
                            <th scope="col">Subject</th>
                            <th scope="col">Asks</th>
                            <th scope="col">You</th>
                            <th scope="col">Gap</th>
                            <th scope="col">Coursework</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.gaps.map((g) => (
                            <tr key={g.tag} className={g.multiplier === undefined ? 'not-survivable' : undefined}>
                              <th scope="row">{g.tag}</th>
                              <td>{g.courseLevel}</td>
                              <td>{signed(g.playerLevel)}</td>
                              <td>{signed(g.gap)}</td>
                              <td>
                                {g.multiplier === undefined
                                  ? 'not survivable'
                                  : `×${g.multiplier}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <p className="price-total">
                        {p.fixedHours}h in class and exams + {p.personalCourseworkHours}h of work
                        = <strong>{hours(p.personalWeeklyHours)}</strong>
                        {p.personalCourseworkHours !== p.baseCourseworkHours
                          ? ` — someone at level would do the same work in ${p.baseCourseworkHours}h.`
                          : ''}
                      </p>

                      {!p.open && p.drivingTag && (
                        <p className="price-closed">
                          {p.drivingTag} is too far below what this course assumes. Get there
                          first — a lower course in the same subject, or the trait you didn't take.
                        </p>
                      )}

                      {p.open && p.sections.length > 1 && !on && (
                        <label className="section-choice">
                          Section
                          <select
                            value={chosen}
                            onChange={(e) =>
                              setSectionChoice((prev) => ({ ...prev, [p.courseCode]: e.target.value }))
                            }
                          >
                            {p.sections.map((s) => (
                              <option key={s.id + s.section} value={s.section}>
                                {s.section} · {s.days.join('/')} {s.time}
                                {s.instructor ? ` · ${s.instructor}` : ''}
                                {s.occupied >= s.size ? ' (full)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {on ? (
                        <button
                          type="button"
                          className="drop-button"
                          disabled={busy !== null}
                          onClick={() => commit('drop', p.courseCode)}
                        >
                          {busy === p.courseCode ? 'Dropping…' : 'Drop this course'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="add-button"
                          disabled={busy !== null || !p.open}
                          onClick={() =>
                            commit('enrol', p.courseCode, p.sections.length > 1 ? chosen : undefined)
                          }
                        >
                          {busy === p.courseCode ? 'Adding…' : p.open ? 'Add to cart' : 'Closed to you'}
                        </button>
                      )}
                    </div>
                  )
                })()}

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

                {/* Section slots stay a cart concern, not a browsing one: which sections
                    exist only matters once you're pricing the course, so they're rendered
                    up in `course-price` and nowhere else. */}
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
