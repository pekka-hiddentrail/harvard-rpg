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
      // Two groups in one track and one in another: the row has to collapse this to the
      // concentrations, and the detail panel has to keep the groups.
      countsToward: [
        { trackId: 'cs_basic', trackName: 'Computer Science', groupId: 'prog-1', groupLabel: 'Programming 1' },
        { trackId: 'cs_basic', trackName: 'Computer Science', groupId: 'cs-core', groupLabel: 'CS core' },
        { trackId: 'cs_mbb', trackName: 'CS — Mind, Brain & Behavior', groupId: 'prog-1', groupLabel: 'Programming 1' },
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
      // A course no track in content asks for — which is a real state, not a missing field.
      countsToward: [],
    },
    {
      // The live case for a course that counts toward nothing: Expos is a college-wide
      // requirement, and there is no college-wide-requirements file in content yet.
      id: 'expos20',
      courseCode: 'expos20',
      title: 'Expository Writing 20',
      demand: 4,
      workloadHint: 'moderate',
      demands: { writing: 1 },
      meetings: [
        { type: 'seminar', days: ['Tue', 'Thu'], pattern: 'TTh', time: null, size: 15, attendance: 'mandatory', sections: true },
      ],
      officeHours: [],
      sessions: [],
      assignments: [],
      countsToward: [],
    },
  ],
  slots: [],
}

/**
 * `/api/game/:id/plan`, trimmed to the fields the cart reads. Two versions, because the point
 * of putting the plan on this screen is that it *moves* when the card does: before cs50 is
 * filed nothing counts toward anything, and after it two tracks have picked it up.
 */
const track = (over: Record<string, unknown>) => ({
  trackId: 't',
  name: 'T',
  status: 'slack',
  counted: [],
  needMore: 8,
  slotsLeft: 28,
  slack: 20,
  reasons: ['Needs 8 more of the 28 slots left; 20 spare.'],
  ...over,
})

const CLOSED = track({
  trackId: 'math_joint_primary',
  name: 'Mathematics, joint (primary field)',
  status: 'closed',
  needMore: 30,
  slack: -2,
  reasons: ['Needs 30 more courses and 28 slots remain (7 terms × 4).'],
})

const PLAN_EMPTY = { tracks: [track({ trackId: 'cs_basic', name: 'Computer Science' }), CLOSED] }

