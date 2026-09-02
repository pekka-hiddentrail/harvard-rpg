import { useEffect, useState } from 'react'

/**
 * The planner (GAME_DESIGN §9.2) — *"a screen, always available, never a scene"*.
 *
 * One fetch, unlike shopping week and the calendar, because there is nothing here that does not
 * depend on the save: a requirement graph with no card against it is just the content, and the
 * whole output of this screen is the *join*. `/api/game/:id/plan` returns every track solved,
 * always (ARCHITECTURE §3.4), so the list is not filtered here either — a track you were not
 * thinking about closing is exactly the thing this screen exists to tell you.
 *
 * The client owns no arithmetic. It does not count a slot, decide that a group is done, or work
 * out that eight courses of which three are the breadth courses is eight rather than eleven.
 * Every number and every sentence below is the solver's; this file chooses where they go.
 */

const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

type TrackStatus = 'done' | 'slack' | 'tight' | 'closed' | 'unplannable'

type GroupProgress = {
  id: string
  label: string
  kind: 'course' | 'set' | 'sequence' | 'tag'
  need: number
  optional: boolean
  assigned: string[]
  credited: string[]
  have: number
  state: 'done' | 'partial' | 'open'
  routes: string[]
  abstractSlots: string[]
  dependsOnAbstract: boolean
  next?: string
  notes: string[]
}

type TrackProgress = {
  trackId: string
  name: string
  field: string
  honorsEligible: boolean
  thesisRequired: boolean
  declareBy?: { year: number; term: 'fall' | 'spring' }
  diploma?: string
  groups: GroupProgress[]
  counted: string[]
  wasted: string[]
  needMore: number
  slotsLeft: number
  slack: number
  status: TrackStatus
  reasons: string[]
}

/** r11's fourth output (§9.3): not *"closed"* but *"closed this year, and here is the way in."* */
type OpeningRoute = {
  blocked: string
  tag: string
  gap: number
  via: { courseCode: string; title: string; demand: number; gap: number }[]
}

type PlanResponse = {
  contentHash: string
  levels: Record<string, number>
  taken: string[]
  termsUsed: number
  tracks: TrackProgress[]
  blocked: OpeningRoute[]
}

/** The statuses §9.2 calls *the point of the whole screen*. Warned about, never hidden. */
const AT_RISK: TrackStatus[] = ['closed', 'tight', 'unplannable']

const STATUS_LABEL: Record<TrackStatus, string> = {
  done: 'done',
  slack: 'reachable',
  tight: 'tight',
  closed: 'closed',
  unplannable: 'not plannable',
}

/** ✓ / ◐ / ○, exactly as §9.2's mockup draws them. Decorative, so it is aria-hidden below and
 * the state is also given in words — a screen reader should not be handed a half-filled circle. */
const STATE_MARK: Record<GroupProgress['state'], string> = { done: '✓', partial: '◐', open: '○' }

/** What a group is still short. The client is allowed this one subtraction because it is
 * display of two numbers it was handed, not a rule: the solver's `needMore` is the real bill. */
const short = (g: GroupProgress): number => Math.max(0, g.need - g.have)

