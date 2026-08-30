import { useState } from 'react'
import type { CharacterIdentity } from './CharacterGenerationScreen.tsx'
import { createRng, pickIndex } from './rng.ts'

type TimelineEntry = {
  id: string
  date: string
  title: string
  description: string
}

// The dates the user supplied verbatim. This is flavor and pacing, not a game mechanic —
// nothing here is read by the engine.
const ENTRIES: TimelineEntry[] = [
  {
    id: 'ed-ea-results',
    date: 'Mid-December',
    title: 'Early Decision / Early Action results',
    description:
      'The first outcome of the cycle, for anyone who applied on an early plan. For your ' +
      'character, the letter said yes.',
  },
  {
    id: 'rd-results',
    date: 'Mid-March \u2013 early April',
    title: 'Regular Decision results \u2014 "Ivy Day"',
    description:
      'Many top schools cluster around late March. Ivy Day specifically refers to the Ivy ' +
      'League schools traditionally releasing decisions the same afternoon, usually the last ' +
      'Thursday of March or in early April.',
  },
  {
    id: 'accepted-days',
    date: 'Late March \u2013 April',
    title: 'Accepted Students Days',
    description: 'Campus visit weekends that many schools host to woo their admits.',
  },
  {
    id: 'decision-day',
    date: 'May 1',
    title: 'National College Decision Day',
    description:
      'The deadline to commit and pay an enrollment deposit at most US colleges. Your ' +
      'character committed to Harvard.',
  },
  {
    id: 'ap-transcripts',
    date: 'May',
    title: 'AP exams & final transcripts',
    description: 'AP exams, if applicable, plus the college requesting your final high school transcript.',
  },
  {
    id: 'graduation',
    date: 'May \u2013 June',
    title: 'High school graduation',
    description: 'The last ceremony of one chapter, days before the paperwork for the next one starts.',
  },
  {
    id: 'housing',
    date: 'June \u2013 July',
    title: 'Housing questionnaire',
    description: 'A short questionnaire the college uses to match you with a dorm and a roommate.',
  },
]

// ── the housing questionnaire's tiny match algorithm ────────────────────────────────
// Four questions, two options each. Each answer nudges one axis of a small profile
// vector, and the dorm with the nearest profile wins. The roommate within that dorm's pool
// is drawn from the player's seed, so the same seed always reproduces the same roommate.

export type HousingAxis = 'schedule' | 'tidiness' | 'social' | 'focus'
export type HousingProfile = Record<HousingAxis, number>

export type HousingQuestion = {
  id: HousingAxis
  prompt: string
  options: [string, string]
}

export const HOUSING_QUESTIONS: HousingQuestion[] = [
  { id: 'schedule', prompt: 'When do you feel sharpest?', options: ['Early morning', 'Late at night'] },
  { id: 'tidiness', prompt: 'Your ideal room?', options: ['Tidy and quiet', 'Lived-in and relaxed'] },
  { id: 'social', prompt: 'Weekend plans?', options: ['Out with people', 'In with a book'] },
  { id: 'focus', prompt: 'How do you study?', options: ['Dead silence', 'Background noise or music'] },
]

type Dorm = {
  name: string
  profile: HousingProfile
  roommates: string[]
}

const DORMS: Dorm[] = [
  { name: 'Wigglesworth', profile: { schedule: 1, tidiness: 1, social: -1, focus: 1 }, roommates: ['Mira Chen', 'Ollie Park'] },
  { name: 'Matthews', profile: { schedule: -1, tidiness: -1, social: 1, focus: -1 }, roommates: ['Jamal Reyes', 'Théo Laurent'] },
  { name: 'Straus', profile: { schedule: 1, tidiness: -1, social: 0, focus: 1 }, roommates: ['Priya Nair', 'Sofia Marín'] },
  { name: 'Grays', profile: { schedule: -1, tidiness: 1, social: 1, focus: -1 }, roommates: ['Amara Boateng', 'Nikolai Petrov'] },
]

const distance = (a: HousingProfile, b: HousingProfile): number =>
  (['schedule', 'tidiness', 'social', 'focus'] as HousingAxis[]).reduce(
    (sum, axis) => sum + (a[axis] - b[axis]) ** 2,
    0,
  )

