import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANVAS } from '../packages/client/src/layout.ts'

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

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const client = join(repo, 'packages', 'client', 'src', 'main.tsx')
const { cols, rows } = CANVAS

const tsx = (() => {
  const local = join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  return existsSync(local) ? ['node', local] : ['npx', 'tsx']
})()

const has = (exe: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  return spawnSync(probe, [exe], { stdio: 'ignore' }).status === 0
}

const detach = (command: string, args: string[]) => {
  spawn(command, args, { cwd: repo, detached: true, stdio: 'ignore' }).unref()
}

/** Is the server up? Opening a window that can only say "no server" is not worth doing. */
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

if (!(await serverIsUp())) {
  console.error('The server is not answering. Start it first:\n\n  npm run server\n')
  process.exit(1)
}

if (process.platform === 'win32') {
  if (has('wt.exe')) {
    // Windows Terminal takes the size directly, which is the only way to get it exact.
    detach('wt.exe', [
      '--size',
      `${cols},${rows}`,
      '--title',
      'Harvard',
      ...tsx,
      client,
    ])
  } else {
    // conhost: `start` gives us the window, `mode con` gives us the size. The `|| pause`
    // keeps a crash readable instead of closing the window on top of the stack trace.
    const inner = `mode con: cols=${cols} lines=${rows} && ${tsx.map(quote).join(' ')} ${quote(client)} || pause`
    detach('cmd.exe', ['/c', 'start', '"Harvard"', '/D', repo, 'cmd.exe', '/c', inner])
  }
} else if (process.platform === 'darwin') {
  // Terminal.app cannot be sized from the command line, so ask it in AppleScript.
  const script = `tell application "Terminal"
    do script "cd ${repo} && printf '\\\\e[8;${rows};${cols}t' && ${tsx.join(' ')} ${client}"
    activate
  end tell`
  detach('osascript', ['-e', script])
} else {
  const emulator = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'].find(has)
  if (emulator === 'xterm' || emulator === 'x-terminal-emulator') {
    detach(emulator, ['-geometry', `${cols}x${rows}`, '-T', 'Harvard', '-e', ...tsx, client])
  } else if (emulator) {
    detach(emulator, ['--', ...tsx, client])
  } else {
    console.error(
      `No terminal emulator found. Run it in place instead:\n\n  npm run play:here\n\n` +
        `Resize the window to ${cols} × ${rows} first.`,
    )
    process.exit(1)
  }
}

function quote(s: string): string {
  return s.includes(' ') ? `"${s}"` : s
}
