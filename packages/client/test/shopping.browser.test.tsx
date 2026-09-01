import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterIdentity } from '../src/CharacterGenerationScreen.tsx'
import { CourseRegistrationScreen } from '../src/CourseRegistrationScreen.tsx'

const identity: CharacterIdentity = {
  name: 'Pekka',
  gender: 'woman',
  age: '18',
  country: 'United States',
  city: 'Boston',
  state: 'Massachusetts',
  school: 'Boston High School',
  avatarIndex: 0,
  seed: 'test-seed',
}

// Two courses, shaped after the pair the engine tests use: one the player can afford at a
// price, and one that is shut. The numbers are the server's — this screen must not recompute
// any of them, so the fixtures deliberately contain arithmetic the client could not derive.
const COURSES = {
  contentHash: 'test-hash',
  courses: [
    {
      id: 'cs50',
      courseCode: 'cs50',
      title: 'CS50: Introduction to Computer Science',
      demand: 7,
      workloadHint: 'heavy',
      demands: { code: 2, math: 1 },
      meetings: [
        { type: 'lecture', days: ['Mon', 'Wed'], pattern: 'MW', time: '09:00-10:30', size: 400, attendance: 'flexible', sections: false },
        { type: 'section', days: ['Thu'], pattern: 'TTh', time: null, size: 20, attendance: 'expected', sections: true },
      ],
      officeHours: [],
      sessions: [],
      assignments: [
        { id: 'pset0', title: 'Problem Set 0', kind: 'pset', assigned: '2026-09-02', due: '2026-09-09', date: null, time: null, estHours: 6, weight: 0.1, dependsOnSessions: [], coversSessions: [], stages: [] },
      ],
    },
    {
      id: 'math21b',
      courseCode: 'math21b',
      title: 'Mathematics 21b: Linear Algebra',
      demand: 7,
      workloadHint: 'heavy',
      demands: { math: 3 },
      meetings: [
        { type: 'lecture', days: ['Mon', 'Wed', 'Fri'], pattern: 'MWF', time: null, size: 60, attendance: 'expected', sections: false },
      ],
      officeHours: [],
      sessions: [],
      assignments: [],
    },
  ],
  slots: [],
}

const SECTIONS = [
  { id: 'cs50', section: 'A', courseCode: 'cs50', type: 'section', pattern: 'TTh', time: '13:00-14:15', days: ['Thu'], size: 20, occupied: 4, theme: null, blurb: null, instructor: 'Ramirez' },
  { id: 'cs50', section: 'B', courseCode: 'cs50', type: 'section', pattern: 'TTh', time: '15:00-16:15', days: ['Thu'], size: 20, occupied: 9, theme: null, blurb: null, instructor: 'Okonkwo' },
]

/** cs50 for a player at code 0, math -2: behind on code, comfortably over on math. */
const CS50_PRICED = {
  courseCode: 'cs50',
  title: 'CS50: Introduction to Computer Science',
  effort: 7,
  open: true,
  gaps: [
    { tag: 'code', courseLevel: 2, playerLevel: 0, gap: 2, multiplier: 1.7 },
    { tag: 'math', courseLevel: 1, playerLevel: -2, gap: 3, multiplier: 2.4 },
  ],
  fixedHours: 5.8,
  baseCourseworkHours: 4,
  personalCourseworkHours: 5.9,
  baseWeeklyHours: 9.8,
  personalWeeklyHours: 11.7,
  drivingTag: 'code',
  sections: SECTIONS,
}

/** math21b at math -2: gap 5, which §4.5 calls not survivable. No multiplier at all. */
const MATH_PRICED = {
  courseCode: 'math21b',
  title: 'Mathematics 21b: Linear Algebra',
  effort: 6,
  open: false,
  gaps: [{ tag: 'math', courseLevel: 3, playerLevel: -2, gap: 5 }],
  fixedHours: 2.5,
  baseCourseworkHours: 3,
  personalCourseworkHours: 3,
  baseWeeklyHours: 5.5,
  personalWeeklyHours: 5.5,
  drivingTag: 'math',
  sections: [],
}

const emptySummary = {
  effortTotal: 0,
  cap: 28,
  over: false,
  overBy: 0,
  baseWeeklyHours: 0,
  personalWeeklyHours: 0,
  closed: ['math21b'],
}

/**
 * `commits` records what the screen actually asked the server to do, so a test can assert on
 * the request rather than only on the re-render. `over` flips the cart into the state §4.6
 * cares about most: past the cap, and still answering 200.
 */
