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
    date: 'May',
    title: 'Housing questionnaire',
    description:
      'Due in May, the summer before you arrive. Assignments come out late July or early ' +
      'August, once Resident Deans have matched everyone up.',
  },
]

// ── the housing questionnaire's tiny match algorithm ────────────────────────────────
// Harvard's own line: this informs a match, it does not grant a request — nobody gets to
// pick their dorm, room type or roommate. So only the ordinal lifestyle questions (the ones
// with a natural "more of this ↔ less of this" order) feed the dorm/roommate pick; interests,
// hobbies and the two self-description questions are collected but are flavor, not signal —
// same as the bathroom question, which the source material calls informational, not matched.
// The roommate within the matched dorm's pool is drawn from the player's seed, so the same
// seed and answers always reproduce the same result.

export type HousingAxis = 'schedule' | 'tidiness' | 'noise' | 'social' | 'guests' | 'privacy'
export type HousingProfile = Record<HousingAxis, number>

type ScoredQuestion = {
  id: string
  section: string
  prompt: string
  options: string[]
  axis: HousingAxis
}

type FlavorQuestion = {
  id: string
  section: string
  prompt: string
  options: string[]
  axis?: undefined
}

export type HousingQuestion = ScoredQuestion | FlavorQuestion

// A 2-option question scores +1/−1; a 3-option question scores +1/0/−1. The first option is
// always the "more schedule/tidy/quiet/private" end of the axis.
const scoreOf = (question: ScoredQuestion, optionIndex: number): number =>
  question.options.length === 2 ? (optionIndex === 0 ? 1 : -1) : 1 - optionIndex

export const HOUSING_QUESTIONS: HousingQuestion[] = [
  {
    id: 'sleep-schedule',
    section: 'Personal habits & lifestyle',
    prompt: 'Typical sleep schedule',
    options: ['Early riser', 'Somewhere in between', 'Night owl'],
    axis: 'schedule',
  },
  {
    id: 'smoking',
    section: 'Personal habits & lifestyle',
    prompt: 'Smoking habits',
    options: ['Non-smoker', 'Occasional smoker', 'Regular smoker'],
  },
  {
    id: 'cleanliness',
    section: 'Personal habits & lifestyle',
    prompt: 'Cleanliness / neatness level',
    options: ['Very tidy', 'Moderately tidy', 'Relaxed — lived-in'],
    axis: 'tidiness',
  },
  {
    id: 'noise-tolerance',
    section: 'Personal habits & lifestyle',
    prompt: 'Noise tolerance while studying',
    options: ['I need silence', 'Some background noise is fine', 'Music or TV on is normal for me'],
    axis: 'noise',
  },
  {
    id: 'guest-policy',
    section: 'Personal habits & lifestyle',
    prompt: 'Guest policy comfort',
    options: ['Rarely have guests over', 'Occasional guests', 'Frequent or overnight guests are fine'],
    axis: 'guests',
  },
  {
    id: 'dorm-social-level',
    section: 'Social preferences',
    prompt: 'How social do you want your dorm environment?',
    options: ['Quiet and low-key', 'Balanced', 'Social and lively'],
    axis: 'social',
  },
  {
    id: 'room-size',
    section: 'Social preferences',
    prompt: 'Preferred rooming group size',
    options: ['Single', 'Double', 'Suite (3+ roommates)'],
  },
  {
    id: 'privacy',
    section: 'Social preferences',
    prompt: 'Sharing a bedroom vs. privacy',
    options: ['Comfortable sharing a bedroom', 'Prefer more privacy'],
    axis: 'privacy',
  },
  {
    id: 'academic-interest',
    section: 'Interests',
    prompt: 'Academic interests / intended area of study',
    options: ['Humanities', 'Social Sciences', 'STEM', 'Arts', 'Undecided'],
  },
  {
    id: 'extracurricular',
    section: 'Interests',
    prompt: 'Extracurricular interests',
    options: ['Athletics', 'Performing arts', 'Community service', 'Student government or publications', 'Not sure yet'],
  },
  {
    id: 'music-taste',
    section: 'Interests',
    prompt: 'Music taste',
    options: ['Pop', 'Rock or alternative', 'Hip-hop or R&B', 'Classical or jazz', 'Eclectic — no strong preference'],
  },
  {
    id: 'hobbies',
    section: 'Interests',
    prompt: 'Hobbies',
    options: ['Gaming', 'Reading and writing', 'Sports and outdoors', 'Cooking and food', 'Arts and crafts'],
  },
  {
    id: 'self-description',
    section: 'About you',
    prompt: 'How would you describe yourself?',
    options: ['Introverted homebody', 'Social butterfly', 'Focused and driven', 'Laid-back and easygoing', 'A mix of all of the above'],
  },
  {
    id: 'roommate-priority',
    section: 'About you',
    prompt: 'What matters most to you in a roommate?',
    options: ['Respect for quiet/study time', 'Similar social energy', 'Cleanliness compatibility', 'Being easygoing about most things', 'Shared interests'],
  },
  {
    id: 'bathroom',
    section: 'Logistics',
    prompt: 'Bathroom preference',
    options: ['En-suite (not guaranteed)', 'Shared bathroom is fine', 'No strong preference'],
  },
]

