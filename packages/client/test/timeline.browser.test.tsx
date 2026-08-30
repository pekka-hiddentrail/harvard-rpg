import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  AdmissionTimelineScreen,
  HOUSING_QUESTIONS,
  matchHousing,
} from '../src/AdmissionTimelineScreen.tsx'
import type { CharacterIdentity } from '../src/CharacterGenerationScreen.tsx'

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

const allFirstOption: Record<string, number> = Object.fromEntries(HOUSING_QUESTIONS.map((q) => [q.id, 0]))
const allSecondOption: Record<string, number> = Object.fromEntries(HOUSING_QUESTIONS.map((q) => [q.id, 1]))

describe('matchHousing', () => {
  it('is deterministic: the same seed and answers always match the same dorm and roommate', () => {
    expect(matchHousing(allFirstOption, 'seed-a')).toEqual(matchHousing(allFirstOption, 'seed-a'))
  })

  it('matches opposite answer sets to different dorms', () => {
    expect(matchHousing(allFirstOption, 'seed-a').dorm).not.toEqual(matchHousing(allSecondOption, 'seed-a').dorm)
  })

  it('can pick a different roommate for the same answers under a different seed', () => {
    const roommates = new Set(
      ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e'].map((seed) => matchHousing(allFirstOption, seed).roommate),
    )
    expect(roommates.size).toBeGreaterThan(1)
  })

  it('ignores flavor-only answers (interests, hobbies, bathroom) when matching a dorm', () => {
    const changedFlavorOnly = {
      ...allFirstOption,
      'academic-interest': 3,
      hobbies: 4,
      'music-taste': 2,
      bathroom: 1,
      'self-description': 3,
      'roommate-priority': 4,
    }
    expect(matchHousing(changedFlavorOnly, 'seed-a').dorm).toEqual(matchHousing(allFirstOption, 'seed-a').dorm)
  })
})

describe('admission timeline screen', () => {
  it('shows no student-name heading, only the milestone title', () => {
    render(<AdmissionTimelineScreen identity={identity} onBack={() => {}} onContinue={() => {}} />)

    expect(screen.queryByText('Pekka')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'From the letter to the first lecture.' })).toBeVisible()
  })

  it('only unlocks the first item; every later item is disabled', () => {
    render(<AdmissionTimelineScreen identity={identity} onBack={() => {}} onContinue={() => {}} />)

    expect(screen.getByRole('button', { name: /Early Decision/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Regular Decision/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Housing questionnaire/i })).toBeDisabled()
  })

  it('expands the active item inline on click and advances after Save and continue', async () => {
    const user = userEvent.setup()
    render(<AdmissionTimelineScreen identity={identity} onBack={() => {}} onContinue={() => {}} />)

    await user.click(screen.getByRole('button', { name: /Early Decision/i }))
    expect(screen.getByText(/the letter said yes/i)).toBeVisible()

    await user.click(screen.getByRole('button', { name: /save and continue/i }))

    const firstRow = screen.getByRole('button', { name: /Early Decision/i })
    expect(firstRow.closest('li')).toHaveClass('done')
    expect(screen.getByRole('button', { name: /Regular Decision/i })).toBeEnabled()
  })

  it('leaves without saving via the back button', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<AdmissionTimelineScreen identity={identity} onBack={onBack} onContinue={() => {}} />)

    await user.click(screen.getByRole('button', { name: '← Back' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('opens the housing questionnaire as a popup instead of inline text, once it is the active step', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(<AdmissionTimelineScreen identity={identity} onBack={() => {}} onContinue={onContinue} />)

    for (const label of [/Early Decision/i, /Regular Decision/i, /Accepted Students/i, /National College/i, /AP exams/i, /graduation/i]) {
      await user.click(screen.getByRole('button', { name: label }))
      await user.click(screen.getByRole('button', { name: /save and continue/i }))
    }

    await user.click(screen.getByRole('button', { name: /Housing questionnaire/i }))

    const dialog = screen.getByRole('dialog', { name: 'Housing questionnaire' })
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(HOUSING_QUESTIONS.length)

    await user.click(within(dialog).getByRole('button', { name: /submit/i }))
    expect(within(dialog).getByText(/you have been assigned to/i)).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: /continue to course registration/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
