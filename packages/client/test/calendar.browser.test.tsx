import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarScreen } from '../src/CalendarScreen.tsx'

/**
 * The eleven bands, as `/api/day/activities` serves them. Content-only, identical for every
 * player — which is why the screen fetches them separately from the term.
 */
const BANDS = [
  { index: 0, label: '07:15 – 08:00', name: 'wakeup', anchor: 'wakeup' },
  { index: 1, label: '08:15 – 09:00', name: 'breakfast', anchor: 'meal' },
  { index: 2, label: '09:00 – 10:15', name: 'morning', anchor: null },
  { index: 3, label: '10:30 – 11:45', name: 'late morning', anchor: null },
  { index: 4, label: '12:00 – 13:15', name: 'lunch', anchor: 'meal' },
  { index: 5, label: '13:30 – 14:45', name: 'early afternoon', anchor: null },
  { index: 6, label: '15:00 – 16:15', name: 'afternoon', anchor: null },
  { index: 7, label: '16:45 – 17:30', name: 'late afternoon', anchor: null },
  { index: 8, label: '18:00 – 19:30', name: 'dinner', anchor: 'meal' },
  { index: 9, label: '19:30 – 21:00', name: 'evening', anchor: null },
  { index: 10, label: '21:00 –', name: 'night', anchor: 'night' },
]

const occ = (eventId: string, title: string, date: string, startBand: number, endBand: number, hard: boolean) => ({
  eventId,
  title,
  date,
  startBand,
  endBand,
  hard,
})

/**
 * The gate week, made minimal: a Tuesday in mid-October with a mandatory section running
 * straight into a lecture you are allowed to skip, and three deadlines in the same seven days.
 * Every number here is the server's — the screen must not be able to derive any of them, so
 * the personal hours deliberately disagree with the authored ones.
 */
const TUE = '2026-10-13'

const day = (date: string, occurrences: ReturnType<typeof occ>[], freeBands: number, density: string, conflicts: unknown[] = []) => ({
  date,
  weekday: 0,
  occurrences,
  conflicts,
  freeBands,
  density,
})

const PLAN = {
  term: 'fall2026',
  firstDay: '2026-09-01',
  lastDay: '2026-12-04',
  courses: [
    {
      courseCode: 'cs50',
      title: 'Introduction to Computer Science',
      section: '011',
      meetings: [
        { type: 'lecture', days: ['Mon', 'Wed'], time: '09:00-10:30', derivedTime: false, startBand: 2, endBand: 3, attendance: 'flexible' },
        { type: 'section', section: '011', days: ['Tue'], time: '09:00-11:45', derivedTime: false, startBand: 2, endBand: 4, attendance: 'mandatory' },
      ],
    },
    {
      courseCode: 'math21b',
      title: 'Linear Algebra',
      meetings: [
        { type: 'lecture', days: ['Tue', 'Thu'], time: '10:30-11:45', derivedTime: true, startBand: 3, endBand: 4, attendance: 'flexible' },
      ],
    },
  ],
  days: [
    day('2026-10-12', [], 11, 'open'),
    day(TUE, [occ('cs50:section:011:Tue', 'CS50 section 011', TUE, 2, 4, true), occ('math21b:lecture:Tue', 'MATH21B lecture', TUE, 3, 4, false)], 8, 'workable', [{ severity: 'soft' }]),
    day('2026-10-14', [occ('cs50:lecture:Wed', 'CS50 lecture', '2026-10-14', 2, 3, false)], 10, 'open'),
    day('2026-10-15', [occ('math21b:lecture:Thu', 'MATH21B lecture', '2026-10-15', 3, 4, false)], 10, 'open'),
    day('2026-10-16', [], 2, 'squeezed'),
    day('2026-10-17', [], 11, 'open'),
    day('2026-10-18', [], 11, 'open'),
  ],
  weeks: [
    { week: 6, monday: '2026-10-05', sunday: '2026-10-11', due: [], baseHours: 0, personalHours: 0, freeBands: 70, pressure: 0 },
    {
      week: 7,
      monday: '2026-10-12',
      sunday: '2026-10-18',
      due: [
        { courseCode: 'cs50', assignmentId: 'ps4', title: 'Problem Set 4', kind: 'pset', date: TUE, weight: 0.1, baseHours: 6, personalHours: 14.4 },
        { courseCode: 'math21b', assignmentId: 'ps5', title: 'Problem Set 5', kind: 'pset', date: TUE, weight: 0.1, baseHours: 8, personalHours: 10 },
        { courseCode: 'math21b', assignmentId: 'mid', title: 'Midterm', kind: 'exam', date: '2026-10-16', weight: 0.3 },
      ],
      baseHours: 14,
      personalHours: 24.4,
      freeBands: 64,
      pressure: 0.4,
    },
    { week: 13, monday: '2026-11-23', sunday: '2026-11-29', due: [], baseHours: 0, personalHours: 0, freeBands: 77, pressure: 0 },
  ],
  collisions: [
    {
      a: 'cs50:section:011',
      b: 'math21b:lecture',
      aTitle: 'CS50 section 011',
      bTitle: 'MATH21B lecture',
      severity: 'soft',
      dates: [TUE],
      derived: true,
    },
  ],
  peakWeeks: [7],
}

