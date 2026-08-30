# Handoff notes — harvard-rpg

Written 2026-08-29 by Claude Code for whoever picks this up next (human or another
agent). This is *context that the code and git history do not already say*. Read
`docs/GAME_DESIGN.md` and `docs/ARCHITECTURE.md` first — they are the real
specification and they are long, current, and approved.

---

## What the project is

A life-simulation game set at Harvard University. TypeScript end to end, Node 22,
npm workspaces. The user played a prototype **by hand** in Excel + markdown with an
LLM as narrator; it was fun and it stopped because the bookkeeping was manual. So
the project is *"replace the human engine with code, and keep the part the LLM was
already good at"* — not "design a game from scratch."

Core principle: **the simulation owns all state and all consequences; the LLM only
renders and interprets.** Nothing academic is ever LLM-generated.

The interface is a **browser HTML/CSS UI**. React remains the renderer and the client
remains rule-free; Ink, ASCII layout, and fixed terminal dimensions have been removed
entirely — the `gui-overhaul` branch replaced the presentation layer from scratch.

## Status as of 2026-08-29

| Tier | Scope | State |
|---|---|---|
| 0 | Character creation + vertical slice (Ink → Fastify → engine → SQLite) | **merged to `main`** (PR #2), played and accepted by the user |
| 1 | One day: eleven bands on halves, spin-up cost, the meals gap clock, the day planner, first balance bot | **built, branch `tier1`, PR #3 open and unmerged** |
| 2 | Academic spine + calendar. **Go/no-go gate.** | not started |
| 3 | ~115 NPCs | not started |
| 4 | Narrator, first `ANTHROPIC_API_KEY` use | not started |
| n | Free-text valve, full freshman-year content | not started |

`npx tsc --noEmit` clean. **168 tests / 53 suites / 0 failures** (`npm test`).

Commands: `npm test` · `npm run server` · `npm run play` (own window) ·
`npm run play:here` (in place) · `npm run screen` (renders the day planner to
stdout) · `npm run balance` (eight bot strategies, N days).

## What the user asked for last, and where I stopped mid-task

> *"let's not worry about the dates, we just need to make the calendar work and have
> it run in separate window."*

Two deliverables, **neither finished**:

1. **Make the calendar work.** My reading: the calendar as a thing you can see and
   move through — a screen, days advancing — *not* the full Tier 2 academic spine
   (courses, syllabi, grading). "Don't worry about the dates" resolves a conflict I
   had flagged: `GAME_DESIGN` §9.5 says move-in is Thu Aug 26 2027, the prototype's
   `Campus Calendar` sheet says Aug 27. **The user has said to stop worrying about
   it — pick one and move on.**
2. **Run it in a separate window.** `scripts/play.ts` already opens one (Windows
   Terminal via `wt.exe --size`, conhost fallback, macOS/Linux branches). It has
   *not* been verified to actually work on this machine, and it **requires the
   server to already be running** (`npm run server` in another terminal) or it
   exits with an error. That two-step is the most likely thing the user means by
   "have it run in separate window" — make `npm run play` start the server itself.

**I was interrupted here:** I had just unzipped
`~/Downloads/harvard_campus_map.xlsx` into a temp dir to read its `Campus Calendar`
and traditions sheets, intending to port them into a new `content/calendar.yaml`.
That workbook is **the user's own authored data and is authoritative over anything I
would infer** — 8 sheets: 114 students in two tiers, 30 staff, a four-year course
plan, a four-year traditions calendar, an 11-band weekly grid, and a per-date daily
calendar for a full term. Porting it is explicitly a Tier 2 task and it should be a
**one-shot script in `tools/`, never a runtime loader.**

Nothing was committed for this request. The repo is clean at the tier1 commit.

## Standing constraints — do not break these

- **The design-approval gate is lifted.** The user said "I approve" on 2026-08-28.
  Don't re-ask for design sign-off. But **if a decision is revised, update the docs**
  rather than letting it live only in conversation.
- `ANTHROPIC_API_KEY` is read from env server-side at boot and **must never reach the
  client.**
- **The internal grading draw must never leave the server** — not to the client, not
  to the narrator. A CI leak test enforces this at Tier 2. Allowlisted: `confidence`
  and the `likelyRange` endpoints. Draw values and resolved-but-unrevealed scores
  stay in.
- The free-text clamp allowlist **must exclude GPA, credits, romance stage, and
  anything in a syllabus.**
- The creation block **must not go into the frozen system prompt** (prompt-cache
  correctness).
- **Min-maxing is a FEATURE.** Never "fix" it by making handicap builds unbuildable.
  The rule is *no build is strictly stronger*; a build that is worse overall is hard
  mode and someone chose it.
- **`Math.random`, `Date.now`, `new Date`, `performance.now`, `crypto.randomUUID`
  and node builtins appear nowhere in `engine/`.** `engine` imports neither
  `narrator` nor `content`'s loader. The client holds **zero game rules.** Enforced
  by `packages/engine/test/purity.test.ts`, which is a grep test, not ESLint. That
  same file asserts the four deleted attribute names (Intellect, Discipline,
  Charisma, Resilience) appear nowhere — **it will fail on an innocent code comment
  containing the word "discipline"**, which has happened.
- Content is not state; saves pin a content hash. `GameState = replay(seed, actions[])`.
- Server-authoritative. The client asks and draws; it never computes.

## Mechanics you will get wrong if you guess

- **Eleven fixed time bands per day**, each subdividing into **halves — 22 per day is
  the hard floor of granularity, never quarters, never minutes.** Four anchors
  (wakeup 0, breakfast 1, lunch 4, dinner 8), six discretionary (2,3,5,6,7,9),
  Night = band 10.
- **Spin-up cost is not a mechanic — it is one authored `curve` array per activity.**
  `curve[halves-1]` = hours banked by a session of that length. A linear
  `max(0, d − spinUp) × rate` **provably cannot** satisfy both "a half-band banks
  nothing" and "1.5 bands = 1.7× one band"; an array can. There is no `spinUp` field
  anywhere. The shipped study curve `[0.0, 1.0, 1.7, 2.3, 2.8, 3.2]` is **concave
  past two bands** — per-band yield peaks near a two-band session, which is what
  keeps "study every free band" the maximal play without making it dominant.
  Slogan: **continuity beats duration.**
- **Meals are soft anchors priced by one number, `bandsSinceFood`.** "The cost is the
  gap, not the meal." Snacks **defer, never restore**, and pay less each time. The
  long-run cost lands on `Condition`.
- **Condition is the Stress-recovery rate**: `rate = 0.5 + condition/100`. Cutting
  the morning run is a loan against the rest of the term.
- **Grading is hidden; the bracket is shown.** Letters are engine internals. Players
  see banked hours, a readiness bar, a likely range with a floor, and what the next
  block buys. The T−2 letter roll is reframed diegetically as **the practice exam**.
- **Two gaps, never conflated.** *Demand gap* (course − you) = how big the hill, runs
  through a **convex** hours multiplier: −2→×0.75 · −1→×0.85 · 0→×1.0 · +1→×1.25 ·
  +2→×1.7 · +3→×2.4 · +4→×3.5 · **+5+ = not survivable**. *Partner gap* (joint study)
  = how fast you climb: **+3 or more→×0** (you cannot collaborate) · +1..+2→×1.6 ·
  0→×1.35 · −1..−2→×1.05 · −3 or less→×0.8.
- **Seven closed subject tags:** `math · stats · code · writing · reading · lab ·
  discussion`. Closed because ~120 course stubs carry them.
- **All four attributes are deleted** (revision 9). Creation is a **priced trait
  economy** (revision 10, Project Zomboid as the reference): points buy nothing but
  traits, and subject levels are *derived* from the build via subject tags.
- **Prices validate, they do not generate.** `cost = round(schedule(shape) ×
  weight(tag))`; the authored `cost` field is a checked assertion with ±1 tolerance.
  Costs round up, refunds round down, and refunds must be **concave** with a hard +2
  max per trait — a rising refund rate is a points farm.
- **Three tag namespaces that must never merge:** `affects` = subject tags · `tags` =
  kind tags (`language`, `international`) · **dispositions are NPC-only**
  (`mentor type`, `guarded at first`). `affinity.ts` must not even import the
  disposition table.
- **`error` vs `note` severity: nothing in this game forbids you.** A half-band of
  study is legal, banks nothing, says so, and resolves. Errors are reserved for plans
  that are not plans (overlaps, a run at midnight, a session after bedtime).
- **The canvas is fixed at 100 × 34** (`FRAME` = 99 × 33). The app refuses to draw
  below it, every pane has a fixed height, alternate screen buffer. A reflowing
  layout has no shape. It is sized for the **day planner**, not for creation. This is
  historical context only: r14 moves the active interface to responsive HTML/CSS.

## Two things deliberately left broken at Tier 1

Both are **pinned as assertions** in `packages/content/test/balance.test.ts` with
loud comments, and written up in `ARCHITECTURE.md` §11.2. Do not "fix" them by
tuning numbers.

1. **Skipping lunch is a net win.** The gap clock does bite — the stolen band is paid
   at a lower multiplier and hours-per-band drops — but total hours still *rise*
   (155.7 vs 129 over thirty days) and coursework is paid in total hours. The missing
   half of the price is Tier 3's. **When Tier 3 lands, that assertion must be
   INVERTED, not deleted.**
2. **Stress has no source.** Only the night-owl strategy ends above 50; routine,
   continuous and grinder all finish under 10. `sleepStressPerBand` is therefore
   untuned. Tuning it now would fit it to an empty world — it waits for Tier 2's
   deadlines.

Also placeholder-by-design: **`tagWeights` in `content/rules.yaml`** is a labelled
placeholder that Tier 2 deletes in favour of the requirement-coverage join.
**`content/activities.yaml` is my draft awaiting the user's review** — its numbers
are difficulty levers and are meant to move, which is why the engine tests use
hand-built fixtures instead of shipped content.

## Working with this user

- **Be token-economical.** They said so explicitly: *"Don't eat all my tokens for the
  day."* Few tool calls, brief reports.
- **They design.** Revisions 6, 7, 10 and 11 were largely their own passes, and their
  hand-built artifacts have overridden my inferences three times. Ask for their files
  early and treat them as authoritative.
- **They corrected me once on loop granularity** ("it is not a 'week loop'") — check
  pacing and granularity assumptions rather than defaulting.
- Sequence they like: design doc → approve → branch → commit → PR → merge.

## Machine and tooling facts

- **Python is NOT installed.** Use `node -e` for batch edits; a `python` heredoc will
  fail.
- The auto-mode permission classifier **blocks chained git commands and
  `git push -u`** — issue them one at a time.
- Windows 11, Git Bash as the shell. `unzip` is available.
- Stack: Fastify + Zod + better-sqlite3 + React/Vite (browser client) + npm workspaces.
  Ink and the terminal launcher scripts have been removed entirely.

## Loose ends, smallest first

- `tier0` and `design/r7` are fully merged and still on the remote; deletable at the
  user's discretion.
- Cosmetic: `git add --renormalize .` for two CRLF-stored design docs.
- **Open design thread the user raised and I never answered:** *"We need to think
  about the course and concentration selection."* §4.6 (shopping week), §9.1–9.5
  (requirements, feasibility, declaration) and revision 11's `demands` readout
  already cover a good part of it — **show them what exists before designing anything
  new.**
- Do **not** grow the trait pool yet; prices need Tier 2's requirement-coverage join
  to be meaningful.
