import { useEffect, useState } from 'react'

type Gender = 'woman' | 'man'

const AVATARS_PER_GENDER = 4

const avatarSrc = (gender: Gender, index: number): string =>
  `/university-student-${gender === 'woman' ? 'female' : 'male'}-${index + 1}.png`

export function CharacterGenerationScreen({ onBack }: { onBack: () => void }) {
  const [gender, setGender] = useState<Gender>('woman')
  const [avatarIndex, setAvatarIndex] = useState(0)

  const chooseGender = (next: Gender) => {
    setGender(next)
    setAvatarIndex(0)
  }

  const cycleAvatar = (delta: number) =>
    setAvatarIndex((i) => (i + delta + AVATARS_PER_GENDER) % AVATARS_PER_GENDER)

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
          <form className="identity-form">
            <label htmlFor="character-name">
              <span>Character name</span>
              <input id="character-name" name="name" placeholder="Your name" autoComplete="name" />
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
                <input id="character-age" name="age" type="number" min="16" max="30" placeholder="18" aria-describedby="age-help" />
              </label>
              <small id="age-help">Most first-years are 18-20. An uncommon start deserves a reason later.</small>
            </div>

            <label htmlFor="character-country">
              <span>Home country</span>
              <input id="character-country" name="country" defaultValue="United States" autoComplete="country-name" />
            </label>

            <label htmlFor="character-city">
              <span>City and state</span>
              <input id="character-city" name="city" placeholder="Boston, Massachusetts" autoComplete="address-level2" />
            </label>

            <label htmlFor="character-school">
              <span>Secondary school</span>
              <input id="character-school" name="school" placeholder="Your school" />
            </label>

            <button className="continue-button" type="button">Continue <span aria-hidden="true">→</span></button>
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