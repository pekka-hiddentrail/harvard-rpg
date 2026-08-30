import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from '../src/WelcomeScreen.tsx'

describe('welcome screen', () => {
  it('uses the supplied Harvard crest in the masthead', () => {
    render(<WelcomeScreen onStartNewGame={() => {}} />)

    const crest = screen.getByRole('img', { name: 'Harvard University crest' })
    expect(crest).toHaveAttribute('src', '/harvard-logo.png')
    expect(screen.getByText('HARVARD')).toBeVisible()
  })

  it('keeps only the two game paths as primary menu cards', () => {
    render(<WelcomeScreen onStartNewGame={() => {}} />)

    const menu = screen.getByRole('navigation', { name: 'Game menu' })
    expect(within(menu).getAllByRole('button')).toHaveLength(2)
    expect(within(menu).getByRole('heading', { name: 'Start new game' })).toBeVisible()
    expect(within(menu).getByRole('heading', { name: 'Load a game' })).toBeVisible()
  })

  it('starts a new game when clicking anywhere in its card, not just the label', async () => {
    const user = userEvent.setup()
    const onStartNewGame = vi.fn()
    render(<WelcomeScreen onStartNewGame={onStartNewGame} />)

    await user.click(screen.getByText('Build a student and begin the first semester.'))

    expect(onStartNewGame).toHaveBeenCalledTimes(1)
  })

  it('opens saves when clicking anywhere in the load-game card', async () => {
    const user = userEvent.setup()
    const onLoadGame = vi.fn()
    render(<WelcomeScreen onStartNewGame={() => {}} onLoadGame={onLoadGame} />)

    await user.click(screen.getByText('Return to a saved term, day, and set of consequences.'))

    expect(onLoadGame).toHaveBeenCalledTimes(1)
  })

  it('places credits and settings in the secondary navigation', () => {
    render(<WelcomeScreen onStartNewGame={() => {}} />)

    const secondaryMenu = screen.getByRole('navigation', { name: 'Additional options' })
    expect(within(secondaryMenu).getByRole('button', { name: /credits/i })).toBeVisible()
    expect(within(secondaryMenu).getByRole('button', { name: /settings/i })).toBeVisible()
  })
})