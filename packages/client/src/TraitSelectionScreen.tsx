import { useEffect, useState } from 'react'
import type { CharacterIdentity } from './CharacterGenerationScreen.tsx'

// The trait pool, budget and cost schedule are content-authored and validated server-side;
// this screen only asks and renders (ARCHITECTURE §4). Never duplicate the price schedule here.
const BASE = (import.meta.env.VITE_HARVARD_SERVER as string | undefined) ?? 'http://127.0.0.1:4711'

type TraitOpt = {
  id: string
  name: string
  blurb: string
  cost: number
  kinds: string[]
  affects: Record<string, number>
  excludes: string[]
  requiresAnyOf: string[]
  requiresOneOf: string[]
  grantsLanguageFrom: string[]
  contagious: boolean
  structural: boolean
  why: string | null
  derivedCost: number | null
}

type Options = {
  contentHash: string
  budget: number
  refundCap: number
  subjectTags: string[]
  traits: TraitOpt[]
}

type Pick = { id: string; language?: string }

type Problem = { code: string; message: string }
type Validation = {
  ok: boolean
  spent?: number
  refunded?: number
  levels?: Record<string, number>
  languages?: string[]
  problems?: Problem[]
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as unknown }
}

const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

type TraitSelectionScreenProps = {
  identity: CharacterIdentity
  onBack: () => void
  onSaveAndStart?: (picks: Pick[]) => void
}

