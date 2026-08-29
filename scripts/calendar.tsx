import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { loadContent } from '@harvard/content'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../packages/server/src/app.ts'
import { Canvas, claimScreen } from '../packages/client/src/Canvas.tsx'
import { Calendar, type CalendarSheet } from '../packages/client/src/Calendar.tsx'

type Sheet = CalendarSheet & { id: string }

const BASE = process.env.HARVARD_SERVER ?? 'http://127.0.0.1:4711'

function App({ gameId }: { gameId?: string }) {
  const { exit } = useApp()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    void loadSheet(gameId)
      .then((next) => {
        if (!stale) setSheet(next)
      })
      .catch((err: unknown) => {
        if (!stale) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      stale = true
    }
  }, [gameId])

  useInput((input, key) => {
    if (key.escape || key.return || input === 'q') exit()
  })

  if (error) {
    return (
      <Box flexDirection="column">
        <Text bold>HARVARD - calendar</Text>
        <Text> </Text>
        <Text color="red">{error}</Text>
        <Text> </Text>
        <Text dimColor>q to quit</Text>
      </Box>
    )
  }

  if (!sheet) return <Text dimColor>reading calendar…</Text>

  return <Calendar sheet={sheet} onClose={exit} />
}

async function loadSheet(gameId?: string): Promise<Sheet> {
  if (gameId) {
    const res = await fetch(`${BASE}/api/game/${gameId}`)
    if (!res.ok) throw new Error(`calendar save ${gameId} was not found`)
    return (await res.json()) as Sheet
  }

  const content = loadContent(join(dirname(fileURLToPath(import.meta.url)), '..', 'content'))
  const { app } = buildApp({ content, dbFile: ':memory:' })
  await app.ready()

  const preset = content.presets.find((p) => p.id === 'pekka')
  if (!preset) throw new Error('content/presets/pekka.yaml is missing')
  const { id: _id, name: _name, ...build } = preset

  const created = await app.inject({ method: 'POST', url: '/api/game/new', payload: build })
  if (created.statusCode !== 201) throw new Error('could not create a demo calendar save')

  const { gameId: id } = created.json() as { gameId: string }
  const res = await app.inject({ method: 'GET', url: `/api/game/${id}` })
  await app.close()
  return res.json() as Sheet
}

claimScreen()
render(
  <Canvas>
    <App gameId={process.argv[2]} />
  </Canvas>,
)