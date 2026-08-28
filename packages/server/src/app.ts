import { randomBytes, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Content } from '@harvard/content'
import {
  BuildRequest,
  Save,
  priceTrait,
  toCreationBlock,
  validateBuild,
} from '@harvard/engine'

/**
 * Tier 0 server. Two content routes and two game routes — enough to prove the slice
 * end to end: Ink → HTTP → engine → SQLite → back.
 *
 * The rules live behind this boundary and stay there. The client cannot compute a cost,
 * cannot validate a build, and cannot see anything the engine did not hand it
 * (ARCHITECTURE §4).
 *
 * `buildApp` takes its content and its database path so the slice is testable without a
 * listening socket or a file on disk.
 */

export type ServerOptions = {
  content: Content
  /** A path, or `:memory:` in tests. */
  dbFile: string
}

export function buildApp({ content, dbFile }: ServerOptions): {
  app: FastifyInstance
  db: Database.Database
} {
  const db = new Database(dbFile)
  if (dbFile !== ':memory:') db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      json         TEXT NOT NULL
    );
  `)

  const app = Fastify({ logger: false })
  app.addHook('onClose', () => db.close())

  /**
   * Reach is deliberately absent from this payload. §7.8 requires the creation screen to
   * show what a choice *reaches*, never a score — and reach is a count over the NPC pool,
   * which does not exist until Tier 3. Shipping it as a stub would be worse than omitting
   * it: a wrong number on this screen is a wrong decision by the player.
   */
  app.get('/api/creation/options', () => ({
    contentHash: content.hash,
    budget: content.rules.creation.budget,
    refundCap: content.rules.creation.refundCap,
    priceTolerance: content.rules.creation.priceTolerance,
    subjectTags: content.rules.subjectTags,
    packs: content.packs.map((p) => ({ id: p.id, version: p.version })),
    presets: content.presets.map((p) => ({
      id: p.id,
      name: p.name,
      hometown: p.hometown,
      schoolType: p.schoolType,
      program: p.program,
      targetTrack: p.targetTrack ?? null,
      traits: p.traits,
    })),
    traits: content.traits
      .filter((t) => !t.hidden)
      .map((t) => ({
        id: t.id,
        name: t.name,
        blurb: t.blurb,
        cost: t.cost,
        kinds: t.kinds,
        affects: t.affects,
        excludes: t.excludes,
        requiresAnyOf: t.requiresAnyOf,
        requiresOneOf: t.requiresOneOf,
        grantsLanguageFrom: t.grantsLanguageFrom,
        contagious: t.contagious,
        structural: t.structural,
        why: t.why ?? null,
        // What the schedule would charge, so the screen can be honest about derivation.
        derivedCost: priceTrait(t, content.rules).points,
      })),
  }))

  /** A dry run of the validator, so the screen can show problems while the player edits. */
  app.post('/api/creation/validate', (req, reply) => {
    const parsed = BuildRequest.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const result = validateBuild(parsed.data, content.index, content.rules)
    return result.ok
      ? {
          ok: true,
          spent: result.spent,
          refunded: result.refunded,
          levels: result.levels,
          languages: result.languages,
        }
      : { ok: false, problems: result.problems }
  })

  app.post('/api/game/new', (req, reply) => {
    const parsed = BuildRequest.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ problems: flatten(parsed.error) })

    const result = validateBuild(parsed.data, content.index, content.rules)
    if (!result.ok) return reply.code(422).send({ problems: result.problems })

    // The seed is drawn here and nowhere else. The engine may not call randomBytes — every
    // draw in play derives from this string (ARCHITECTURE §3.3).
    const save = Save.parse({
      id: randomUUID(),
      seed: randomBytes(16).toString('hex'),
      contentHash: content.hash,
      creation: toCreationBlock(parsed.data, result, content.index, content.rules),
      actions: [],
    })

    db.prepare(
      'INSERT INTO saves (id, created_at, content_hash, json) VALUES (?, ?, ?, ?)',
    ).run(save.id, new Date().toISOString(), save.contentHash, JSON.stringify(save))

    return reply.code(201).send({ gameId: save.id })
  })

  app.get('/api/game/:id', (req, reply) => {
    const { id } = req.params as { id: string }
    const row = db.prepare('SELECT json FROM saves WHERE id = ?').get(id) as
      | { json: string }
      | undefined
    if (!row) return reply.code(404).send({ error: 'no such save' })

    const save = Save.parse(JSON.parse(row.json))
    const stale = save.contentHash !== content.hash

    // Levels are DERIVED, never stored (§8). Recomputed from the build on every read, which
    // is also how a content change announces itself instead of hiding.
    const revalidated = validateBuild(
      {
        hometown: save.creation.hometown,
        schoolType: save.creation.schoolType,
        program: save.creation.program,
        ...(save.creation.targetTrack === undefined
          ? {}
          : { targetTrack: save.creation.targetTrack }),
        traits: save.creation.traits.map((t) => ({
          id: t.id,
          ...(t.language === undefined ? {} : { language: t.language }),
        })),
      },
      content.index,
      content.rules,
    )

    return {
      view: 'character',
      id: save.id,
      contentHash: save.contentHash,
      staleContent: stale,
      creation: save.creation,
      traitNames: save.creation.traits.map((t) => content.index.get(t.id)?.name ?? t.id),
      levels: revalidated.ok ? revalidated.levels : null,
      actionCount: save.actions.length,
    }
  })

  return { app, db }
}

const flatten = (e: { issues: { path: (string | number)[]; message: string }[] }) =>
  e.issues.map((i) => ({ code: 'schema', message: `${i.path.join('.') || 'body'}: ${i.message}` }))
