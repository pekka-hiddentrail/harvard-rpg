import React from 'react'
import { Text } from 'ink'
import { FRAME, pad } from './layout.ts'

/**
 * The two primitives every screen is built from.
 *
 * A pane has a declared height and a row has a declared width, always. That is the whole
 * technique behind r13's fixed canvas: if nothing can change size, nothing below it can move
 * while the player is reading it.
 */

export type Line = { text: string; color?: string; bold?: boolean; dim?: boolean; inverse?: boolean }

/** One row of a fixed-height pane. Always full width, so a blank row still clears the row. */
export const Row = ({ line, width = FRAME.cols }: { line: Line | undefined; width?: number }) => (
  <Text
    {...(line?.color === undefined ? {} : { color: line.color })}
    {...(line?.bold === undefined ? {} : { bold: line.bold })}
    {...(line?.dim === undefined ? {} : { dimColor: line.dim })}
    {...(line?.inverse === undefined ? {} : { inverse: line.inverse })}
  >
    {pad(line?.text ?? '', width)}
  </Text>
)

/** Pad a pane's contents to its declared height, so the panes below it never move. */
export const fill = (lines: Line[], height: number): (Line | undefined)[] => [
  ...lines.slice(0, height),
  ...Array<undefined>(Math.max(0, height - lines.length)).fill(undefined),
]
