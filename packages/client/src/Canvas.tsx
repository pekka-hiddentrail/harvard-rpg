import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { CANVAS, FRAME } from './layout.ts'

/**
 * Screen ownership and the size guard.
 *
 * The app takes the alternate screen buffer, the way `vim` and `less` do. That is what makes
 * it a program rather than a command: no scrollback smearing while it redraws, and the
 * terminal comes back exactly as it was when the player quits.
 */

const ALT_ON = '\x1b[?1049h'
const ALT_OFF = '\x1b[?1049l'
const CURSOR_OFF = '\x1b[?25l'
const CURSOR_ON = '\x1b[?25h'
const HOME = '\x1b[H'

/** `CSI 8 ; rows ; cols t` — a polite request. Windows Terminal and xterm honour it; the
 *  rest ignore it, which is why the size guard below exists as well. */
const resizeRequest = `\x1b[8;${CANVAS.rows};${CANVAS.cols}t`

export function claimScreen(): void {
  if (!process.stdout.isTTY) return
  process.stdout.write(resizeRequest + ALT_ON + CURSOR_OFF + HOME)

  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    process.stdout.write(CURSOR_ON + ALT_OFF)
  }
  process.on('exit', restore)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      restore()
      process.exit(0)
    })
  }
}

const currentSize = () => ({
  cols: process.stdout.columns ?? 0,
  rows: process.stdout.rows ?? 0,
})

export function useTerminalSize(): { cols: number; rows: number } {
  const [size, setSize] = useState(currentSize)
  useEffect(() => {
    const onResize = () => setSize(currentSize())
    process.stdout.on('resize', onResize)
    return () => {
      process.stdout.off('resize', onResize)
    }
  }, [])
  return size
}

/**
 * Pins its children to the canvas, or explains why it won't draw. Refusing to render is the
 * honest move: a squeezed layout looks broken, and the player would reasonably read it as a
 * bug in the game rather than a window three columns too narrow.
 */
export function Canvas({ children }: { children: React.ReactNode }) {
  const { cols, rows } = useTerminalSize()

  // A non-TTY (a pipe, CI) reports 0×0. Draw anyway — there is no one to resize it.
  const measured = cols > 0 && rows > 0
  if (measured && (cols < CANVAS.cols || rows < CANVAS.rows)) {
    return <TooSmall cols={cols} rows={rows} />
  }

  return (
    <Box flexDirection="column" width={FRAME.cols} height={FRAME.rows}>
      {children}
    </Box>
  )
}

function TooSmall({ cols, rows }: { cols: number; rows: number }) {
  const short = (a: number, b: number) => (a < b ? ` (${b - a} short)` : '')
  return (
    <Box flexDirection="column">
      <Text bold>HARVARD</Text>
      <Text> </Text>
      <Text>
        This window is{' '}
        <Text color="yellow">
          {cols} × {rows}
        </Text>
        .
      </Text>
      <Text>
        It needs to be{' '}
        <Text color="green">
          {CANVAS.cols} × {CANVAS.rows}
        </Text>
        : {CANVAS.cols} columns{short(cols, CANVAS.cols)}, {CANVAS.rows} rows
        {short(rows, CANVAS.rows)}.
      </Text>
      <Text> </Text>
      <Text dimColor>Drag the edge, or let it open its own window: npm run play</Text>
      <Text dimColor>esc to quit</Text>
    </Box>
  )
}
