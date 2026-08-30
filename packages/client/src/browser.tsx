import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './browser.css'
import { AdmissionTimelineScreen } from './AdmissionTimelineScreen.tsx'
import { CalendarScreen } from './CalendarScreen.tsx'
import { CharacterGenerationScreen, type CharacterIdentity } from './CharacterGenerationScreen.tsx'
import { CourseRegistrationScreen } from './CourseRegistrationScreen.tsx'
import { TraitSelectionScreen } from './TraitSelectionScreen.tsx'
import { WelcomeScreen } from './WelcomeScreen.tsx'

type View = 'welcome' | 'character' | 'traits' | 'calendar' | 'timeline' | 'courseRegistration'

const DEFAULT_IDENTITY: CharacterIdentity = {
  name: 'Pekka',
  gender: 'woman',
  age: '18',
  country: 'United States',
  city: 'Boston',
  state: 'Massachusetts',
  school: 'Boston High School',
  avatarIndex: 0,
  seed: 'harvard-dev-seed',
}

/** Dev scaffolding: `?screen=character`, `?screen=traits`, `?screen=calendar`,
 *  `?screen=timeline` or `?screen=courseRegistration` opens a screen directly with default
 *  data, so a screen under work doesn't require clicking through the ones before it. */
const requestedView = (): View => {
  const screen = new URLSearchParams(window.location.search).get('screen')
  return screen === 'character' ||
    screen === 'traits' ||
    screen === 'calendar' ||
    screen === 'timeline' ||
    screen === 'courseRegistration'
    ? screen
    : 'welcome'
}

function BrowserApp() {
  const [view, setView] = useState<View>(requestedView)
  const [identity, setIdentity] = useState<CharacterIdentity>(DEFAULT_IDENTITY)

  if (view === 'welcome') {
    return <WelcomeScreen onStartNewGame={() => setView('character')} />
  }

  if (view === 'character') {
    return (
      <CharacterGenerationScreen
        onBack={() => setView('welcome')}
        onContinue={(next) => {
          setIdentity(next)
          setView('traits')
        }}
      />
    )
  }

  if (view === 'calendar') {
    return <CalendarScreen onBack={() => setView('timeline')} />
  }

  if (view === 'courseRegistration') {
    return <CourseRegistrationScreen onBack={() => setView('timeline')} />
  }

  if (view === 'timeline') {
    return (
      <AdmissionTimelineScreen
        identity={identity}
        onBack={() => setView('traits')}
        onContinue={() => setView('courseRegistration')}
      />
    )
  }

  return <TraitSelectionScreen
    identity={identity}
    onBack={() => setView('character')}
    onSaveAndStart={() => setView('timeline')}
  />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserApp />
  </StrictMode>,
)