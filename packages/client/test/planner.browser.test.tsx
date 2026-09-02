import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerScreen } from '../src/PlannerScreen.tsx'

/**
 * The planner (GAME_DESIGN §9.2). Every number in these fixtures is the solver's, and several
 * of them are deliberately not derivable from the rest — `needMore` is 8 for a group set whose
 * deficits sum to 11, because eight Mathematics courses *of which* three are the breadth
 * courses is eight. If the screen ever starts computing that itself, these numbers stop
 * agreeing and the tests say so.
 */

const group = (over: Record<string, unknown>) => ({
  id: 'g',
  label: 'G',
  kind: 'set',
  need: 1,
  optional: false,
  assigned: [],
  credited: [],
  have: 0,
  state: 'open',
  routes: ['x1', 'x2'],
  abstractSlots: [],
  dependsOnAbstract: false,
  notes: [],
  ...over,
})

const MATH = {
  trackId: 'math',
  name: 'Mathematics',
  field: 'math',
  honorsEligible: true,
  thesisRequired: false,
  declareBy: { year: 2, term: 'fall' },
  diploma: 'Mathematics',
  groups: [
    group({
      id: 'intro-sequence',
      label: 'Introductory sequence',
      kind: 'sequence',
      need: 2,
      assigned: ['math1a'],
      have: 1,
      state: 'partial',
      routes: ['math1b'],
      next: 'math1b',
    }),
    group({
      id: 'math-courses',
      label: 'Mathematics courses',
      need: 8,
      assigned: ['math21b'],
      // Credited, not assigned: math101 clears the breadth group, which this group counts.
      credited: ['math101'],
      have: 2,
      state: 'partial',
      routes: ['math23a', 'math25a', 'math25b', 'math55a', 'math55b', 'math154'],
      notes: [
        'At least four of the eight must be 100-level; the catalogue carries only two.',
        'Math Ma + Mb count as one combined credit.',
      ],
    }),
    group({
      id: 'breadth-algebra',
      label: 'Breadth: algebra',
      assigned: ['math101'],
      have: 1,
      state: 'done',
      routes: [],
    }),
    group({
      id: 'expository-paper',
      label: 'Expository paper',
      kind: 'course',
      routes: [],
      abstractSlots: ['math_expository_paper'],
      dependsOnAbstract: true,
    }),
    group({
      id: 'thesis',
      label: 'Senior thesis',
      optional: true,
      routes: [],
      abstractSlots: ['math_senior_thesis'],
      dependsOnAbstract: true,
    }),
  ],
  counted: ['math1a', 'math21b', 'math101'],
  wasted: ['expos20', 'ls1a'],
  needMore: 8,
  slotsLeft: 28,
  slack: 20,
  status: 'slack',
  reasons: [
    'Needs 8 more of the 28 slots left; 20 spare.',
    'Introductory sequence must be taken in order; next is math1b, and 1 of 2 remain.',
    'Expository paper: no course in content satisfies this — math_expository_paper.',
  ],
}

const MBB = {
  ...MATH,
  trackId: 'cs_mbb',
  name: 'CS — Mind, Brain & Behavior',
  field: 'cs',
  thesisRequired: true,
  diploma: 'Computer Science',
  groups: [
    group({
      id: 'cs-core',
      label: 'CS core',
      need: 8,
      have: 1,
      assigned: ['cs50'],
      state: 'partial',
      routes: ['cs51', 'cs61', 'cs20', 'cs1200', 'cs1210', 'cs1240'],
      abstractSlots: ['cs91r', 'cs_elective_1', 'cs_elective_2'],
      dependsOnAbstract: true,
    }),
  ],
  counted: ['cs50'],
  wasted: [],
  needMore: 28,
  slotsLeft: 28,
  slack: 0,
  status: 'tight',
  reasons: ['Needs 28 more of the 28 slots left; 0 spare.'],
}

