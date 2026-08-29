import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANVAS } from './layout.ts'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

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

export function openWindow(scriptRelativePath: string, args: string[] = []): void {
  const script = join(repo, scriptRelativePath)

  if (process.platform === 'win32') {
    if (has('wt.exe')) {
      detach('wt.exe', ['--size', `${CANVAS.cols},${CANVAS.rows}`, '--title', 'Harvard', ...tsx, script, ...args])
    } else {
      const inner = `mode con: cols=${CANVAS.cols} lines=${CANVAS.rows} && ${[...tsx, script, ...args].map(quote).join(' ')} || pause`
      detach('cmd.exe', ['/c', 'start', '"Harvard"', '/D', repo, 'cmd.exe', '/c', inner])
    }
    return
  }

  if (process.platform === 'darwin') {
    const command = [...tsx, script, ...args].map(quote).join(' ')
    const shell = `cd ${repo} && printf '\\e[8;${CANVAS.rows};${CANVAS.cols}t' && ${command}`
    const scriptText = `tell application "Terminal"
    do script ${quote(shell)}
    activate
  end tell`
    detach('osascript', ['-e', scriptText])
    return
  }

  const emulator = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'].find(has)
  if (emulator === 'xterm' || emulator === 'x-terminal-emulator') {
    detach(emulator, ['-geometry', `${CANVAS.cols}x${CANVAS.rows}`, '-T', 'Harvard', '-e', ...tsx, script, ...args])
  } else if (emulator) {
    detach(emulator, ['--', ...tsx, script, ...args])
  } else {
    throw new Error(`No terminal emulator found for ${scriptRelativePath}`)
  }
}

function quote(s: string): string {
  return s.includes(' ') ? `"${s}"` : s
}