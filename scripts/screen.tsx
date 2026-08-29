import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { loadContent } from '@harvard/content'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../packages/server/src/app.ts'
import { Canvas, claimScreen } from '../packages/client/src/Canvas.tsx'
import type { Catalogue } from '../packages/client/src/Planner.tsx'

type Boot = {
  gameId: string
  catalogue: Catalogue
  Planner: (props: { gameId: string; catalogue: Catalogue; onClose: () => void }) => React.JSX.Element
  shutdown: () => Promise<void>
}

function App({ gameId }: { gameId?: string }) {
  const { exit } = useApp()
  const [boot, setBoot] = useState<Boot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (boot) {
      void boot.shutdown().finally(exit)
      return
    }
    exit()
  }

  useEffect(() => {
    let stale = false
    void bootstrap(gameId)
      .then((next) => {
        if (!stale) setBoot(next)
        else void next.shutdown()
      })
      .catch((err: unknown) => {
        if (!stale) setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      stale = true
    }
  }, [gameId])

  useEffect(() => {
    return () => {
      if (boot) void boot.shutdown()
    }
  }, [boot])

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c') || input === 'q') close()
  })

  if (error) {
    return (
      <Box flexDirection="column">
        <Text bold>HARVARD - screen</Text>
        <Text> </Text>
        <Text color="red">{error}</Text>
        <Text> </Text>
        <Text dimColor>q to quit</Text>
      </Box>
    )
  }

  if (!boot) return <Text dimColor>building planner screen...</Text>

  const Planner = boot.Planner
  return <Planner gameId={boot.gameId} catalogue={boot.catalogue} onClose={close} />
}

async function bootstrap(gameId?: string): Promise<Boot> {
  const here = dirname(fileURLToPath(import.meta.url))
  const content = loadContent(join(here, '..', 'content'))
  const { app } = buildApp({ content, dbFile: ':memory:' })
  await app.ready()

  const addr = await app.listen({ port: 0, host: '127.0.0.1' })
  const base = String(addr).replace(/\/$/, '')
  process.env.HARVARD_SERVER = base

  const shutdown = async () => {
    await app.close()
  }

  try {
    const plannerModule = await import('../packages/client/src/Planner.tsx')

    const id = gameId ?? (await createDemoSave(base, content.presets.find((p) => p.id === 'pekka')))
    const catalogueRes = await fetch(`${base}/api/day/activities`)
    if (!catalogueRes.ok) throw new Error('could not load day activities for planner')
    const catalogue = (await catalogueRes.json()) as Catalogue

    return {
      gameId: id,
      catalogue,
      Planner: plannerModule.Planner,
      shutdown,
    }
  } catch (err) {
    await shutdown()
    throw err
  }
}

async function createDemoSave(base: string, preset: (typeof loadContent extends (...args: any[]) => infer T ? T : never)['presets'][number] | undefined): Promise<string> {
  if (!preset) throw new Error('content/presets/pekka.yaml is missing')
  const { id: _id, name: _name, ...build } = preset

  const created = await fetch(`${base}/api/game/new`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(build),
  })
  if (!created.ok) throw new Error('could not create a demo planner save')

  const payload = (await created.json()) as { gameId: string }
  return payload.gameId
}

claimScreen()
render(
  <Canvas>
    <App gameId={process.argv[2]} />
  </Canvas>,
)
