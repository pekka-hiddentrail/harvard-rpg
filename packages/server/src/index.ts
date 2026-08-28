import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadContent } from '@harvard/content'
import { buildApp } from './app.ts'

/** Boot. Everything interesting is in `app.ts`; this file owns the filesystem and the port. */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const content = loadContent(join(repoRoot, 'content'))

const dataDir = join(repoRoot, 'saves')
mkdirSync(dataDir, { recursive: true })

const { app } = buildApp({ content, dbFile: join(dataDir, 'harvard.sqlite') })

const port = Number(process.env.PORT ?? 4711)
try {
  await app.listen({ port, host: '127.0.0.1' })
  console.log(`harvard-rpg server on http://127.0.0.1:${port}`)
  console.log(`content ${content.hash} · ${content.traits.length} traits`)
} catch (err) {
  console.error(err)
  process.exit(1)
}