export function profileFromAnswers(answers: Record<HousingAxis, 0 | 1>): HousingProfile {
  return {
    schedule: answers.schedule === 0 ? 1 : -1,
    tidiness: answers.tidiness === 0 ? 1 : -1,
    social: answers.social === 0 ? 1 : -1,
    focus: answers.focus === 0 ? 1 : -1,
  }
}

export function matchHousing(
  answers: Record<HousingAxis, 0 | 1>,
  seed: string,
): { dorm: string; roommate: string } {
  const profile = profileFromAnswers(answers)
  const dorm = DORMS.reduce((best, d) => (distance(d.profile, profile) < distance(best.profile, profile) ? d : best))
  const rng = createRng(`${seed}:${dorm.name}`)
  return { dorm: dorm.name, roommate: dorm.roommates[pickIndex(rng, dorm.roommates.length)]! }
}

type AdmissionTimelineScreenProps = {
  identity: CharacterIdentity
  onBack: () => void
  onContinue: () => void
}

export function AdmissionTimelineScreen({ identity, onBack, onContinue }: AdmissionTimelineScreenProps) {
  const [step, setStep] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [housingOpen, setHousingOpen] = useState(false)
  const [housingAnswers, setHousingAnswers] = useState<Record<HousingAxis, 0 | 1>>({
    schedule: 0,
    tidiness: 0,
    social: 0,
    focus: 0,
  })
  const [housingResult, setHousingResult] = useState<{ dorm: string; roommate: string } | null>(null)

  const isLast = step === ENTRIES.length - 1

  const openActive = (id: string) => {
    if (id === 'housing') setHousingOpen(true)
    else setExpanded(true)
  }

  const saveAndContinue = () => {
    setExpanded(false)
    if (isLast) {
      onContinue()
      return
    }
    setStep((s) => s + 1)
  }

  const submitHousing = () => {
    setHousingResult(matchHousing(housingAnswers, identity.seed))
  }

  const finishHousing = () => {
    setHousingOpen(false)
    onContinue()
  }

  return (
    <main className="timeline-shell">
      <section className="timeline-page" aria-labelledby="timeline-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="timeline-heading">
          <h1 id="timeline-title">From the letter to the first lecture.</h1>
        </div>

        <ol className="timeline-list">
          {ENTRIES.map((entry, index) => {
            const state = index < step ? 'done' : index === step ? 'active' : 'locked'
            return (
              <li className={state} key={entry.id}>
                <button
                  type="button"
                  className="timeline-row"
                  disabled={state === 'locked'}
                  aria-expanded={state === 'active' ? expanded : undefined}
                  onClick={() => (state === 'active' ? openActive(entry.id) : undefined)}
                >
                  <span className="timeline-status" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
                  <span className="timeline-copy">
                    <span className="timeline-date">{entry.date}</span>
                    <span className="timeline-title">{entry.title}</span>
                  </span>
                </button>

                {state === 'active' && expanded && entry.id !== 'housing' ? (
                  <div className="timeline-expanded">
                    <p>{entry.description}</p>
                    <button type="button" className="continue-button" onClick={saveAndContinue}>
                      Save and continue
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      {housingOpen ? (
        <div className="timeline-backdrop">
          <div className="timeline-popup housing-popup" role="dialog" aria-modal="true" aria-labelledby="housing-title">
            <h2 id="housing-title">Housing questionnaire</h2>

            {!housingResult ? (
              <>
                {HOUSING_QUESTIONS.map((q) => (
                  <fieldset className="housing-question" key={q.id}>
                    <legend>{q.prompt}</legend>
                    {q.options.map((option, optionIndex) => (
                      <label key={option}>
                        <input
                          type="radio"
                          name={q.id}
                          checked={housingAnswers[q.id] === optionIndex}
                          onChange={() =>
                            setHousingAnswers((prev) => ({ ...prev, [q.id]: optionIndex as 0 | 1 }))
                          }
                        />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button type="button" className="continue-button" onClick={submitHousing}>
                  Submit
                </button>
              </>
            ) : (
              <div className="housing-result">
                <p>
                  You have been assigned to <strong>{housingResult.dorm}</strong>, rooming with{' '}
                  <strong>{housingResult.roommate}</strong>.
                </p>
                <button type="button" className="continue-button" onClick={finishHousing}>
                  Continue to course registration
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}