function mockFetch(opts: { over?: boolean; refuse?: { status: number; body: object } } = {}) {
  const commits: { action: string; body: unknown }[] = []
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/courses')) {
      return Promise.resolve(new Response(JSON.stringify(COURSES)))
    }
    if (url.endsWith('/shopping')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            contentHash: 'test-hash',
            term: 'fall-2026',
            cap: 28,
            levels: { code: 0, math: -2 },
            courses: [CS50_PRICED, MATH_PRICED],
            enrolled: [],
            summary: emptySummary,
          }),
        ),
      )
    }
    const enrol = url.endsWith('/shopping/enrol')
    const drop = url.endsWith('/shopping/drop')
    if (enrol || drop) {
      const body = JSON.parse(String(init?.body)) as { courseCode: string; section?: string }
      commits.push({ action: enrol ? 'enrol' : 'drop', body })
      if (opts.refuse) {
        return Promise.resolve(new Response(JSON.stringify(opts.refuse.body), { status: opts.refuse.status }))
      }
      const enrolled = enrol
        ? [{ term: 'fall-2026', courseCode: body.courseCode, ...(body.section ? { section: body.section } : {}) }]
        : []
      return Promise.resolve(
        new Response(
          JSON.stringify({
            enrolled,
            courses: enrol ? [CS50_PRICED] : [],
            summary: enrol
              ? {
                  effortTotal: opts.over ? 31 : 7,
                  cap: 28,
                  over: opts.over ?? false,
                  overBy: opts.over ? 3 : 0,
                  baseWeeklyHours: 9.8,
                  personalWeeklyHours: 11.7,
                  closed: ['math21b'],
                }
              : emptySummary,
          }),
        ),
      )
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`))
  })
  return { fn, commits }
}

const priceBox = () =>
  screen.getByRole('heading', { name: 'What it costs you' }).parentElement as HTMLElement

describe('shopping week', () => {
  let commits: { action: string; body: unknown }[]

  beforeEach(() => {
    const mock = mockFetch()
    commits = mock.commits
    vi.stubGlobal('fetch', mock.fn)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prices each course in hours a week, alongside what it would cost someone prepared', async () => {
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    expect(await screen.findByRole('heading', { name: 'What it would cost you.' })).toBeVisible()
    expect(screen.getByText(/effort 7 · ~11\.7h\/wk \(~9\.8h\/wk prepared\)/)).toBeVisible()
  })

  it('shows the gap table: what the course asks, what you have, and the multiplier', async () => {
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    const codeRow = screen.getByRole('rowheader', { name: 'code' }).parentElement as HTMLElement
    expect(within(codeRow).getByText('2')).toBeVisible()
    expect(within(codeRow).getByText('+2')).toBeVisible()
    expect(within(codeRow).getByText('×1.7')).toBeVisible()

    const mathRow = screen.getByRole('rowheader', { name: 'math' }).parentElement as HTMLElement
    expect(within(mathRow).getByText('-2')).toBeVisible()
    expect(within(mathRow).getByText('×2.4')).toBeVisible()
  })

  it('states the total as its parts, so the player can add it up themselves', async () => {
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    expect(
      within(priceBox()).getByText(/5\.8h in class and exams \+ 5\.9h of work/),
    ).toBeVisible()
    expect(within(priceBox()).getByText(/same work in 4h/)).toBeVisible()
  })

  it('never shows a predicted grade — §4.4 gives this screen price and not outcome', async () => {
    const { container } = render(
      <CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />,
    )

    await screen.findByRole('heading', { name: 'What it costs you' })
    expect(container.textContent).not.toMatch(/\bgrade\b|\bGPA\b|\byou would get\b/i)
  })

  it('closes a not-survivable course with its reason and a route out, not a blank refusal', async () => {
    const user = userEvent.setup()
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it would cost you.' })
    expect(screen.getByText('not survivable at your level')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Linear Algebra/ }))

    expect(screen.getByText(/math is too far below what this course assumes/)).toBeVisible()
    expect(screen.getByText(/a lower course in the same subject/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Closed to you' })).toBeDisabled()
    // Shut, but still priced: the hours are what you would be signing up for if you could.
    const mathRow = screen.getByRole('rowheader', { name: 'math' }).parentElement as HTMLElement
    expect(within(mathRow).getByText('not survivable')).toBeVisible()
  })

  it('adds a course to the Crimson Cart, sending the section it was shown', async () => {
    const user = userEvent.setup()
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    const cart = await screen.findByRole('complementary', { name: 'Crimson Cart' })
    await waitFor(() => expect(within(cart).getByText(/CS50.*section A/)).toBeVisible())
    expect(within(cart).getByText('Effort 7 / 28 · ~11.7h/wk (~9.8h/wk for someone prepared)')).toBeVisible()
    expect(commits).toEqual([{ action: 'enrol', body: { courseCode: 'cs50', section: 'A' } }])
  })

  it('sends the section the player chose, not the first one', async () => {
    const user = userEvent.setup()
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    await user.selectOptions(screen.getByLabelText(/Section/), 'B')
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    await waitFor(() =>
      expect(commits).toEqual([{ action: 'enrol', body: { courseCode: 'cs50', section: 'B' } }]),
    )
  })

  it('drops a course from the cart', async () => {
    const user = userEvent.setup()
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))
    await screen.findByRole('button', { name: 'Drop this course' })

    await user.click(screen.getByRole('button', { name: 'Drop this course' }))

    await waitFor(() => expect(screen.getByText('Nothing on the card yet.')).toBeVisible())
    expect(commits.map((c) => c.action)).toEqual(['enrol', 'drop'])
  })

  it('renders the plain catalogue, unpriced, when there is no save yet', async () => {
    render(<CourseRegistrationScreen identity={identity} gameId={null} onBack={() => {}} />)

    expect(await screen.findByRole('heading', { name: "What's real so far." })).toBeVisible()
    // Both fixtures carry the same authored workload — which is the point: unpriced, the
    // catalogue can only say what the course is, identically for everyone.
    expect(screen.getAllByText('demand 7 · heavy')).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'What it costs you' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Crimson Cart' })).toBeNull()
  })
})

describe('the semester effort cap', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the overrun without refusing it — a line, not a wall (§4.6)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetch({ over: true }).fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    const cart = await screen.findByRole('complementary', { name: 'Crimson Cart' })
    await waitFor(() => expect(within(cart).getByText(/Effort 31 \/ 28/)).toBeVisible())
    expect(within(cart).getByText(/3 over the semester effort cap/)).toBeVisible()
    // The course went on the card anyway. Nothing here is disabled by being over.
    expect(within(cart).getByText(/CS50/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Drop this course' })).toBeEnabled()
  })

  it('renders a server refusal with the reason it carried', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      mockFetch({ refuse: { status: 422, body: { error: 'cs50 needs a section', sections: ['A', 'B'] } } }).fn,
    )
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    expect(await screen.findByText('cs50 needs a section — pick one of: A, B')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeVisible()
  })
})