const PLAN_FILED = {
  tracks: [
    track({ trackId: 'cs_basic', name: 'Computer Science', counted: ['cs50'], needMore: 7 }),
    track({
      trackId: 'cs_mbb',
      name: 'CS — Mind, Brain & Behavior',
      status: 'tight',
      counted: ['cs50'],
      needMore: 28,
      slack: 0,
      reasons: ['Needs 28 more of the 28 slots left; 0 spare.'],
    }),
    CLOSED,
  ],
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

/** Affordable, and a destination for none of it. */
const EXPOS_PRICED = {
  courseCode: 'expos20',
  title: 'Expository Writing 20',
  effort: 4,
  open: true,
  gaps: [{ tag: 'writing', courseLevel: 1, playerLevel: 0, gap: 1, multiplier: 1.3 }],
  fixedHours: 2.5,
  baseCourseworkHours: 4,
  personalCourseworkHours: 5.2,
  baseWeeklyHours: 6.5,
  personalWeeklyHours: 7.7,
  drivingTag: 'writing',
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
function mockFetch(
  opts: {
    over?: boolean
    refuse?: { status: number; body: object }
    noPlan?: boolean
    /**
     * Hold `/api/courses` open until the test lets it go. The catalogue and the card are two
     * fetches and the card is far the smaller, so "priced already, 163 syllabi not yet" is the
     * ordinary state of the first render rather than a contrived one.
     */
    holdCourses?: boolean
    /** A card that already has something on it before the screen mounts. */
    enrolled?: { term: string; courseCode: string }[]
  } = {},
) {
  const commits: { action: string; body: unknown }[] = []
  /** The server's own state, minimally: whether cs50 is on the card yet. */
  let filed = false
  let releaseCourses = () => {}
  const coursesGate = new Promise<void>((resolve) => {
    releaseCourses = resolve
  })
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/courses')) {
      const body = () => new Response(JSON.stringify(COURSES))
      return opts.holdCourses ? coursesGate.then(body) : Promise.resolve(body())
    }
    if (url.endsWith('/plan')) {
      // The planner being unreachable must not put an error across shopping week, which
      // works perfectly well without knowing where the card leads.
      return Promise.resolve(
        opts.noPlan
          ? new Response(JSON.stringify({ error: 'no such save' }), { status: 404 })
          : new Response(JSON.stringify(filed ? PLAN_FILED : PLAN_EMPTY)),
      )
    }
    if (url.endsWith('/shopping')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            contentHash: 'test-hash',
            term: 'fall-2026',
            cap: 28,
            levels: { code: 0, math: -2 },
            courses: [CS50_PRICED, MATH_PRICED, EXPOS_PRICED],
            enrolled: opts.enrolled ?? [],
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
      filed = enrol
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
  return { fn, commits, releaseCourses: () => releaseCourses() }
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

/**
 * §9.3's second question, on the screen that asks the first. Shopping week can price a term;
 * only the study plan can tell you what the term costs you in three years, and the player
 * cannot answer that one by intuition — so the answer has to be here, next to the button.
 */
describe('what a course counts toward', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('collapses a course’s requirement groups to concentrations on the row', async () => {
    vi.stubGlobal('fetch', mockFetch().fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    // cs50 serves three groups across two tracks. A row cannot carry three group labels, so
    // it carries the two destinations, once each.
    expect(
      await screen.findByText('counts toward Computer Science · CS — Mind, Brain & Behavior'),
    ).toBeVisible()
  })

  it('keeps the groups themselves in the detail panel', async () => {
    vi.stubGlobal('fetch', mockFetch().fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Counts toward' })
    expect(screen.getByText('Programming 1, CS core')).toBeVisible()
    expect(screen.getByText('Programming 1')).toBeVisible()
  })

  it('says a course counts toward nothing rather than showing an empty heading', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetch().fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Counts toward' })
    await user.click(screen.getByRole('button', { name: /Linear Algebra/ }))

    // And it says why the two cases are indistinguishable, which is a fact about content and
    // not about the course: the college-wide requirements are not authored yet.
    expect(screen.getByText(/No concentration in content asks for this course/)).toBeVisible()
    expect(screen.getByText(/college-wide requirement/)).toBeVisible()
  })

  it('shows the plan moving when the card does, and warns about the tracks at risk', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetch().fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    const cart = await screen.findByRole('complementary', { name: 'Crimson Cart' })
    await waitFor(() =>
      expect(within(cart).getByText('Nothing on the card counts toward a concentration yet.')).toBeVisible(),
    )
    // The closed track is warned about from the start — you do not have to have done anything
    // for a concentration to already be out of reach.
    expect(
      within(cart).getByText(/Mathematics, joint \(primary field\): Needs 30 more courses/),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    // Prices do not move on enrolling; the plan does, which is why it is re-asked.
    await waitFor(() => expect(within(cart).getByText('Computer Science')).toBeVisible())
    expect(within(cart).getByText('1 on the card · 7 more of 28 slots')).toBeVisible()
    // §9.2: a track going tight is the point of the screen, so it is a warning and not a chip.
    expect(within(cart).getByText(/Mind, Brain & Behavior: Needs 28 more of the 28 slots/)).toBeVisible()
  })

  it('names a filed course that counts toward nothing anywhere', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetch().fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'What it costs you' })
    await user.click(screen.getByRole('button', { name: /Expository Writing 20/ }))
    await user.click(screen.getByRole('button', { name: 'Add to cart' }))

    const cart = await screen.findByRole('complementary', { name: 'Crimson Cart' })
    await waitFor(() =>
      expect(within(cart).getByText(/expos20 counts toward no concentration here/)).toBeVisible(),
    )
  })

  it('waits for the catalogue before claiming a course counts toward nothing', async () => {
    // Two independent fetches, and the card is the smaller one. Keying the orphan line off a
    // missing `countsToward` alone made the screen state a content fact — "cs50 counts toward
    // no concentration here" — for as long as the catalogue took to arrive, about a course that
    // counts toward three groups.
    const mock = mockFetch({ holdCourses: true, enrolled: [{ term: 'fall-2026', courseCode: 'cs50' }] })
    vi.stubGlobal('fetch', mock.fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    const cart = await screen.findByRole('complementary', { name: 'Crimson Cart' })
    expect(within(cart).queryByText(/counts toward no concentration here/)).toBeNull()

    mock.releaseCourses()
    await waitFor(() => expect(screen.getByRole('button', { name: /CS50/ })).toBeVisible())
    // And it still says nothing once the catalogue is in, because cs50 is not an orphan.
    expect(within(cart).queryByText(/counts toward no concentration here/)).toBeNull()
  })

  it('carries on without the plan when the planner cannot be reached', async () => {
    vi.stubGlobal('fetch', mockFetch({ noPlan: true }).fn)
    render(<CourseRegistrationScreen identity={identity} gameId="save-1" onBack={() => {}} />)

    // Prices still arrive. A study plan that failed to load is not an error about this term.
    expect(await screen.findByText(/effort 7 · ~11\.7h\/wk/)).toBeVisible()
    expect(screen.queryByText('Where this leads')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers the way into the planner when one is wired up', async () => {
    const onViewPlan = vi.fn()
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetch().fn)
    render(
      <CourseRegistrationScreen
        identity={identity}
        gameId="save-1"
        onBack={() => {}}
        onViewPlan={onViewPlan}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /Where this leads/ }))
    expect(onViewPlan).toHaveBeenCalledOnce()
  })
})
