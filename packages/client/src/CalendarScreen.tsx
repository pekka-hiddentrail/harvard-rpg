import { useEffect, useState } from 'react'

/**
 * The term as enrolled (ARCHITECTURE §11.5) — the screen §11's go/no-go gate is asked of:
 * *"does planning a Tuesday in mid-October — three deadlines converging, a lecture you would
 * rather skip — present an interesting decision before any prose exists?"*
 *
 * Two fetches, for the same reason shopping week has two: `/api/day/activities` carries the
 * band grid, which is identical for every player and depends on nothing but content;
 * `/api/game/:id/term` carries *your* term, which needs a save. Joining them here keeps the
 * client from owning a copy of either — it does not know how long a band is, which band a
 * 09:00 lecture lands in, or what a week's hours add up to. It draws what it is handed.
 */

const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type Band = { index: number; label: string; name: string; anchor: string | null }

type Occurrence = {
  eventId: string
  title: string
  date: string
  startBand: number
  endBand: number
  hard: boolean
}

type DayPlan = {
  date: string
  weekday: number
  occurrences: Occurrence[]
  conflicts: { a: Occurrence; b: Occurrence; severity: 'hard' | 'soft'; message: string }[]
  freeBands: number
  density: 'open' | 'workable' | 'squeezed' | 'gone'
}

type DueItem = {
  courseCode: string
  assignmentId: string
  title: string
  kind: string
  date: string
  weight: number
  baseHours?: number
  personalHours?: number
}

type WeekLoad = {
  week: number
  monday: string
  sunday: string
  due: DueItem[]
  baseHours: number
  personalHours: number
  freeBands: number
  pressure: number
}

type Collision = {
  a: string
  b: string
  aTitle: string
  bTitle: string
  severity: 'hard' | 'soft'
  dates: string[]
  derived: boolean
}

type PlacedMeeting = {
  type: string
  section?: string
  days: string[]
  time: string
  derivedTime: boolean
  startBand: number
  endBand: number
  attendance: 'mandatory' | 'expected' | 'flexible'
}

type TermPlan = {
  term: string
  firstDay: string
  lastDay: string
  courses: { courseCode: string; title: string; section?: string; meetings: PlacedMeeting[] }[]
  days: DayPlan[]
  weeks: WeekLoad[]
  collisions: Collision[]
  peakWeeks: number[]
}

/** Display only, and deliberately not arithmetic: the engine already told us which bands are
 * occupied. This just prints `2026-10-13` as `Tue 13 Oct` without shipping a date library. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? '?'}`
}

/** The seven ISO dates of a week, from its Monday. String arithmetic would be a second date
 * implementation, so this walks the plan's own day list instead where it can. */
const weekDates = (plan: TermPlan, week: WeekLoad): string[] => {
  const from = plan.days.findIndex((d) => d.date >= week.monday)
  if (from === -1) return []
  return plan.days.slice(from).filter((d) => d.date <= week.sunday).map((d) => d.date)
}

const hours = (n: number): string => `${n.toFixed(1)} h`

