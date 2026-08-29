import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { FRAME, pad, rule } from './layout.ts'

export type CalendarSheet = {
  state: {
    day: number
    date: string
    dateLong: string
    body: { energy: number; stress: number; condition: number }
    log: string[]
  }
}

type Cell = { label: string; day: number | null; current: boolean }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function monthCells(dateText: string): { title: string; weeks: Cell[][] } {
  const anchor = new Date(`${dateText}T12:00:00Z`)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1, 12))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
  const offset = (start.getUTCDay() + 6) % 7
  const current = anchor.getUTCDate()
  const cells: Cell[] = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1
    const inMonth = day >= 1 && day <= daysInMonth
    return {
      label: inMonth ? String(day).padStart(2, ' ') : '  ',
      day: inMonth ? day : null,
      current: inMonth && day === current,
    }
  })
  const weeks: Cell[][] = Array.from({ length: 6 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
  const title = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { title, weeks }
}

function cellText(cell: Cell): string {
  if (cell.day === null) return '         '
  const marker = cell.current ? '*' : ' '
  return pad(`${cell.label}${marker}`, 9)
}

function weekLine(week: Cell[]): string {
  return `|${week.map((cell) => cellText(cell)).join('|')}|`
}

export function Calendar({ sheet, onClose }: { sheet: CalendarSheet; onClose: () => void }) {
  const { title, weeks } = useMemo(() => monthCells(sheet.state.date), [sheet.state.date])

  useInput((input, key) => {
    if (key.return) onClose()
    if (input === ' ') return
  })

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={40}>
          <Text bold>HARVARD - calendar</Text>
        </Box>
        <Box width={FRAME.cols - 40} justifyContent="flex-end">
          <Text dimColor>{sheet.state.dateLong} · starter picture</Text>
        </Box>
      </Box>
      <Text dimColor>{rule()}</Text>

      <Box>
        <Box flexDirection="column" width={73}>
          <Text>{`+${'---------+'.repeat(7)}`}</Text>
          <Text>{`|${WEEKDAYS.map((d) => pad(d, 9)).join('|')}|`}</Text>
          <Text>{`+${'---------+'.repeat(7)}`}</Text>
          {weeks.map((week, i) => (
            <React.Fragment key={i}>
              <Text>{weekLine(week)}</Text>
              <Text>{`+${'---------+'.repeat(7)}`}</Text>
            </React.Fragment>
          ))}
        </Box>

        <Box flexDirection="column" width={25} marginLeft={1}>
          <Text bold>{title}</Text>
          <Text> </Text>
          <Text dimColor>today</Text>
          <Text>{sheet.state.dateLong}</Text>
          <Text> </Text>
          <Text dimColor>what this is</Text>
          <Text>first pass at the calendar picture</Text>
          <Text>real events will come in Tier 2</Text>
          <Text> </Text>
          <Text dimColor>current day</Text>
          <Text>{`day ${sheet.state.day}`}</Text>
          <Text> </Text>
          <Text dimColor>reading room</Text>
          <Text>empty grid, waiting for the term</Text>
        </Box>
      </Box>

      <Text dimColor>{rule()}</Text>
      <Text dimColor>enter back to the sheet · q quit</Text>
    </Box>
  )
}