// A small, fully local seeded PRNG for client-side flavor generation (e.g. the housing
// questionnaire's roommate pick). Deterministic given a seed string, so the same seed always
// reproduces the same result — which is the whole point for testing.
//
// Deliberately separate from the engine: the engine's own seeded rng is a Tier 2+ concern and
// lives server-side, pinned to a save. This one is local UI flavor, nothing here is persisted.

const hashSeed = (seed: string): number => {
  let h = 0x811c9dc5 // FNV-1a offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small, fast, good enough for flavor generation. Returns a value in [0, 1). */
export function createRng(seed: string): () => number {
  let state = hashSeed(seed || 'harvard')
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A deterministic index in [0, length), drawn from the rng. */
export function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length))
}

/** A short random-looking seed for players who leave the field blank at creation. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}