const JOINT = {
  ...MATH,
  trackId: 'math_joint_primary',
  name: 'Mathematics, joint (primary field)',
  groups: [group({ id: 'both', label: 'Both fields', need: 30, routes: ['x1'] })],
  counted: [],
  wasted: [],
  needMore: 30,
  slotsLeft: 28,
  slack: -2,
  status: 'closed',
  reasons: ['Needs 30 more courses and 28 slots remain (7 terms × 4).'],
}

const PLAN = {
  contentHash: 'test-hash',
  levels: { math: -2, code: 0 },
  taken: ['math1a', 'math21b', 'math101', 'cs50', 'expos20', 'ls1a'],
  termsUsed: 1,
  tracks: [MATH, MBB, JOINT],
  blocked: [
    {
      blocked: 'math55a',
      tag: 'math',
      gap: 5,
      via: [
        { courseCode: 'mathma', title: 'Math Ma', demand: 0, gap: 2 },
        { courseCode: 'math1a', title: 'Math 1a', demand: 1, gap: 3 },
        { courseCode: 'math21a', title: 'Math 21a', demand: 2, gap: 4 },
        { courseCode: 'math21b', title: 'Math 21b', demand: 2, gap: 4 },
      ],
    },
    // Shut with no cheaper course in content. That is a fact about your levels, not a route,
    // so it belongs on shopping week's row and must not appear in this list.
    { blocked: 'math55b', tag: 'math', gap: 6, via: [] },
  ],
}