export function PlannerScreen({ onBack, gameId }: { onBack: () => void; gameId: string | null }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (gameId === null) return
    let stale = false
    fetch(`${BASE}/api/game/${gameId}/plan`)
      .then(async (r) => ({ status: r.status, body: (await r.json()) as unknown }))
      .then(({ status, body }) => {
        if (stale) return
        if (status === 200) {
          setPlan(body as PlanResponse)
          return
        }
        const problem = body as { error?: string; problems?: string[] }
        setError(problem.problems?.join('; ') ?? problem.error ?? `The server refused that (${status}).`)
      })
      .catch(() => {
        if (!stale) setError('The study plan did not load — is the API server running?')
      })
    return () => {
      stale = true
    }
  }, [gameId])

  /**
   * Opens on the track the card is furthest into, not on the first one alphabetically, because
   * the server already sorted the list by where the player actually is (§3.4). With an empty
   * card that is a stable arbitrary choice, which is the honest state of an undeclared freshman.
   */
  const track =
    plan === null ? null : (plan.tracks.find((t) => t.trackId === selectedId) ?? plan.tracks[0] ?? null)

  const atRisk = (plan?.tracks ?? []).filter((t) => AT_RISK.includes(t.status))
  /** Only the blocked courses that have a way in. A closed course with no cheaper route is a
   * fact about your levels, and it belongs on shopping week's row, not in a list of routes. */
  const routes = (plan?.blocked ?? []).filter((b) => b.via.length > 0)

  return (
    <main className="planner-shell">
      <section className="planner-page" aria-labelledby="planner-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="planner-heading">
          <p className="kicker">
            {plan === null
              ? 'Study plan'
              : `Undeclared · term ${plan.termsUsed} · ${plan.taken.length} course${plan.taken.length === 1 ? '' : 's'} on the record`}
          </p>
          <h1 id="planner-title">Where this leads.</h1>
        </div>

        {error !== null && <p className="course-refusal" role="alert">{error}</p>}

        {gameId === null && (
          <p className="planner-empty">
            No save yet, so there is no plan to make. Every track is still open, which is true
            and not useful.
          </p>
        )}

        {plan !== null && track !== null && (
          <div className="planner-layout">
            <nav className="track-rail" aria-label="Concentrations">
              {plan.tracks.map((t) => (
                <button
                  key={t.trackId}
                  type="button"
                  className={`track-row ${t.status}${t.trackId === track.trackId ? ' selected' : ''}`}
                  onClick={() => setSelected(t.trackId)}
                  aria-current={t.trackId === track.trackId}
                >
                  <span className="track-name">{t.name}</span>
                  <span className="track-status">{STATUS_LABEL[t.status]}</span>
                  <span className="track-slots">
                    {t.needMore} / {t.slotsLeft} slots
                  </span>
                  <span className="track-counted">
                    {t.counted.length === 0 ? '—' : `${t.counted.length} counted`}
                  </span>
                </button>
              ))}
            </nav>

            <div className="planner-main">
              <header className="track-header">
                <h2>{track.name}</h2>
                <p className="track-meta">
                  {track.honorsEligible ? 'honours-eligible' : 'not honours-eligible'}
                  {track.thesisRequired ? ' · thesis required' : ''}
                  {track.declareBy ? ` · declare by ${track.declareBy.term} of year ${track.declareBy.year}` : ''}
                  {track.diploma ? ` · diploma reads "${track.diploma}"` : ''}
                </p>
                {/* The status sentence and every group sentence under it. §9.3: a solver that
                    returns `false` is useless here, so the reason is the payload. */}
                <ul className="track-reasons">
                  {track.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </header>

              <table className="group-table">
                <caption className="visually-hidden">
                  Requirement groups for {track.name}, and what is left of each
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Requirement</th>
                    <th scope="col">Have</th>
                    <th scope="col">On the card</th>
                    <th scope="col">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {track.groups.map((g) => (
                    <tr key={g.id} className={`group-row ${g.state}${g.optional ? ' optional' : ''}`}>
                      <th scope="row">
                        <span className="group-mark" aria-hidden="true">{STATE_MARK[g.state]}</span>
                        <span className="group-label">{g.label}</span>
                        {g.optional && <span className="group-optional">optional</span>}
                        {g.kind === 'sequence' && <span className="group-kind">in order</span>}
                      </th>
                      <td className="group-have">
                        {g.have} of {g.need}
                        <span className="visually-hidden"> — {g.state}</span>
                      </td>
                      <td className="group-courses">
                        {g.assigned.length === 0 && g.credited.length === 0 ? (
                          <span className="group-none">—</span>
                        ) : (
                          <>
                            {g.assigned.map((c) => (
                              <span key={c} className="course-chip assigned">{c}</span>
                            ))}
                            {/* Credited, not assigned: this course clears a group that *this*
                                group counts, so it is one of these eight rather than a ninth. */}
                            {g.credited.map((c) => (
                              <abbr key={c} className="course-chip credited" title="counted here through a group this one contains">
                                {c}
                              </abbr>
                            ))}
                          </>
                        )}
                      </td>
                      <td className="group-left">
                        {g.state === 'done' ? (
                          <span className="group-done">done</span>
                        ) : g.next !== undefined ? (
                          <span className="group-next">next: {g.next}</span>
                        ) : g.dependsOnAbstract ? (
                          <span className="group-abstract">
                            {short(g)} more, {g.routes.length} in the catalogue
                          </span>
                        ) : (
                          <span className="group-routes">
                            {short(g)} more of {g.routes.length} route{g.routes.length === 1 ? '' : 's'}
                          </span>
                        )}
                        {/* A `from` entry no syllabus matches: a thesis, an unspecified elective,
                            or a real Harvard course the catalogue does not carry. All three read
                            the same from here, so the screen names them instead of guessing. */}
                        {g.abstractSlots.length > 0 && (
                          <span className="group-slots">not courses: {g.abstractSlots.join(', ')}</span>
                        )}
                        {/* The rules the graph cannot express, verbatim from the department's
                            own brochure. Unparsed on purpose — a rule this screen cannot
                            enforce is at least a rule the player can read. */}
                        {g.notes.map((n) => (
                          <span key={n} className="group-note">{n}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {track.wasted.length > 0 && (
                <p className="track-wasted">
                  Counts toward nothing here: {track.wasted.join(', ')}.
                </p>
              )}
            </div>

            <aside className="planner-notes">
              {/* §9.2: "the two warnings at the bottom are the point of the whole screen." */}
              <p className="kicker">Warnings</p>
              {atRisk.length === 0 ? (
                <p className="planner-fine">
                  Nothing has closed. Every concentration in content still fits in the slots you
                  have left.
                </p>
              ) : (
                <ul className="planner-warnings">
                  {atRisk.map((t) => (
                    <li key={t.trackId} className={t.status}>
                      <span aria-hidden="true">⚠ </span>
                      <strong>{t.name}</strong>
                      <span className="warning-why">{t.reasons[0]}</span>
                    </li>
                  ))}
                </ul>
              )}

              {routes.length > 0 && (
                <>
                  <p className="kicker">Closed this year</p>
                  <ul className="route-list">
                    {routes.slice(0, 8).map((b) => (
                      <li key={`${b.blocked}:${b.tag}`}>
                        <span className="route-blocked">{b.blocked}</span>
                        <span className="route-why">
                          {b.tag} is {b.gap} below what it assumes
                        </span>
                        {/* Not a forecast. These are the courses that ask less of the tag that
                            is stopping you — what a term of work does to a level is §4.5's
                            business, and promising it here is exactly what §4.4 forbids. */}
                        <span className="route-via">
                          asks less of {b.tag}: {b.via.slice(0, 3).map((v) => v.courseCode).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
