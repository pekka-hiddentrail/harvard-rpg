import { useEffect, useState, type FormEvent } from 'react'

export type Gender = 'woman' | 'man'

export type CharacterIdentity = {
  name: string
  gender: Gender
  age: string
  country: string
  city: string
  state: string
  school: string
  avatarIndex: number
}

const AVATARS_PER_GENDER = 4

const avatarSrc = (gender: Gender, index: number): string =>
  `/university-student-${gender === 'woman' ? 'female' : 'male'}-${index + 1}.png`

type CharacterGenerationScreenProps = {
  onBack: () => void
  onContinue: (identity: CharacterIdentity) => void
}

export function CharacterGenerationScreen({ onBack, onContinue }: CharacterGenerationScreenProps) {
  const [gender, setGender] = useState<Gender>('woman')
  const [avatarIndex, setAvatarIndex] = useState(0)

  const chooseGender = (next: Gender) => {
    setGender(next)
    setAvatarIndex(0)
  }

  const cycleAvatar = (delta: number) =>
    setAvatarIndex((i) => (i + delta + AVATARS_PER_GENDER) % AVATARS_PER_GENDER)

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    onContinue({
      name: String(data.get('name')),
      gender,
      age: String(data.get('age')),
      country: String(data.get('country')),
      city: String(data.get('city')),
      state: String(data.get('state')),
      school: String(data.get('school')),
      avatarIndex,
    })
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') cycleAvatar(-1)
      if (e.key === 'ArrowRight') cycleAvatar(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className="character-shell">
      <section className="character" aria-labelledby="character-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="character-heading">
          <p className="kicker">New game · Step 1 of 2</p>
          <h1 id="character-title">Meet your student.</h1>
          <p>Start with the facts that follow them through every semester.</p>
        </div>

        <div className="character-layout">
          <form className="identity-form" onSubmit={handleSubmit}>
            <label htmlFor="character-name">
              <span>Character name</span>
              <input id="character-name" name="name" placeholder="Your name" autoComplete="name" required />
            </label>

            <fieldset>
              <legend>Gender</legend>
              <div className="gender-choice">
                <button
                  className={gender === 'woman' ? 'selected' : ''}
                  type="button"
                  aria-pressed={gender === 'woman'}
                  onClick={() => chooseGender('woman')}
                >
                  Woman
                </button>
                <button
                  className={gender === 'man' ? 'selected' : ''}
                  type="button"
                  aria-pressed={gender === 'man'}
                  onClick={() => chooseGender('man')}
                >
                  Man
                </button>
              </div>
            </fieldset>

            <div className="field">
              <label htmlFor="character-age">
                <span>Age</span>
                <input id="character-age" name="age" type="number" min="16" max="30" defaultValue="18" aria-describedby="age-help" required />
              </label>
              <small id="age-help">Most first-years are 18-20. An uncommon start deserves a reason later.</small>
            </div>

            <label htmlFor="character-country">
              <span>Home country</span>
              <input id="character-country" name="country" defaultValue="United States" autoComplete="country-name" required />
            </label>

            <label htmlFor="character-city">
              <span>City</span>
              <input id="character-city" name="city" defaultValue="Boston" autoComplete="address-level2" required />
            </label>

            <label htmlFor="character-state">
              <span>State</span>
              <input id="character-state" name="state" defaultValue="Massachusetts" autoComplete="address-level1" required />
            </label>

            <label htmlFor="character-school">
              <span>Secondary school</span>
              <input id="character-school" name="school" defaultValue="Boston High School" required />
            </label>

            <button className="continue-button" type="submit">Continue <span aria-hidden="true">→</span></button>
          </form>

          <aside className="portrait-panel" aria-label="Student portrait preview">
            <div className="avatar-picker">
              <button
                type="button"
                aria-label="Previous avatar"
                onClick={() => cycleAvatar(-1)}
              >
                ‹
              </button>
              <img
                src={avatarSrc(gender, avatarIndex)}
                alt={`Portrait of a ${gender} student, option ${avatarIndex + 1} of ${AVATARS_PER_GENDER}`}
              />
              <button
                type="button"
                aria-label="Next avatar"
                onClick={() => cycleAvatar(1)}
              >
                ›
              </button>
            </div>
            <div className="portrait-caption">
              <span>First-year profile · {avatarIndex + 1} of {AVATARS_PER_GENDER}</span>
              <strong>{gender === 'woman' ? 'She arrives in Cambridge.' : 'He arrives in Cambridge.'}</strong>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}