export function CalendarScreen({ onBack, gameId }: { onBack: () => void; gameId: string | null }) {
  const [bands, setBands] = useState<Band[]>([])
  const [plan, setPlan] = useState<TermPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    let stale = false
    fetch(`${BASE}/api/day/activities`)
      .then(async (r) => (await r.json()) as { bands: Band[] })
      .then((body) => {
        if (!stale) setBands(body.bands)
      })
      .catch(() => {
        if (!stale) setError('The band grid did not load — is the API server running?')
      })
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => {
    if (gameId === null) return
    let stale = false
    fetch(`${BASE}/api/game/${gameId}/term`)
      .then(async (r) => ({ status: r.status, body: (await r.json()) as unknown }))
      .then(({ status, body }) => {
        if (stale) return
        if (status === 200) {
          setPlan((body as { plan: TermPlan }).plan)
          return
        }
        const problem = body as { error?: string; detail?: string }
        setError(problem.detail ?? problem.error ?? `The server refused that (${status}).`)
      })
      .catch(() => {
        if (!stale) setError('The term did not load — is the API server running?')
      })
    return () => {
      stale = true
    }
  }, [gameId])

  /**
   * Opens on the busiest week rather than on week 1 or on the wall clock. Week 1 is empty by
   * construction and the machine's date is not the save's; the peak week is the one the plan
   * itself says is worth looking at, which is also the week the gate question is about.
   */
  const week =
    plan === null
      ? null
      : (plan.weeks.find((w) => w.week === selected) ??
        plan.weeks.find((w) => w.week === plan.peakWeeks[0]) ??
        plan.weeks[0] ??
        null)

  const dates = plan && week ? weekDates(plan, week) : []
  const dayOf = new Map((plan?.days ?? []).map((d) => [d.date, d]))
  const maxPressure = Math.max(0.01, ...(plan?.weeks ?? []).map((w) => w.pressure))

  return (
    <main className="calendar-shell">
      <section className="calendar-page" aria-labelledby="calendar-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="calendar-heading">
          <p className="kicker">{plan ? plan.term : 'Calendar'}</p>
          <h1 id="calendar-title">
            {week ? `Week ${week.week} — ${shortDate(week.monday)} to ${shortDate(week.sunday)}` : 'The term'}
          </h1>
        </div>

        {error !== null && <p className="course-refusal" role="alert">{error}</p>}

        {gameId === null && (
          <p className="calendar-empty">
            No save yet, so there is no term to draw. Shopping week writes one.
          </p>
        )}

        {plan !== null && plan.courses.length === 0 && (
          <p className="calendar-empty">
            Nothing enrolled. The term is real and entirely empty — every band of every day is
            yours, which is a fact about this card rather than a screen that failed to load.
          </p>
        )}

        {plan !== null && week !== null && (
          <div className="term-layout">
            <nav className="week-rail" aria-label="Term weeks">
              {plan.weeks.map((w) => (
                <button
                  key={w.week}
                  type="button"
                  className={`week-row${w.week === week.week ? ' selected' : ''}${plan.peakWeeks.includes(w.week) ? ' peak' : ''}`}
                  onClick={() => setSelected(w.week)}
                  aria-current={w.week === week.week}
                >
                  <span className="week-n">{w.week}</span>
                  <span className="week-when">{shortDate(w.monday)}</span>
                  <span className="week-bar" aria-hidden="true">
                    <span className="week-fill" style={{ width: `${(w.pressure / maxPressure) * 100}%` }} />
                  </span>
                  <span className="week-due">{w.due.length === 0 ? '—' : `${w.due.length}×`}</span>
                  <span className="week-hours">{w.personalHours === 0 ? '' : hours(w.personalHours)}</span>
                </button>
              ))}
            </nav>

            <div className="term-main">
              <table className="week-grid">
                <caption className="visually-hidden">
                  Bands occupied by class, Monday to Sunday of week {week.week}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Band</th>
                    {WEEKDAYS.map((name, i) => {
                      const iso = dates[i]
                      const day = iso === undefined ? undefined : dayOf.get(iso)
                      return (
                        <th key={name} scope="col" className={day ? `density-${day.density}` : 'outside-term'}>
                          <span className="col-day">{name}</span>
                          <span className="col-date">{iso ? shortDate(iso) : '—'}</span>
                          {day && <span className="col-free">{day.freeBands} free</span>}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.index} className={b.anchor ? `anchor-${b.anchor}` : ''}>
                      <th scope="row">
                        <span className="band-label">{b.label}</span>
                        <span className="band-name">{b.name}</span>
                      </th>
                      {WEEKDAYS.map((name, i) => {
                        const iso = dates[i]
                        const day = iso === undefined ? undefined : dayOf.get(iso)
                        const here = (day?.occurrences ?? []).filter(
                          (o) => o.startBand <= b.index && b.index < o.endBand,
                        )
                        const clash = here.length > 1
                        return (
                          <td
                            key={name}
                            className={`band-cell${here.length > 0 ? ' busy' : ''}${clash ? ' clash' : ''}`}
                          >
                            {here.map((o) => (
                              <span key={o.eventId} className={`slot${o.hard ? ' hard' : ' soft'}`}>
                                {o.title}
                              </span>
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <section className="week-due-list" aria-label={`Due in week ${week.week}`}>
                <p className="kicker">
                  Due this week — {hours(week.personalHours)} for you
                  {week.baseHours !== week.personalHours && (
                    <span className="base-aside"> ({hours(week.baseHours)} as authored)</span>
                  )}
                </p>
                {week.due.length === 0 ? (
                  <p className="calendar-empty">Nothing due. {week.freeBands} free bands.</p>
                ) : (
                  <ul>
                    {week.due.map((d) => (
                      <li key={`${d.courseCode}:${d.assignmentId}`}>
                        <span className="due-when">{shortDate(d.date)}</span>
                        <span className="due-course">{d.courseCode}</span>
                        <span className="due-title">{d.title}</span>
                        <span className="due-kind">{d.kind}</span>
                        <span className="due-hours">
                          {d.personalHours === undefined ? 'sat, not written' : hours(d.personalHours)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="calendar-notes">
              <p className="kicker">Your card</p>
              <ul className="card-list">
                {plan.courses.map((c) => (
                  <li key={c.courseCode}>
                    <strong>{c.courseCode}</strong>
                    {c.section && <span className="card-section"> §{c.section}</span>}
                    <ul>
                      {c.meetings.map((m) => (
                        <li key={`${m.type}${m.section ?? ''}`} className={m.attendance === 'flexible' ? 'skippable' : ''}>
                          {m.type} · {m.days.join('')} {m.time}
                          {m.derivedTime && <abbr title="The registrar never published this hour; the game picks one, the same for every player."> ~</abbr>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              <p className="kicker">Collisions</p>
              {plan.collisions.length === 0 ? (
                <p>Nothing overlaps.</p>
              ) : (
                <ul className="collision-list">
                  {plan.collisions.map((c) => (
                    <li key={`${c.a}|${c.b}`} className={c.severity}>
                      <span className="collision-what">{c.aTitle} × {c.bTitle}</span>
                      <span className="collision-count">
                        {c.severity === 'hard' ? 'both mandatory' : 'one is skippable'} · {c.dates.length} days
                      </span>
                      {c.derived && (
                        <span className="collision-caveat">
                          one of these hours is the game's guess, not the registrar's
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
