import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
    expect(within(menu).getAllByRole('article')).toHaveLength(2)
    expect(within(menu).getByRole('heading', { name: 'Start new game' })).toBeVisible()
    expect(within(menu).getByRole('heading', { name: 'Load a game' })).toBeVisible()
  })

  it('places credits and settings in the secondary navigation', () => {
    render(<WelcomeScreen onStartNewGame={() => {}} />)

    const secondaryMenu = screen.getByRole('navigation', { name: 'Additional options' })
    expect(within(secondaryMenu).getByRole('button', { name: /credits/i })).toBeVisible()
    expect(within(secondaryMenu).getByRole('button', { name: /settings/i })).toBeVisible()
  })
})