import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './browser.css'
import { CalendarScreen } from './CalendarScreen.tsx'
import { CharacterGenerationScreen, type CharacterIdentity } from './CharacterGenerationScreen.tsx'
import { TraitSelectionScreen } from './TraitSelectionScreen.tsx'
import { WelcomeScreen } from './WelcomeScreen.tsx'

type View = 'welcome' | 'character' | 'traits' | 'calendar'

const DEFAULT_IDENTITY: CharacterIdentity = {
  name: 'Pekka',
  gender: 'woman',
  age: '18',
  country: 'United States',
  city: 'Boston',
  state: 'Massachusetts',
  school: 'Boston High School',
  avatarIndex: 0,
}

/** Dev scaffolding: `?screen=character`, `?screen=traits` or `?screen=calendar` opens a
 *  screen directly with default data, so a screen under work doesn't require clicking
 *  through the ones before it. */
const requestedView = (): View => {
  const screen = new URLSearchParams(window.location.search).get('screen')
  return screen === 'character' || screen === 'traits' || screen === 'calendar' ? screen : 'welcome'
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
    return <CalendarScreen onBack={() => setView('traits')} />
  }

  return <TraitSelectionScreen
    identity={identity}
    onBack={() => setView('character')}
    onSaveAndStart={() => setView('calendar')}
  />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserApp />
  </StrictMode>,
)