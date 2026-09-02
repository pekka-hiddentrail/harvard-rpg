/**
 * One string hash for the whole engine.
 *
 * FNV-1a, 32-bit. Not cryptographic and does not need to be — every caller is turning a
 * stable identifier into a stable arbitrary-looking number, which is a different job from
 * resisting an adversary.
 *
 * It lives in its own module because there was briefly a second copy: `grading.ts` had this
 * function privately, and the term schedule needed the same "deterministic pick from a
 * string" property. Two hash functions in one engine is a drift bug waiting to happen — the
 * day one of them changes, saves created under the other quietly resolve differently.
 */
export function fnv1a(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * A stable index into a list of `length`, from a string. The one place a "pick something
 * arbitrary but always the same thing" decision is made, so the choice cannot differ
 * between two callers that both meant "whatever, but consistently".
 */
export function pickFrom(key: string, length: number): number {
  if (length <= 0) throw new Error('pickFrom: length must be positive')
  return fnv1a(key) % length
}