function mockFetch(opts: { status?: number; body?: object; plan?: object } = {}) {
  return vi.fn((url: string) => {
    if (url.endsWith('/plan')) {
      if (opts.status !== undefined) {
        return Promise.resolve(new Response(JSON.stringify(opts.body ?? {}), { status: opts.status }))
      }
      return Promise.resolve(new Response(JSON.stringify(opts.plan ?? PLAN)))
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
}

const groupRow = (label: string): HTMLElement =>
  screen.getByRole('rowheader', { name: new RegExp(label) }).parentElement as HTMLElement

describe('PlannerScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens on the track the solver ranked first, not the first alphabetically', async () => {
    // §3.4: the server already sorted by where the player actually is, and the useful reading
    // of the list is "where am I going?" — so the screen does not re-sort or re-choose.
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    expect(await screen.findByRole('heading', { name: 'Mathematics' })).toBeTruthy()
    expect(screen.getByText(/honours-eligible/)).toBeTruthy()
    expect(screen.getByText(/declare by fall of year 2/)).toBeTruthy()
  })

  it('lists every track, including the ones that are out of reach', async () => {
    // Running all seven always is the whole reason the planner can tell you that a track you
    // were not thinking about just closed.
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    const rail = await screen.findByRole('navigation', { name: 'Concentrations' })
    expect(within(rail).getAllByRole('button')).toHaveLength(3)
    expect(within(rail).getByText('closed')).toBeTruthy()
    expect(within(rail).getByText('tight')).toBeTruthy()
    expect(within(rail).getByText('30 / 28 slots')).toBeTruthy()
  })

  it('shows each group’s progress and the courses standing in it', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    const row = groupRow('Mathematics courses')
    expect(within(row).getByText(/2 of 8/)).toBeTruthy()
    expect(within(row).getByText('math21b')).toBeTruthy()
    expect(within(row).getByText('6 more of 6 routes')).toBeTruthy()
    // A credited course is distinguishable from an assigned one, because the difference is
    // real arithmetic: it is one of these eight rather than a ninth.
    const credited = within(row).getByTitle(/counted here through a group this one contains/)
    expect(credited.textContent).toBe('math101')
  })

  it('names the slots that are not courses instead of pretending they are free', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    const row = groupRow('Expository paper')
    // A deliverable, an unspecified elective and a course the catalogue lacks all read the
    // same from here, so the screen reports rather than guesses.
    expect(within(row).getByText('not courses: math_expository_paper')).toBeTruthy()
    expect(within(row).getByText('1 more, 0 in the catalogue')).toBeTruthy()
  })

  it('carries the rules the requirement graph cannot express, verbatim', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    const row = groupRow('Mathematics courses')
    expect(
      within(row).getByText('At least four of the eight must be 100-level; the catalogue carries only two.'),
    ).toBeTruthy()
    expect(within(row).getByText('Math Ma + Mb count as one combined credit.')).toBeTruthy()
  })

  it('names the next course of a sequence, which is its whole account of prerequisites', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    expect(within(groupRow('Introductory sequence')).getByText('next: math1b')).toBeTruthy()
    expect(within(groupRow('Introductory sequence')).getByText('in order')).toBeTruthy()
  })

  it('marks an optional group as optional, because not writing a thesis is not failing', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    expect(within(groupRow('Senior thesis')).getByText('optional')).toBeTruthy()
  })

  it('says what the card is spending on nothing', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    expect(screen.getByText('Counts toward nothing here: expos20, ls1a.')).toBeTruthy()
  })

  it('warns about every track at risk — §9.2 calls this the point of the screen', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    const warnings = document.querySelector('.planner-warnings') as HTMLElement
    // The tight one and the closed one, each with the solver's own sentence — and the track
    // currently on screen is not exempt from being warned about.
    expect(within(warnings).getAllByRole('listitem')).toHaveLength(2)
    expect(within(warnings).getByText('Needs 30 more courses and 28 slots remain (7 terms × 4).')).toBeTruthy()
    expect(within(warnings).getByText('Needs 28 more of the 28 slots left; 0 spare.')).toBeTruthy()
  })

  it('offers the way into a course a demand gap has shut, and only when there is one', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    expect(screen.getByText('Closed this year')).toBeTruthy()
    const routes = document.querySelector('.route-list') as HTMLElement
    expect(within(routes).getAllByRole('listitem')).toHaveLength(1)
    expect(within(routes).getByText('math55a')).toBeTruthy()
    expect(within(routes).getByText('math is 5 below what it assumes')).toBeTruthy()
    expect(within(routes).getByText('asks less of math: mathma, math1a, math21a')).toBeTruthy()
    // math55b is shut with nothing cheaper in content. Listing it under "here is the way in"
    // would be a route that goes nowhere.
    expect(within(routes).queryByText('math55b')).toBeNull()
  })

  it('switches tracks from the rail', async () => {
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    await screen.findByRole('heading', { name: 'Mathematics' })
    await userEvent.click(screen.getByRole('button', { name: /Mind, Brain & Behavior/ }))
    expect(await screen.findByRole('heading', { name: 'CS — Mind, Brain & Behavior' })).toBeTruthy()
    // Eight wanted, six routes in the catalogue, three slots that are not courses. "7 more of
    // 6 remaining routes" is arithmetic the player is right to distrust, so it does not say it.
    expect(within(groupRow('CS core')).getByText('7 more, 6 in the catalogue')).toBeTruthy()
    expect(within(groupRow('CS core')).getByText(/not courses: cs91r, cs_elective_1, cs_elective_2/)).toBeTruthy()
  })

  it('says nothing has closed when nothing has, rather than leaving the panel blank', async () => {
    vi.stubGlobal('fetch', mockFetch({ plan: { ...PLAN, tracks: [MATH], blocked: [] } }))
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    expect(await screen.findByText(/Nothing has closed/)).toBeTruthy()
    expect(screen.queryByText('Closed this year')).toBeNull()
  })

  it('says there is no plan to make rather than drawing one, with no save', async () => {
    render(<PlannerScreen onBack={() => {}} gameId={null} />)
    expect(await screen.findByText(/No save yet, so there is no plan to make/)).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Concentrations' })).toBeNull()
  })

  it('reports the server’s reason when the save will not revalidate', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ status: 409, body: { problems: ['trait pack hash changed since this save'] } }),
    )
    render(<PlannerScreen onBack={() => {}} gameId="g1" />)
    // §9.3: report why. A content hash that moved under a save is not "something went wrong".
    expect(await screen.findByRole('alert')).toHaveTextContent('trait pack hash changed since this save')
  })

  it('goes back when asked', async () => {
    const onBack = vi.fn()
    render(<PlannerScreen onBack={onBack} gameId="g1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy())
    await userEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
