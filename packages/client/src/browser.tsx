import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './browser.css'
import { CharacterGenerationScreen } from './CharacterGenerationScreen.tsx'
import { WelcomeScreen } from './WelcomeScreen.tsx'

type View = 'welcome' | 'character'

/** Dev scaffolding: `?screen=character` opens a screen directly with default data,
 *  so a screen under work doesn't require clicking through the ones before it. */
const requestedView = (): View => {
  const screen = new URLSearchParams(window.location.search).get('screen')
  return screen === 'character' ? 'character' : 'welcome'
}

function BrowserApp() {
  const [view, setView] = useState<View>(requestedView)

  return view === 'welcome'
    ? <WelcomeScreen onStartNewGame={() => setView('character')} />
    : <CharacterGenerationScreen onBack={() => setView('welcome')} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserApp />
  </StrictMode>,
)