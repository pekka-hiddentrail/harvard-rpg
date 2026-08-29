import { openWindow } from './window.ts'

/**
 * Opens the game in its own window, sized to the canvas.
 *
 * The alternative — "run it in whatever terminal you happen to have open" — puts the burden
 * of getting the window right on the player every single time, and a window three columns too
 * narrow makes the game look broken rather than the window look small.
 *
 * Nothing here knows any game rules; it is a window opener. `npm run play:here` skips it and
 * runs in place, which is what you want when something has crashed and you need the stack.
 */

/** Which screen to open in the detached window. */
const mode = process.argv[2]
const target =
  mode === 'calendar'
    ? 'scripts/calendar.tsx'
    : mode === 'screen'
      ? 'scripts/screen.tsx'
      : 'packages/client/src/main.tsx'
const args = mode === 'calendar' || mode === 'screen' ? process.argv.slice(3) : process.argv.slice(2)

/** Is the server up? Opening the main game window without one is not worth doing. */
const serverIsUp = async (): Promise<boolean> => {
  const base = process.env.HARVARD_SERVER ?? 'http://127.0.0.1:4711'
  try {
    const res = await fetch(`${base}/api/creation/options`, {
      signal: AbortSignal.timeout(1500),
    })
    return res.ok
  } catch {
    return false
  }
}

if (target === 'packages/client/src/main.tsx' && !(await serverIsUp())) {
  console.error('The server is not answering. Start it first:\n\n  npm run server\n')
  process.exit(1)
}

try {
  openWindow(target, args)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`${message}\n`)
  if (mode === 'screen') {
    console.error('Try running in place instead:\n\n  npm run screen:here\n')
  } else if (mode === 'calendar') {
    console.error('Try running in place instead:\n\n  tsx scripts/calendar.tsx\n')
  } else {
    console.error('Try running in place instead:\n\n  npm run play:here\n')
  }
  process.exit(1)
}
