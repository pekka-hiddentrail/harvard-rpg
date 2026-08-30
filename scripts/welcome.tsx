import React, { useState } from 'react'
import { Box, Text, render, useInput } from 'ink'
import { Canvas, claimScreen } from '../packages/client/src/Canvas.tsx'
import { FRAME } from '../packages/client/src/layout.ts'

const menu = ['Start new game', 'Load a game', 'Credits'] as const

const center = (text: string, width: number): string => {
  const trimmed = text.slice(0, width)
  const left = Math.max(0, Math.floor((width - trimmed.length) / 2))
  return ' '.repeat(left) + trimmed + ' '.repeat(Math.max(0, width - left - trimmed.length))
}

function HarvardBanner() {
  const shield = [
    '████████████',
    '███  ██  ███',
    '███  ██  ███',
    '███      ███',
    ' ██  ██  ██ ',
    '  ████████  ',
    '            ',
  ]
  const blockTitle = [
    '██   ██  █████  ██████  ██   ██  █████  ██████  ██████ ',
    '██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██',
    '██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██ ██   ██',
    '███████ ███████ ██████  ██   ██ ███████ ██████  ██   ██',
    '██   ██ ██   ██ ██   ██  ██ ██  ██   ██ ██   ██ ██   ██',
    '██   ██ ██   ██ ██   ██   ███   ██   ██ ██   ██ ██████ ',
    '                                                       ',
  ]
  const crestWidth = shield[0]!.length
  const titleWidth = Math.max(0, FRAME.cols - crestWidth - crestWidth)

  return (
    <Box flexDirection="column">
      {blockTitle.map((line, i) => (
        <Text key={i}>
          <Text color="red">{shield[i] ?? shield[0]}</Text>
          <Text>{center(line, titleWidth)}</Text>
          <Text color="red">{shield[i] ?? shield[0]}</Text>
        </Text>
      ))}
      <Text>{center('UNIVERSITY LIFE SIMULATOR', FRAME.cols)}</Text>
    </Box>
  )
}

function WelcomeScreen() {
  const [index, setIndex] = useState(0)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setIndex((i) => (i + menu.length - 1) % menu.length)
      return
    }
    if (key.downArrow || input === 'j') {
      setIndex((i) => (i + 1) % menu.length)
      return
    }
  })

  return (
    <Box flexDirection="column" width={FRAME.cols} alignItems="center">
      <Text bold> The welcome screen </Text>
      <Box flexDirection="column" marginTop={1} width={FRAME.cols - 10}>
        <HarvardBanner />

        <Box marginTop={1} flexDirection="column">
          <Text>
            Welcome to Harvard University life simulator. This is a game where you live your
            life as a student in University from day one to the graduation day.
          </Text>

          <Text marginTop={1}>
            Day by day, week by week, semester by semester, you will study, play, love, cry...
          </Text>

          <Text marginTop={1}>[Write whatever fun you would write to this block...]</Text>

          <Box marginTop={1} flexDirection="column">
            <Text>Configurations</Text>
            {menu.map((item, i) => (
              <Text key={item} color={i === index ? 'yellow' : undefined}>
                {i === index ? '> ' : '  '}
                {item}
              </Text>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

claimScreen()
render(
  <Canvas>
    <WelcomeScreen />
  </Canvas>,
)