const SCORED_QUESTIONS = HOUSING_QUESTIONS.filter((q): q is ScoredQuestion => q.axis !== undefined)

type Dorm = {
  name: string
  profile: HousingProfile
  roommates: string[]
}

const DORMS: Dorm[] = [
  {
    name: 'Wigglesworth',
    profile: { schedule: 1, tidiness: 1, noise: 1, social: -1, guests: -1, privacy: 1 },
    roommates: ['Mira Chen', 'Ollie Park'],
  },
  {
    name: 'Matthews',
    profile: { schedule: -1, tidiness: -1, noise: -1, social: 1, guests: 1, privacy: -1 },
    roommates: ['Jamal Reyes', 'Théo Laurent'],
  },
  {
    name: 'Straus',
    profile: { schedule: 1, tidiness: -1, noise: 1, social: 0, guests: 0, privacy: -1 },
    roommates: ['Priya Nair', 'Sofia Marín'],
  },
  {
    name: 'Grays',
    profile: { schedule: -1, tidiness: 1, noise: -1, social: 1, guests: 1, privacy: 1 },
    roommates: ['Amara Boateng', 'Nikolai Petrov'],
  },
]

const AXES: HousingAxis[] = ['schedule', 'tidiness', 'noise', 'social', 'guests', 'privacy']

const distance = (a: HousingProfile, b: HousingProfile): number =>
  AXES.reduce((sum, axis) => sum + (a[axis] - b[axis]) ** 2, 0)

export function profileFromAnswers(answers: Record<string, number>): HousingProfile {
  const profile = { schedule: 0, tidiness: 0, noise: 0, social: 0, guests: 0, privacy: 0 } as HousingProfile
  for (const q of SCORED_QUESTIONS) {
    profile[q.axis] = scoreOf(q, answers[q.id] ?? 0)
  }
  return profile
}

export function matchHousing(
  answers: Record<string, number>,
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

const SECTIONS = [...new Set(HOUSING_QUESTIONS.map((q) => q.section))]

export function AdmissionTimelineScreen({ identity, onBack, onContinue }: AdmissionTimelineScreenProps) {
  const [step, setStep] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [housingOpen, setHousingOpen] = useState(false)
  const [housingAnswers, setHousingAnswers] = useState<Record<string, number>>(
    Object.fromEntries(HOUSING_QUESTIONS.map((q) => [q.id, 0])),
  )
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
                <p className="housing-caveat">
                  Harvard cannot honor requests for a specific dorm, room type or roommate —
                  Resident Deans use these answers to inform a match, not to grant one.
                </p>

                {SECTIONS.map((section) => (
                  <div className="housing-section" key={section}>
                    <h3>{section}</h3>
                    {HOUSING_QUESTIONS.filter((q) => q.section === section).map((q) => (
                      <label className="housing-question" htmlFor={`housing-${q.id}`} key={q.id}>
                        <span>{q.prompt}</span>
                        <select
                          id={`housing-${q.id}`}
                          value={housingAnswers[q.id]}
                          onChange={(e) =>
                            setHousingAnswers((prev) => ({ ...prev, [q.id]: Number(e.target.value) }))
                          }
                        >
                          {q.options.map((option, optionIndex) => (
                            <option key={option} value={optionIndex}>{option}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
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
