import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CharacterGenerationScreen } from '../src/CharacterGenerationScreen.tsx'

describe('character generation screen', () => {
  it('leaves without saving via the back button', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<CharacterGenerationScreen onBack={onBack} onContinue={() => {}} />)

    await user.click(screen.getByRole('button', { name: '← Back' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows identity and background fields without trait selection', () => {
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Meet your student.' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Character name' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Home country' })).toHaveValue('United States')
    expect(screen.queryByText(/trait/i)).not.toBeInTheDocument()
  })

  it('defaults the secondary school to Boston High School', () => {
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    expect(screen.getByRole('textbox', { name: 'Secondary school' })).toHaveValue('Boston High School')
  })

  it('defaults the age to 18', () => {
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(18)
  })

  it('defaults the city and state to separate fields', () => {
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    expect(screen.getByRole('textbox', { name: 'City' })).toHaveValue('Boston')
    expect(screen.getByRole('textbox', { name: 'State' })).toHaveValue('Massachusetts')
  })

  it('marks every identity field as required', () => {
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    expect(screen.getByRole('textbox', { name: 'Character name' })).toBeRequired()
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'Home country' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'City' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'State' })).toBeRequired()
    expect(screen.getByRole('textbox', { name: 'Secondary school' })).toBeRequired()
  })

  it('blocks continuing until every field is filled in', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={onContinue} />)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onContinue).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Character name' })).toBeInvalid()
  })

  it('continues with the collected identity once every field is filled in', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={onContinue} />)

    await user.type(screen.getByRole('textbox', { name: 'Character name' }), 'Pekka')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onContinue).toHaveBeenCalledWith({
      name: 'Pekka',
      gender: 'woman',
      age: '18',
      country: 'United States',
      city: 'Boston',
      state: 'Massachusetts',
      school: 'Boston High School',
      avatarIndex: 0,
    })
  })

  it('changes the portrait when a different gender is selected', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Man' }))

    const portrait = screen.getByRole('img', { name: /portrait of a man student/i })
    expect(portrait).toBeVisible()
    expect(portrait).toHaveAttribute('src', '/university-student-male-1.png')
    expect(screen.getByRole('button', { name: 'Man' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('cycles avatars within a gender using the arrow controls', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

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
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Next avatar' }))
    await user.click(screen.getByRole('button', { name: 'Man' }))

    expect(screen.getByRole('img', { name: /option 1 of 4/i })).toHaveAttribute(
      'src',
      '/university-student-male-1.png',
    )
  })

  it('cycles avatars with the left and right arrow keys', async () => {
    const user = userEvent.setup()
    render(<CharacterGenerationScreen onBack={() => {}} onContinue={() => {}} />)

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: /option 2 of 4/i })).toBeVisible()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('img', { name: /option 1 of 4/i })).toBeVisible()
  })
})