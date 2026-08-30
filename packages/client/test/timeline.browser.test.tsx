import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  AdmissionTimelineScreen,
  HOUSING_QUESTIONS,
  matchHousing,
  type HousingAxis,
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

const allFirstOption: Record<HousingAxis, 0 | 1> = { schedule: 0, tidiness: 0, social: 0, focus: 0 }
const allSecondOption: Record<HousingAxis, 0 | 1> = { schedule: 1, tidiness: 1, social: 1, focus: 1 }

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
    expect(within(dialog).getAllByRole('group')).toHaveLength(HOUSING_QUESTIONS.length)

    await user.click(within(dialog).getByRole('button', { name: /submit/i }))
    expect(within(dialog).getByText(/you have been assigned to/i)).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: /continue to course registration/i }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
