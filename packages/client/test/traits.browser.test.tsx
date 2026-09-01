import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterIdentity } from '../src/CharacterGenerationScreen.tsx'
import { TraitSelectionScreen } from '../src/TraitSelectionScreen.tsx'

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

const OPTIONS = {
  contentHash: 'test-hash',
  budget: 10,
  refundCap: 5,
  subjectTags: [
    'math', 'stats', 'code', 'writing', 'reading', 'lab', 'discussion',
    'proof', 'visual', 'language', 'fieldwork', 'memorization', 'ethics',
  ],
  traits: [
    {
      id: 'international_student',
      name: 'INTERNATIONAL STUDENT',
      blurb: 'You did not grow up here.',
      cost: 3,
      kinds: ['international'],
      affects: {},
      excludes: [],
      requiresAnyOf: [],
      requiresOneOf: ['nordic', 'anglophone'],
      grantsLanguageFrom: [],
      contagious: false,
      structural: true,
      why: 'Only part of this is a level.',
      derivedCost: null,
    },
    {
      id: 'nordic',
      name: 'NORDIC',
      blurb: 'Long winters and a rare language.',
      cost: -3,
      kinds: ['multilingual', 'international'],
      affects: {},
      excludes: [],
      requiresAnyOf: [],
      requiresOneOf: [],
      grantsLanguageFrom: ['Finnish', 'Swedish'],
      contagious: false,
      structural: true,
      why: 'Grants a rare language.',
      derivedCost: null,
    },
    {
      id: 'long_mathematics',
      name: 'LONG MATHEMATICS',
      blurb: 'You took the harder syllabus.',
      cost: -3,
      kinds: [],
      affects: { math: 2, stats: 1 },
      excludes: ['bad_with_numbers'],
      requiresAnyOf: [],
      requiresOneOf: [],
      grantsLanguageFrom: [],
      contagious: false,
      structural: false,
      why: null,
      derivedCost: -3,
    },
    {
      id: 'bad_with_numbers',
      name: 'BAD WITH NUMBERS',
      blurb: 'Arithmetic was always someone else\u2019s talent.',
      cost: 2,
      kinds: [],
      affects: { math: -2, stats: -1 },
      excludes: ['long_mathematics'],
      requiresAnyOf: [],
      requiresOneOf: [],
      grantsLanguageFrom: [],
      contagious: false,
      structural: false,
      why: null,
      derivedCost: 2,
    },
  ],
}

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/creation/options')) {
      return Promise.resolve(new Response(JSON.stringify(OPTIONS)))
    }
    if (url.endsWith('/api/creation/validate')) {
      const body = JSON.parse(String(init?.body)) as { traits: { id: string }[] }
      const ids = body.traits.map((t) => t.id)
      if (ids.includes('long_mathematics') && !ids.includes('bad_with_numbers')) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, spent: 3, refunded: 0, levels: { math: 2, stats: 1 } })),
        )
      }
      // Real server behaviour: spent/refunded/levels ride along even when ok is false, so a
      // live-editing screen has real numbers before the budget is exactly balanced.
      // Approved here, refused on write below — the one case the 422 path exists for, where
      // the screen's validation and the engine's have drifted apart.
      if (ids.includes('international_student') && ids.includes('nordic')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, spent: 3, refunded: 3, levels: {} })))
      }
      if (ids.includes('bad_with_numbers') && !ids.includes('long_mathematics')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: false,
              problems: [{ code: 'budget', message: '10 points unspent.' }],
              spent: 0,
              refunded: 2,
              levels: { math: -2, stats: -1 },
            }),
          ),
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: false,
            problems: [{ code: 'budget', message: 'must spend the budget exactly' }],
            spent: 0,
            refunded: 0,
            levels: {},
          }),
        ),
      )
    }
    if (url.endsWith('/api/game/new')) {
      const body = JSON.parse(String(init?.body)) as { traits: { id: string }[] }
      // Mirrors the server: the build is validated *again* on write, so one the screen
      // thought was fine can still come back 422.
      if (body.traits.some((t) => t.id === 'international_student')) {
        return Promise.resolve(
          new Response(JSON.stringify({ problems: [{ code: 'content', message: 'The trait pool changed under you.' }] }), {
            status: 422,
          }),
        )
      }
      return Promise.resolve(new Response(JSON.stringify({ gameId: 'save-1' }), { status: 201 }))
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`))
  })
}

describe('trait selection screen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches and lists the real trait pool, showing the player\u2019s name', async () => {
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} />)

    expect(await screen.findByRole('heading', { name: 'Traits and abilities' })).toBeVisible()
    expect(screen.getByText('Pekka')).toBeVisible()
    expect(screen.getByRole('button', { name: /LONG MATHEMATICS/i })).toBeVisible()
  })
  it('updates spent points and ability scores on every choice, before the budget balances', async () => {
    const user = userEvent.setup()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })
    await user.click(screen.getByRole('button', { name: /BAD WITH NUMBERS/i }))

    await waitFor(() => expect(screen.getByText('12 points left \u00b7 spent 0 / 10')).toBeVisible())
    const abilityScores = screen.getByRole('heading', { name: 'Ability scores' }).nextElementSibling!
    expect(within(abilityScores as HTMLElement).getByText('-2')).toBeVisible()
    expect(within(abilityScores as HTMLElement).getByText('-1')).toBeVisible()
  })
  it('greys out a mandatory-child trait until its parent is picked', async () => {
    const user = userEvent.setup()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })

    const nordic = screen.getByRole('button', { name: /NORDIC/i })
    expect(nordic).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /INTERNATIONAL STUDENT/i }))

    expect(nordic).toBeEnabled()
  })

  it('greys out an excluded trait once its opposite is picked', async () => {
    const user = userEvent.setup()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })

    await user.click(screen.getByRole('button', { name: /LONG MATHEMATICS/i }))

    expect(screen.getByRole('button', { name: /BAD WITH NUMBERS/i })).toBeDisabled()
  })

  it('shows the focused trait\u2019s description, requirements and exclusions', async () => {
    const user = userEvent.setup()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })
    await user.click(screen.getByRole('button', { name: /LONG MATHEMATICS/i }))

    expect(screen.getByText('You took the harder syllabus.')).toBeVisible()
    expect(screen.getByText(/closes: BAD WITH NUMBERS/i)).toBeVisible()
  })

  it('reflects server-validated levels in ability scores and enables Save once ok', async () => {
    const user = userEvent.setup()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })
    await user.click(screen.getByRole('button', { name: /LONG MATHEMATICS/i }))

    const saveButton = await screen.findByRole('button', { name: /save and start game/i })
    await waitFor(() => expect(saveButton).toBeEnabled())

    const abilityScores = screen.getByRole('heading', { name: 'Ability scores' }).nextElementSibling!
    expect(within(abilityScores as HTMLElement).getByText('+2')).toBeVisible()
  })

  it('writes the save and hands the game id up, since a term is enrolled into a save', async () => {
    const user = userEvent.setup()
    const onSaveAndStart = vi.fn()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} onSaveAndStart={onSaveAndStart} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })
    await user.click(screen.getByRole('button', { name: /LONG MATHEMATICS/i }))

    const saveButton = await screen.findByRole('button', { name: /save and start game/i })
    await waitFor(() => expect(saveButton).toBeEnabled())
    await user.click(saveButton)

    await waitFor(() => expect(onSaveAndStart).toHaveBeenCalledWith('save-1'))
  })

  it('shows the server’s refusal and does not navigate when the save is rejected', async () => {
    const user = userEvent.setup()
    const onSaveAndStart = vi.fn()
    render(<TraitSelectionScreen identity={identity} onBack={() => {}} onSaveAndStart={onSaveAndStart} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })
    // A build `/validate` approves and `/game/new` refuses — the disagreement the 422 path
    // exists for. Without it the screen would navigate to a save that was never written.
    await user.click(screen.getByRole('button', { name: /INTERNATIONAL STUDENT/i }))
    await user.click(screen.getByRole('button', { name: /NORDIC/i }))

    const saveButton = await screen.findByRole('button', { name: /save and start game/i })
    await waitFor(() => expect(saveButton).toBeEnabled())
    await user.click(saveButton)

    expect(await screen.findByText('The trait pool changed under you.')).toBeVisible()
    expect(onSaveAndStart).not.toHaveBeenCalled()
  })

  it('leaves the trait screen without saving via Back', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<TraitSelectionScreen identity={identity} onBack={onBack} />)

    await screen.findByRole('heading', { name: 'Traits and abilities' })
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