export function TraitSelectionScreen({ identity, onBack, onSaveAndStart }: TraitSelectionScreenProps) {
  const [options, setOptions] = useState<Options | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [valid, setValid] = useState<Validation | null>(null)

  useEffect(() => {
    fetch(`${BASE}/api/creation/options`)
      .then((r) => r.json() as Promise<Options>)
      .then(setOptions)
      .catch(() => setError(`No server on ${BASE}. Start it with \`npm run server\` in another window.`))
  }, [])

  useEffect(() => {
    if (picks.length === 0) {
      setValid(null)
      return
    }
    let stale = false
    post('/api/creation/validate', {
      hometown: `${identity.city}, ${identity.state}`,
      schoolType: identity.school,
      program: 'degree',
      traits: picks,
    })
      .then(({ json }) => {
        if (!stale) setValid(json as Validation)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [picks, identity.city, identity.state, identity.school])

  if (error) {
    return (
      <main className="traits-shell">
        <section className="traits traits-message">
          <p className="kicker">Traits and abilities</p>
          <p>{error}</p>
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
        </section>
      </main>
    )
  }

  if (!options) {
    return (
      <main className="traits-shell">
        <section className="traits traits-message">
          <p className="kicker">Traits and abilities</p>
          <p>Reading the trait pool…</p>
        </section>
      </main>
    )
  }

  const pickedIds = new Set(picks.map((p) => p.id))

  // A trait with `requiresOneOf` is a parent demanding a mandatory child; the children are
  // only reachable once the parent is picked (e.g. INTERNATIONAL STUDENT → one origin trait).
  const parentOf = (trait: TraitOpt): TraitOpt | undefined =>
    options.traits.find((t) => t.requiresOneOf.includes(trait.id))

  const isUnlocked = (trait: TraitOpt): boolean => {
    const parent = parentOf(trait)
    if (parent && !pickedIds.has(parent.id)) return false
    if (trait.requiresAnyOf.length > 0 && !trait.requiresAnyOf.some((id) => pickedIds.has(id))) return false
    if (trait.excludes.some((id) => pickedIds.has(id))) return false
    return true
  }

  const lockReason = (trait: TraitOpt): string | undefined => {
    const parent = parentOf(trait)
    if (parent && !pickedIds.has(parent.id)) return `Choose ${parent.name} first`
    if (trait.requiresAnyOf.length > 0 && !trait.requiresAnyOf.some((id) => pickedIds.has(id))) {
      const names = trait.requiresAnyOf.map((id) => options.traits.find((t) => t.id === id)?.name ?? id)
      return `Needs ${names.join(' or ')}`
    }
    const excluded = trait.excludes.find((id) => pickedIds.has(id))
    if (excluded) return `Closed by ${options.traits.find((t) => t.id === excluded)?.name ?? excluded}`
    return undefined
  }

  const toggle = (trait: TraitOpt) => {
    setFocusedId(trait.id)
    const picked = pickedIds.has(trait.id)
    if (!picked && !isUnlocked(trait)) return
    setPicks((prev) =>
      picked
        ? prev.filter((p) => p.id !== trait.id)
        : [...prev, { id: trait.id, ...(trait.grantsLanguageFrom[0] ? { language: trait.grantsLanguageFrom[0] } : {}) }],
    )
  }

  const setLanguage = (traitId: string, language: string) => {
    setPicks((prev) => prev.map((p) => (p.id === traitId ? { ...p, language } : p)))
  }

  const focused = options.traits.find((t) => t.id === focusedId) ?? null
  const spent = valid?.spent ?? 0
  const refunded = valid?.refunded ?? 0
  const net = spent - refunded
  const left = options.budget - net
  const chosenTraits = options.traits.filter((t) => pickedIds.has(t.id))

  return (
    <main className="traits-shell">
      <section className="traits" aria-labelledby="traits-title">
        <header className="character-header">
          <span />
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <p className="traits-name">Name: <strong>{identity.name}</strong></p>

        <div className="traits-columns-header">
          <h1 id="traits-title">Traits and abilities</h1>
          <p className={`points-readout ${left === 0 ? 'ok' : left < 0 ? 'over' : ''}`}>
            {left === 0 ? 'Budget spent exactly' : left > 0 ? `${left} points left` : `Over by ${-left}`}
            {' '}· spent {spent} / {options.budget}
          </p>
        </div>

        <div className="traits-columns">
          <div className="traits-list-column">
            <ul className="traits-list" aria-label="List of traits and options">
              {options.traits.map((trait) => {
                const picked = pickedIds.has(trait.id)
                const unlocked = isUnlocked(trait)
                const pick = picks.find((p) => p.id === trait.id)
                return (
                  <li key={trait.id}>
                    <button
                      type="button"
                      className={picked ? 'selected' : ''}
                      disabled={!picked && !unlocked}
                      aria-pressed={picked}
                      title={unlocked ? undefined : lockReason(trait)}
                      onClick={() => toggle(trait)}
                    >
                      <span>{trait.name}</span>
                      <span className="trait-cost">{sign(trait.cost)}</span>
                    </button>
                    {picked && trait.grantsLanguageFrom.length > 0 ? (
                      <select
                        aria-label={`Language for ${trait.name}`}
                        value={pick?.language ?? trait.grantsLanguageFrom[0]}
                        onChange={(e) => setLanguage(trait.id, e.target.value)}
                      >
                        {trait.grantsLanguageFrom.map((lang) => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            <p className="points-readout">Points spent {spent} / {options.budget}</p>
          </div>

          <div className="trait-description">
            <h2>Trait description</h2>
            {focused ? (
              <>
                <p className="trait-heading">
                  {focused.name}
                  {focused.kinds.length > 0 ? <span className="trait-kinds"> {focused.kinds.join(' · ')}</span> : null}
                </p>
                {focused.blurb ? <p>{focused.blurb}</p> : null}
                {focused.requiresOneOf.length > 0 ? (
                  <p className="trait-relation">
                    then exactly one of: {focused.requiresOneOf.map((id) => options.traits.find((t) => t.id === id)?.name ?? id).join(' · ')}
                  </p>
                ) : null}
                {focused.requiresAnyOf.length > 0 ? (
                  <p className="trait-relation">
                    needs: {focused.requiresAnyOf.map((id) => options.traits.find((t) => t.id === id)?.name ?? id).join(' or ')}
                  </p>
                ) : null}
                {focused.excludes.length > 0 ? (
                  <p className="trait-relation closes">
                    closes: {focused.excludes.map((id) => options.traits.find((t) => t.id === id)?.name ?? id).join(' · ')}
                  </p>
                ) : null}
                {focused.structural && focused.why ? <p className="trait-why">{focused.why}</p> : null}
              </>
            ) : (
              <p className="trait-placeholder">Select a trait to see its description.</p>
            )}
          </div>

          <div className="traits-summary">
            <h2>Ability scores</h2>
            <ul className="ability-scores">
              {options.subjectTags.map((tag) => {
                const v = valid?.levels?.[tag] ?? 0
                return (
                  <li key={tag}>
                    <span>{tag}</span>
                    <span className={v > 0 ? 'positive' : v < 0 ? 'negative' : 'zero'}>
                      {v === 0 ? '—' : sign(v)}
                    </span>
                  </li>
                )
              })}
            </ul>

            <h2>Social traits</h2>
            {chosenTraits.filter((t) => Object.keys(t.affects).length === 0).length === 0 ? (
              <p className="trait-placeholder">None chosen yet.</p>
            ) : (
              <ul>
                {chosenTraits
                  .filter((t) => Object.keys(t.affects).length === 0)
                  .map((t) => <li key={t.id}>{t.name}</li>)}
              </ul>
            )}

            <h2>Academic traits</h2>
            {chosenTraits.filter((t) => Object.keys(t.affects).length > 0).length === 0 ? (
              <p className="trait-placeholder">None chosen yet.</p>
            ) : (
              <ul>
                {chosenTraits
                  .filter((t) => Object.keys(t.affects).length > 0)
                  .map((t) => <li key={t.id}>{t.name}</li>)}
              </ul>
            )}
          </div>
        </div>

        {valid?.ok === false && valid.problems && valid.problems.length > 0 ? (
          <ul className="traits-problems">
            {valid.problems.map((p) => <li key={p.code}>{p.message}</li>)}
          </ul>
        ) : null}

        <div className="traits-actions">
          <button className="back-button" type="button" onClick={onBack}>Back</button>
          <button
            className="continue-button"
            type="button"
            disabled={valid?.ok !== true}
            onClick={() => onSaveAndStart?.(picks)}
          >
            Save and start game
          </button>
        </div>
      </section>
    </main>
  )
}
