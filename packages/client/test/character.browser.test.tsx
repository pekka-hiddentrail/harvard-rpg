import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CharacterGenerationScreen } from '../src/CharacterGenerationScreen.tsx'

describe('character generation screen', () => {
  it('shows identity and background fields without trait selection', () => {
    render(<CharacterGenerationScreen onBack={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Meet your student.' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Character name' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Home country' })).toHaveValue('United States')
    expect(screen.queryByText(/trait/i)).not.toBeInTheDocument()
  })

  it('changes the portrait when a different gender is selected', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Man' }))

    const portrait = screen.getByRole('img', { name: /portrait of a man student/i })
    expect(portrait).toBeVisible()
    expect(portrait).toHaveAttribute('src', '/university-student-male-1.png')
    expect(screen.getByRole('button', { name: 'Man' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('cycles avatars within a gender using the arrow controls', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Next avatar' }))

    expect(screen.getByRole('img', { name: /option 2 of 4/i })).toHaveAttribute(
      'src',
      '/university-student-female-2.png',
    )

    await user.click(screen.getByRole('button', { name: 'Previous avatar' }))

    expect(screen.getByRole('img', { name: /option 1 of 4/i })).toHaveAttribute(
      'src',
      '/university-student-female-1.png',
    )
  })

  it('resets to the first avatar when gender changes', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Next avatar' }))
    await user.click(screen.getByRole('button', { name: 'Man' }))

    expect(screen.getByRole('img', { name: /option 1 of 4/i })).toHaveAttribute(
      'src',
      '/university-student-male-1.png',
    )
  })

  it('cycles avatars with the left and right arrow keys', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} />)

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: /option 2 of 4/i })).toBeVisible()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('img', { name: /option 1 of 4/i })).toBeVisible()
  })
})