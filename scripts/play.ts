import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const serverIsUp = async (
  fetchFn: typeof fetch = fetch,
  base: string = process.env.HARVARD_SERVER ?? 'http://127.0.0.1:4711',
): Promise<boolean> => {
  try {
    const res = await fetchFn(`${base}/api/creation/options`, {
      signal: AbortSignal.timeout(1500),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function ensureServer(
  deps: {
    fetch?: typeof fetch
    spawn?: typeof spawn
    setTimeout?: typeof setTimeout
  } = {},
): Promise<boolean> {
  const fetchFn = deps.fetch ?? fetch
  const spawnFn = deps.spawn ?? spawn
  const setTimer = deps.setTimeout ?? setTimeout
  const base = process.env.HARVARD_SERVER ?? 'http://127.0.0.1:4711'

  if (await serverIsUp(fetchFn, base)) return true

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawnFn(command, ['run', 'server'], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()

  for (let i = 0; i < 40; i += 1) {
    await new Promise<void>((resolve) => setTimer(resolve, 250))
    if (await serverIsUp(fetchFn, base)) return true
  }

  return false
}

/** Which screen to open in the detached window. */
const mode = process.argv[2]
const target =
  mode === 'calendar'
    ? 'scripts/calendar.tsx'
    : mode === 'screen'
      ? 'scripts/screen.tsx'
      : mode === 'welcome'
        ? 'scripts/welcome.tsx'
        : 'packages/client/src/main.tsx'
const args = mode === 'calendar' || mode === 'screen' || mode === 'welcome' ? process.argv.slice(3) : process.argv.slice(2)

if (target === 'packages/client/src/main.tsx') {
  const ready = await ensureServer()
  if (!ready) {
    console.error('The server did not answer after starting.\n\n  npm run server\n')
    process.exit(1)
  }
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
