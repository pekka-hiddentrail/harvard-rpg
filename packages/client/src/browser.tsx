import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './browser.css'
import { WelcomeScreen } from './WelcomeScreen.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WelcomeScreen />
  </StrictMode>,
)