function mockFetch(opts: { plan?: object; termStatus?: number; termBody?: object } = {}) {
  return vi.fn((url: string) => {
    if (url.endsWith('/api/day/activities')) {
      return Promise.resolve(new Response(JSON.stringify({ contentHash: 'test-hash', bands: BANDS })))
    }
    if (url.endsWith('/term')) {
      if (opts.termStatus !== undefined) {
        return Promise.resolve(new Response(JSON.stringify(opts.termBody ?? {}), { status: opts.termStatus }))
      }
      return Promise.resolve(
        new Response(JSON.stringify({ contentHash: 'test-hash', levels: {}, plan: opts.plan ?? PLAN })),
      )
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

describe('CalendarScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens on the busiest week, not on week 1 and not on the machine clock', async () => {
    // Week 1 is empty by construction and the wall clock is not the save's date. The peak week
    // is the one the plan itself says is worth looking at.
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    expect(await screen.findByRole('heading', { name: /Week 7/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /12 Oct to 18 Oct/ })).toBeTruthy()
  })

  it('draws the week on the band grid, with the bands the server named', async () => {
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: /Week 7/ })
    // Eleven band rows, labelled from content — the client does not know a band's clock extent.
    for (const b of BANDS) expect(screen.getByText(b.label)).toBeTruthy()
    // The section runs 09:00-11:45 and so occupies two bands — it is drawn in both, which is
    // the point of a band grid: the row it is missing from is a row you could study in.
    expect(screen.getAllByText('CS50 section 011')).toHaveLength(2)
    expect(screen.getAllByText('MATH21B lecture')).toHaveLength(2) // Tuesday and Thursday
  })

  it('marks the band two classes share, which is where the decision is', async () => {
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: /Week 7/ })
    // Band 3 on the Tuesday holds both the mandatory section and the skippable lecture.
    const clashed = document.querySelectorAll('.band-cell.clash')
    expect(clashed).toHaveLength(1)
    expect(within(clashed[0] as HTMLElement).getByText('CS50 section 011')).toBeTruthy()
    expect(within(clashed[0] as HTMLElement).getByText('MATH21B lecture')).toBeTruthy()
    // And the two are distinguishable: one you must attend, one you may skip (§4.3).
    expect(clashed[0]!.querySelectorAll('.slot.hard')).toHaveLength(1)
    expect(clashed[0]!.querySelectorAll('.slot.soft')).toHaveLength(1)
  })

  it('lists the week the player owes, in their hours and the syllabus’s', async () => {
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: /Week 7/ })
    const due = screen.getByLabelText('Due in week 7')
    expect(within(due).getByText(/24.4 h for you/)).toBeTruthy()
    expect(within(due).getByText(/14.0 h as authored/)).toBeTruthy()
    // Three deadlines converging — the gate sentence, on the screen.
    expect(within(due).getAllByRole('listitem')).toHaveLength(3)
    expect(within(due).getByText('14.4 h')).toBeTruthy()
    // An exam with no authored hours is said to be sat, not silently reported as zero.
    expect(within(due).getByText('sat, not written')).toBeTruthy()
  })

  it('says which hours the registrar never published', async () => {
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: /Week 7/ })
    // Math 21b's lecture hour is the game's pick. Overclaiming it as published would make a
    // derived collision look like a fact about Harvard.
    expect(screen.getByTitle(/never published this hour/)).toBeTruthy()
    expect(screen.getByText(/the game's guess, not the registrar's/)).toBeTruthy()
    expect(screen.getByText(/one is skippable · 1 days/)).toBeTruthy()
  })

  it('moves to another week when the rail is clicked', async () => {
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: /Week 7/ })
    await userEvent.click(screen.getByRole('button', { name: /23 Nov/ }))
    expect(await screen.findByRole('heading', { name: /Week 13/ })).toBeTruthy()
    // Thanksgiving: nothing due, and the screen says how much room that leaves.
    expect(screen.getByText(/Nothing due. 77 free bands./)).toBeTruthy()
  })

  it('says there is no term rather than drawing one, with no save', async () => {
    render(<CalendarScreen onBack={() => {}} gameId={null} />)
    expect(await screen.findByText(/No save yet, so there is no term to draw/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Week/ })).toBeNull()
  })

  it('treats an empty card as a real term, not a failed load', async () => {
    vi.stubGlobal('fetch', mockFetch({ plan: { ...PLAN, courses: [], collisions: [], peakWeeks: [] } }))
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    expect(await screen.findByText(/entirely empty/)).toBeTruthy()
    // The weeks are still drawn: an empty schedule is information about this card.
    expect(screen.getByRole('heading', { name: /Week 6/ })).toBeTruthy()
  })

  it('reports the server’s reason when the term cannot be built', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        termStatus: 422,
        termBody: { error: 'the term calendar could not be built from this card', detail: 'ls1a: week 13 has no session 1' },
      }),
    )
    render(<CalendarScreen onBack={() => {}} gameId="g1" />)
    // §9.3: report why. A content bug in one course file is not "something went wrong".
    expect(await screen.findByRole('alert')).toHaveTextContent('ls1a: week 13 has no session 1')
  })

  it('goes back when asked', async () => {
    const onBack = vi.fn()
    render(<CalendarScreen onBack={onBack} gameId="g1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy())
    await userEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
