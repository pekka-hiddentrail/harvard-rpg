import { StrictMode, useEffect, useState } from 'react'
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

const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

/**
 * Dev scaffolding, second half. Jumping straight to `?screen=courseRegistration` skips the
 * screen that writes the save, so there is no game to shop for. Rather than have the screen
 * pretend, post the `pekka` preset — the same build the server tests use — and hand back its
 * id. Only ever called on the direct-jump path; the real route through the game already has a
 * save by the time it reaches shopping week.
 */
const bootstrapDevSave = async (): Promise<string | null> => {
  try {
    const options = (await (await fetch(`${BASE}/api/creation/options`)).json()) as {
      presets?: ({ id: string; name: string } & Record<string, unknown>)[]
    }
    const preset = options.presets?.find((p) => p.id === 'pekka')
    if (!preset) return null
    const { id: _id, name: _name, ...build } = preset
    const res = await fetch(`${BASE}/api/game/new`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(build),
    })
    if (res.status !== 201) return null
    return ((await res.json()) as { gameId: string }).gameId
  } catch {
    return null
  }
}

function BrowserApp() {
  const [view, setView] = useState<View>(requestedView)
  const [identity, setIdentity] = useState<CharacterIdentity>(DEFAULT_IDENTITY)
  /** The save every post-creation screen reads from. `null` until one is written (§4.6). */
  const [gameId, setGameId] = useState<string | null>(null)

  useEffect(() => {
    if (gameId !== null || requestedView() === 'welcome') return
    let stale = false
    void bootstrapDevSave().then((id) => {
      if (!stale && id) setGameId(id)
    })
    return () => {
      stale = true
    }
  }, [gameId])

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
    return (
      <CourseRegistrationScreen
        identity={identity}
        gameId={gameId}
        onBack={() => setView('timeline')}
      />
    )
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
    onSaveAndStart={(id) => {
      setGameId(id)
      setView('timeline')
    }}
  />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserApp />
  </StrictMode>,
)