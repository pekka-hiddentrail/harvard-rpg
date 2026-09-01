# Harvard RPG — Game Design Document

**Status:** revision 13, approved. Tiers 0 and 1 are built; see `ARCHITECTURE.md` §11 for the
plan and §11.2 for what Tier 1 shipped — including the two claims below that the shipped
numbers do **not** yet satisfy (skipping meals is still a net win; Stress has no source).
**Working title:** *Veritas* (placeholder)

Revision history:
- **r2** — the loop is a daily calendar, not a weekly planner (§3). Added the
  narration budget (§5), relationships and romance (§7), extension plan (§11).
- **r3** — added the academic spine (§4): syllabi are authored, play-invariant
  single source of truth. This cascades into attendance mechanics, shopping week,
  and replayability-through-mastery.
- **r4** — incorporated findings from the hand-run prototype (§1.1). NPCs get
  fixed traits and real schedules, and the engine resolves scene casts, which
  closes the Marcus/Carl bug class (§7.1-7.2). Added Affinity (§7.4), made
  `ambiguous` a legitimate ending rather than a waypoint (§7.5), and restored the
  Chronicle with the context-degradation rationale (§5.1).
- **r5** — **read the prototype's actual files** (`exam_matrix.md`,
  `pekka_journal.md`, `harvard_campus_map.xlsx`). Three material corrections to my
  own design, all in the prototype's favour: grading is replaced by the **study-hour
  exam matrix** (§4.4), the day is **a grid of eleven time bands — six of them
  discretionary — not three slots** (§3.1), and
  **standing commitments** become a first-class player-authored object that the game
  is about breaking (§3.4). Also: the NPC pool is two-tier and an order of magnitude
  larger than I budgeted (§7.1), venues have real sizes and a known-fraction (§7.2),
  and the trait vocabulary for Affinity is no longer a sketch — the prototype
  already has one (§7.4).
- **r6** — the player's design pass. **Grading goes under the hood** — the letter
  matrix survives as engine internals, but the player never sees letters; they see
  what hours buy (§4.4). **Joint study becomes a competence-band mechanic** rather
  than a flat 1.5× — a partner can be too far ahead to collaborate with, and a
  session can be worth nothing (§4.5). **Meals stop being anchors to click through**
  and become the surface where study sessions are negotiated (§3.5). **The calendar
  becomes an editable object** with recurring, one-off, multi-band and multi-day
  events (§3.6). **The social graph grows on a saturation curve** keyed to venue size
  (§7.2), and **NPC traits change the player** (§7.7). And the biggest addition:
  **the study plan is its own system** — tracks, requirement graphs, feasibility
  (§9), which also settles the start date and the exchange-student question (§9.5).
- **r7** — the player's second pass, and it is mostly about *granularity*. **Bands
  subdivide into halves**, so an activity can run 1.5 bands, and a leftover half-band
  is useful for some things and worthless for others — which turns out to be the same
  spin-up argument that justifies joint study (§3.1). **Meals become spendable**
  rather than fixed: skip them, move them, snack against them, or stretch one into a
  two-band dinner out (§3.5). **The forecast gains a confidence axis** — the range
  width becomes a first-class readout, so "it could be a B− or a D+, I genuinely
  can't tell" is a playable state and a reason to study that isn't "raise the mean"
  (§4.4). And **the interface is a text UI** — full-screen, monospace, keyboard,
  ASCII calendars, numbered choices (§12).
- **r8** — four gaps closed, all of which were quietly blocking work. **You build a
  character** and Pekka ships as a preset, because Affinity runs on the player's own
  trait set and a fixed one means a fixed social graph forever (§7.8). **Failing has
  consequences** — academic probation with an advisor scene, an extracurricular cap and
  a permanent record, but no game over (§4.10). **Syllabi are drafted then reviewed then
  committed**, and §4.7 now says plainly that play-invariance is a rule about runtime,
  not about who typed the first draft. **Tone is dry and observant** (§5.4), with the
  romance track and epilogues as the deliberate exception. Also a cleanup pass on §8:
  money is gone, `Health`/`Wellbeing`/`Condition` collapse into one axis, and the four
  attributes are flagged as unearned and due for deletion.
- **r9** — **the four attributes are deleted**, and the game is better for it (§8).
  `Intellect` becomes **starting per-subject levels**, point-bought at creation on a
  zero-sum budget, so a background produces an academic *shape* rather than a bonus
  (§7.8). `Discipline` and `Charisma` were already implemented as traits in §7.7's own
  text. And `Resilience` becomes **Condition driving Stress recovery** — which makes the
  daily wakeup run your stress buffer, and turns the prototype's most routine habit into
  a real allocation decision. Nothing was invented: four stats were removed and one
  existing habit was given a consequence.
- **r10** — **character creation becomes a priced trait economy**, on the Project Zomboid
  model the player named (§7.8). Traits cost points and hindrances refund them, so a build is
  assembled by choosing what you are willing to be bad at. Two consequences follow. Points
  now buy **nothing but traits** — starting subject levels are *derived* from the build via
  **subject tags**, finishing the job r9 started, since there is no longer any number in the
  game a point can be placed on. And **min-maxing is explicitly a feature**: a dumb jock
  reading CS, or an environmentalist reading Government, should be buildable and hard, so the
  rule is not "no build is stronger" but **no build is strictly stronger**. What guarantees
  a hindrance bites is not a balance pass but §9.1's college requirements — you cannot dodge
  a math-tagged course at Harvard, so `bad with numbers` is a bet with a due date. Separately,
  **Affinity gains a second tier** (§7.4): traits carry **kind tags**, so two people who speak
  different non-English languages bond over *being multilingual* — which repairs a real
  sparsity flaw, since exact matching alone left most of a 115-person cast at zero.
- **r11** — **courses gain a level, and prices gain a schedule.** r10 gave the player a
  level per subject tag but left courses holding a single `difficulty` number, so a
  handicap was a flat tax that never escalated. §4.1 adds `demands: {tag: level}` and §4.5
  adds the **demand gap** — a *convex* hours multiplier, because the further into a subject
  you go the less you can survive not knowing what a fraction is. Two things fall out for
  free: prerequisites become mechanical rather than a permission check, and shopping week
  finally has a real number to print. §4.5 is also renamed, because there are now **two
  gaps and they must not be confused** — the demand gap says how big the hill is, the
  partner gap (r6's competence band) says how fast you climb it. Reach stops being an
  authoring problem: a trait needs one primary tag and at most one secondary, because
  CS 50 demanding `math: 1` is what carries `bad with numbers` into a course that never
  mentions it — **reach is emergent from how courses are tagged**. §7.8 gains the player's
  own **cost schedule**, corrected on one point: their refund side paid *more* points per
  level of damage the deeper you went, which is a points farm, so refunds are concave and
  capped at +2. Costs are `schedule(shape) × weight(tag)`, and the weight is **derived** —
  subject tags by requirement coverage, kind tags by rarity against the live pool — which
  reuses the r10 invariant's own join, so the query that proves a hindrance bites is the
  query that prices it. `international student` becomes a **parent trait with a mandatory
  child** (`Nordic`, `East Asian`, …), feeding both Affinity tiers from one structure.
  And the player's *"social tags but NPC only"* resolves into a **third namespace**:
  symmetric facts are kind tags, behaviours (`mentor type`, `guarded at first`) are
  **dispositions** and never bond, because a player holding `mentor type` would gain
  Affinity with every mentor in the cast.
- **r13** — **the canvas is fixed, and the game opens its own window** (§12). The first
  revision written *after* playing rather than before: Tier 0 shipped, creation was
  played, and the complaints were all one complaint. A layout that adapts to the terminal
  is a layout with no shape, so the screen is now 100 × 34, declared once, opened at that
  size by the launcher, and **refused below it** — with a card naming the shortfall, since
  a squeezed screen reads as a broken game rather than a small window. Every pane gets a
  fixed height for the same reason. No mechanic changed; the game just stopped moving
  while being looked at. (r12 was `ARCHITECTURE.md` only — the tier plan.)
- **r14** — **the interface moves to HTML.** Playing the ASCII prototype made the actual
  problem plain: a fixed terminal canvas makes every visual change expensive and constrains
  the game to the terminal's weakest affordances. The client remains a thin React renderer
  over the existing HTTP view models, but is now semantic HTML and CSS in a browser window.
  The day planner still needs a stable spatial layout, information-dense choices, visible
  costs rather than outcomes, and clear scene mode changes; those are interaction rules,
  not terminal rules. Ink, the alternate screen buffer, ASCII art, and the 100 × 34 terminal
  constraint are retired from the active design.
- **r15** — **the grading matrix is replaced, not ported.** r6-r7 kept the prototype's
  matrix as internals ("a cheap way to get a bounded distribution with the right shape")
  without ever specifying it; building it surfaced that the specified shape (a mean that
  moves with hours, plus noise) contradicts §4.4's own claim that hours *narrow the range*
  rather than *move the center*. The shipped mechanic takes that claim literally instead:
  a fixed number of integer "cards", each in a range set by the bracket band you're in
  (narrow ±1, moderate ±2, wide ±3-or-4 — the prototype's three-band table collapses to
  two thresholds, not three), always centered on zero. Points per card (`0→1.0, ±1→0.75,
  ±2→0.5, ±3/±4→0`) average linearly into a percentage — no mean-shift formula, and
  correspondingly no separate `readiness` bar distinct from `confidence`; the band *is*
  the whole readout. **The two-day crisis is now a hard T-48h rule with no early path.**
  §4.4's "a player who wants that moment earlier can buy it" is withdrawn — modeling it
  showed that triggering the draw before T-48h can only shrink your own bumping window,
  which is strictly worse for the player, never better. A practice exam or 1-on-1 review
  is instead just a study session with the highest support multiplier available; hours
  spent in the last 48 hours no longer bank pool progress at all, they only **bump**
  already-drawn cards toward zero, worst-scoring-card first (a card at ±3/±4 scores
  nothing until it reaches ±2, so a lone ±4 is deliberately serviced last). `effort`
  (§4.1's `demand` scalar) and the per-item bracket thresholds are now **derived** from
  `meetings`/`estHours`/`demands` rather than hand-authored — the only per-course number
  a human still picks is `demands` itself, which is what makes ~120 future courses
  tractable (§4.6). Levels (§7.8's starting values) now **move**: a hands-on hour-cost
  curve (100 h per level above zero, `100·|x|` to climb out of a hindrance below it) and
  a 0.6 base accrual rate, discounted to half for study unconnected to any enrolled
  course's demand, and multiplied up by joint study, tutoring, or simply attending a
  class (×1.25 — showing up counts). One real hour now feeds two ledgers at once: the
  course's grading pool in full, and every demanded tag's level ledger split by the same
  demand-weight ratio that prices the demand gap. A copied problem set still completes
  the assignment (per r6) but now grades flatly at a C rather than scaling with the
  (nonexistent) real hours behind it. See `packages/engine/src/{demands,levels,effort,
  grading}.ts` for the implementation and `ARCHITECTURE.md` §11.2 for what's still
  unimplemented (probation's triggering condition is designed at §4.10 but not wired up;
  `resettable` (§4.1) and the requirement solver are explicitly Tier 3/4).

---

## 1. The pitch

You are a freshman at Harvard. Over the course of a year — day by day, from
move-in to spring finals — you must pass your courses while staying solvent,
sane, and connected to other people. The degree is the long win condition; how
you spend Tuesday is the game.

Everything affects everything. There is no move that only costs time.

### 1.1 This design is not speculative

A version of this game has already been played. The prototype was run **by hand**:
the player kept the calendar, the course schedules, the problem-set hour
estimates, and the relationship state in Excel and markdown files, and used an LLM
as the narrator on top of that.

It worked — the day-to-day allocation and "surviving university" was the fun part —
and it stopped for one reason: **the bookkeeping was manual and exhausting.**

So the project is not "design a life sim." It is:

> **Replace the human engine with code, and keep the part the LLM was already good
> at.**

That reframing is why §2 below is stated so absolutely. In the prototype the
simulation *already* owned all state — a person owned it, in a spreadsheet — and
the LLM was structurally incapable of corrupting it. Every failure the prototype
did hit came from the model being asked to do bookkeeping anyway: mixing up which
student was in which course (§7.1), and degrading as its context grew (§5.1). Both
are addressed by construction rather than by better prompting.

**The artifacts, and what they are.** Three files, covering Aug 2027 – Nov 2027 of
in-game time (roughly ten playable weeks):

| File | What it actually is |
|---|---|
| `harvard_campus_map.xlsx` | Not a map. Eight sheets: 114 students, 30 faculty, 13 off-campus contacts, addresses, an 8-semester course plan, a four-year traditions calendar, a weekly time-band grid, and a day-by-day term calendar. **This is the state model and the content schema, written by someone who needed it.** |
| `exam_matrix.md` | A complete, evolved, playtested **grading mechanic**. It is better than the one I designed. §4.4 runs on it — as internals: r6 keeps the arithmetic and hides the letters. |
| `pekka_journal.md` | The play log — ~90 dated entries. The pacing evidence: what a day actually contains, and how often. |

Two things to read out of them that don't appear in any single cell.

**The corrections are the cost.** In ten weeks of play the journal records at least
six explicit bookkeeping repairs: a course meeting on the wrong weekday
(*"Correction to earlier plan: CS50 lecture is actually MW 1:30pm, not Tuesday"*), a
section move needing a retcon note, a misspelled classmate, two name collisions
resolved by renaming a person mid-story, and a rule applied retroactively at the
player's request. Every one of these is something the engine cannot get wrong. That
list is the deliverable, stated as a defect log.

**The design is already balanced, and by accident it proves itself.** Family Weekend
(Oct 15–17) cost effectively zero study hours across three days — two days before
the Psych 15 roll point. The grading model then returned a **D**. The next two days
went entirely to Psych and clawed it back to **C+**. Nobody designed that arc; it
fell out of hours, a deadline, and a person the player cared about. That is the
whole game, and it already works. See §4.4 and §7.5.

---

## 2. The core design principle

> **The simulation owns all state and all consequences. The LLM only ever
> renders and interprets.**

LLMs are excellent at texture — prose, a roommate's specific voice, the exact
humiliating detail of a bad section. They are unreliable at bookkeeping —
numbers, continuity, rule enforcement, saying no.

So the LLM is never asked "what happens next?" It is asked "here is what
happens; write it." Every stat change is computed by deterministic code from
authored data. The model dresses pre-costed outcomes.

The one exception is the free-text valve (§6.3), where the model's output is
schema-constrained and its numbers are clamped by the engine before they touch
state.

---

## 3. The loop is a calendar

The unit of play is **the day**. Real dates, real days of the week, a real
academic calendar from Opening Days in late August through spring finals in May.
Thursday means something. A deadline on the 14th means something on the 12th.

### 3.1 The day is a grid of time bands

**Correction from r4, on the evidence of the prototype's weekly grid.** I had three
slots — Morning, Afternoon, Evening. The prototype ran on **eleven fixed time
bands**, and the player called the granularity the point.

The bands, taken directly from the prototype's `Fall 2027 Weekly Grid` sheet:

```
07:15 / 08:15   wakeup            (anchor — the run)
08:00 – 09:45   shower+breakfast  (anchor)
09:00 – 10:15   ┐
10:30 – 11:45   │
12:00 – 13:15   lunch             (anchor)
13:30 – 14:45   ├─ discretionary unless a class or standing
15:00 – 16:15   │  commitment occupies the band
16:45 – 17:30   │
18:00 – 19:30   dinner            (anchor)
19:30 – 21:00   │
21:00+          ┘  (the Night band — sleep, or borrow Energy against tomorrow)
```

Three anchors (meals, wakeup) are near-fixed in *time* — you will eat lunch — which
leaves **six discretionary bands plus Night**, of which fixed commitments —
lectures, sections, standing club sessions — occupy some before you get to choose.

**r6 correction: the anchors are not filler.** I had them as cheap clicks. They are
the opposite — a meal is the highest-value social band in the day, because it is
where the *other* bands get negotiated (§3.5).

Why this beats three slots: it is the only granularity that can express what the
prototype's journal actually recorded. *"6–8am: 2 real hours plus 1 hour of rushed
scribbling"*; *"2hr joint session (2-4pm), dinner, 3hr solo study (6-9pm), 1hr Essay
Two (9-10pm)."* That is four separate allocations between lunch and sleep. Three
slots cannot represent it, and since §4.4 makes **hours** the game's universal
currency, a slot that can't be priced in hours is not usable.

Each band allocation is `{ band, activity, target?, withPeople? }` and yields hours.

Activities: attend / skip a fixed commitment · work a specific assignment · study
for a specific assessment · reading · office hours · extracurricular · work shift ·
meals with specific people · parties and events · exercise · rest · errands.

`withPeople` is not decoration — it changes the arithmetic twice over (§4.4 joint
study, §7.4 Affinity), which is what makes "study with Amelia" a genuinely
different move from "study."

#### Half-bands, and why 1.5 bands is not 1.5× a band

**r7.** A band is not the smallest unit; **a half-band is.** Twenty-two halves a day,
and that is the floor — never quarters, never minutes. An activity declares how long
it runs, and something that runs 1.5 bands takes the whole of one and **the first half
of the next**, leaving a half-band behind it.

The interesting part is what that leftover half is worth, which depends entirely on
what you try to put in it:

| | Usable in a half-band | Why |
|---|---|---|
| snack, errand, email, a walk, a short conversation | **yes** | no setup; the whole activity fits |
| reading, review of notes already open | **yes, at full rate** | already spun up |
| a problem set, an essay session, a joint study block | **no — yields ≈0 h** | the first half-band is spent getting into it |
| a lecture, a section, a gym session, a long run | **no** | fixed length, set by the world |

That distinction is a **spin-up cost**, and it is the single rule that makes half-bands
worth having. Study has a fixed cost to start: finding the seat, opening the notes,
remembering where you were. So:

- Starting a study session in a leftover half-band produces almost nothing. The half
  is real time and it buys you nothing academic. This is the honest version of the
  prototype's own journal line — *"15-minute solo Psych study attempt failed
  completely."*
- **Overrunning** a study session into the next half-band is the *cheapest* hour in
  the game, because you are already spun up. `1.5 bands ≈ 1.7× the output of 1 band.`
- Which produces a real decision every time a soft event sits after a study block:
  *run long and be late to the run, or stop clean and waste the half?*

Note the shape: it is the same argument as §4.5. Two hours with the right partner
beats three hours alone; one and a half bands in a row beats two bands split up.
**Continuity is worth more than duration**, in company and in time both. A player who
learns that one rule plays the whole game better, which is exactly what a rule should
earn.

Anything the world imposes — lectures, sections, the Sunday long run — is authored at
its real length, and the prototype already has 1.5-band and 2-band examples: the
Thursday CS 50 section runs 13:30–16:15, and the HCRC long run is a flat 1.5 hours.
Half-bands are not a new abstraction; they are what the prototype's grid already
contained.

### 3.2 The asymmetry is the game

Fixed commitments load the weekdays. Read straight off the prototype's grid:
Monday leaves **two** free bands before dinner, Tuesday leaves **four**, Friday
leaves **five**, Saturday leaves nearly all of them.

That asymmetry is the engine of the central tension: **weekdays belong to your
courses; weekends are the only currency you have for people.** And because the
weekly grid is derived from your enrolled courses, *your course list determines how
much of your week is yours* — which is a shopping-week consequence you can compute
and show the player in advance (§4.6).

A day is still 2-3 clicks in the common case, because the standing routine (§3.4)
pre-fills it. The puzzle emerges *across* days, from a calendar that accumulates
from authored data you can read in advance.

**The density read.** Because the grid is derived, the engine can classify every day
in the term before you play it, and this should be a first-class view rather than
something the player reconstructs by squinting:

| Free bands | Reading |
|---|---|
| 5–7 | **open** — the only days a long solo push or a trip is possible |
| 3–4 | **workable** — one real study block, or one social thing, not both |
| 1–2 | **squeezed** — maintenance only; anything ambitious here comes out of Night |
| 0 | **gone** — the day is spent before it starts |

Two things follow. First, the *shape* of a week is legible at a glance, so "I have
four hours to place and only Tuesday and Saturday can hold them" becomes a plan
instead of a discovery. Second, it gives shopping week a number that matters as much
as workload hours: a course set that leaves you three open days a fortnight is a
different life from one that leaves you none, even at identical total hours.

### 3.3 Time compression

Not every day is played. Breaks and stretches with no live triggers can be
**fast-forwarded** — the engine resolves them under your standing routine and
reports a summary. Fast-forward stops on any triggered beat and on any approaching
deadline, so you can always skip *toward* the next thing that matters.

This is a core feature, not a convenience: ~180 playable days is a lot of turns,
and manually clicking through a dead Wednesday in February is not a game.

### 3.4 Standing commitments: the promises you break

In r4 I treated the standing routine as a fast-forward convenience. The prototype
shows it is a **mechanic**, and one of the best ones available.

The player declares weekly commitments in hours:

```yaml
standing:
  - { hours: 2, per: week, target: psych15,        label: "Psych study" }
  - { hours: 2, per: week, target: math21b,        label: "extra Math practice" }
  - { hours: 4, per: week, target: cs50.final,     label: "CS50 project",
      of_which: { hours: 1, band: "Tue 13:30", withPeople: [james, clara, callum] } }
```

Then the game is about **failing to keep them.** Straight from the prototype's
`Study Plan` column, in the player's own words:

```
Oct 26  Reallocated 3hrs from planned Psych study to Essay Two.
Oct 27  Psych reading REDUCED to 0hrs today -- reallocated to Essay Two.
Oct 30  Psych reading REDUCED to 0.5hrs (was 2hrs) -- 1.5hrs reallocated.
Oct 31  Essay Two finalization (2hrs) + Psych extra reading (2hrs) --
        both standing plans fulfilled.
```

That is a person negotiating with themselves for a week and then, on the last day,
squaring the books. The engine tracks **planned vs. actual per commitment** and
surfaces the running deficit, which does three things a bare routine cannot:

- It makes a broken promise *visible and named* rather than a silent absence. The
  cost of skipping Psych is not "less Psych" — it's a debt with a label on it.
- It gives Tier 0 days real content: the log line reports which commitments held.
- It gives the narrator a fact worth writing about. "Third week you've cut Psych
  for the essay" is authored specificity, arrived at by arithmetic.

Commitments are also how a club becomes a burden rather than a menu item: the
prototype's running club (Wed/Fri official, Tue optional, Sunday long run) is four
recurring band occupations, and the player *missed them under pressure* and logged
it. Joining a thing means the thing takes bands whether you want it to or not.

**r9: one standing commitment is not like the others.** The daily wakeup run and the
Saturday gym feed `Condition`, and Condition sets how fast Stress falls (§8). So cutting
the run is the one deficit that makes *every other* deficit harder to absorb — it is a
loan against the rest of the term, taken out in the week you can least afford it. The
prototype's grid has a wakeup run on all seven days and never questions it; r9 is what
makes that habit a decision instead of a formality.

### 3.5 Meals: where the good study sessions get bought

Three meal bands a day, ~500 meals a year. In r5 they were anchors you clicked
through. They should be the most mechanically important bands in the game, for one
reason: **joint study is more effective than solo study (§4.5), and you cannot join
a session you did not arrange.**

A meal is a short, cheap, low-stakes decision with three parts:

```yaml
{ band: "12:00", activity: meal,
  venue: annenberg,          # or a house dining hall, grab-and-go, or skip
  sitWith: [amelia, wei] }   # chosen from whoever the engine resolves as present
```

Who is *available* to sit with is `cast.ts` output, never a choice (§7.1). Who you
*sit with* is the choice. And what the band produces, beyond Energy and a little
Warmth, is the thing that matters: **arrangements.**

**An arrangement is a promise with a band attached.**

```yaml
arrangement:
  id: arr_0114
  what: study
  target: cs50.ps4
  when: { date: 2027-10-15, band: "19:30" }
  where: lamont
  with: [amelia, wei]
  madeAt: { date: 2027-10-13, band: "12:00" }   # lunch, two days earlier
  state: pending        # → held | broken_by_player | broken_by_them | rescheduled
```

Arrangements are the pipeline that feeds §4.5, and that makes the whole system a
loop rather than a menu:

- **Lunch buys Thursday evening.** The hours you get on Thursday were decided on
  Tuesday, by sitting with the right people and asking. Skipping meals to study is
  therefore *self-defeating over a week* — you gain an hour now and lose the 1.5×
  later — which is a much better argument for eating than an Energy penalty.
- **You can be turned down.** An NPC with their own crunch week (§7.2), low Warmth,
  or a conflicting band says no. A refusal is cheap and non-punitive, and it is
  information: it tells you who is actually available to you.
- **Arrangements break, in both directions.** You bail because an essay ate the
  evening; they bail because their own midterm did. A broken arrangement converts
  the band to solo study at 1.0× and costs Warmth — and *who broke it* is the fact
  the narrator gets handed. This is the §3.4 broken-promise mechanic pointed at a
  person instead of a subject, and it is where the emotional stakes actually live.
- **Recurring arrangements become standing commitments.** The prototype's Tuesday
  CS50 sync with three named people started as one arrangement and turned into a
  fixture. Promoting an arrangement to a recurring calendar event (§3.6) is one
  click, and from then on the game can start taking it away from you.

Meals also carry the **table-composition** effect. Sitting with the same three people
every day is efficient for Warmth and terrible for your network (§7.2); sitting
somewhere new is the reverse. That is a real allocation decision made 500 times, and
it costs no content to author.

#### Meal bands are soft, and that makes them a resource

**r7.** A meal band is not fixed — it is *pre-filled*, and you can spend it. Four
moves, each priced:

| Move | Band cost | What it costs you |
|---|---|---|
| **Eat** (default) | 1 band | nothing; resets the clock, buys the table |
| **Move** it a band earlier or later | 1 band, relocated | widens the gap on one side |
| **Convert** it to something else | frees 1 band | the gap, the table, and any arrangement that would have been made there |
| **Eat out** | 1.5 – 2 bands | the extra half or band, and the closed roster |

**The cost is the gap, not the meal.** The engine tracks one thing — bands elapsed
since you last ate — and that single number does all the work. Moving lunch one band
later is nearly free because the gap barely changes. Skipping lunch entirely means
breakfast to dinner on nothing, and the afternoon bands pay for it. This is better
than a flat per-meal penalty for two reasons: moving and skipping are correctly priced
*relative to each other* without a second rule, and the punishment lands on the bands
you were trying to steal, which is legible.

**Snacks defer; they do not restore.** A snack is a free micro-action inside any band
— it needs no allocation, it is available anywhere with a vending machine or a
grab-and-go, and it resets the gap clock for **about two bands**, then it stops working.
So a snack buys you an afternoon, never a day. Living on them is possible and the
system lets you, with one slow consequence: `Condition` drifts down. That axis already
exists — the prototype's player ran every morning and hit the gym Saturdays, and
`Condition` is what those bands were buying — so snacks having a home there costs no
new machinery, and it means the trade is *food for fitness*, over weeks, rather than a
scold.

**Eating out is the depth move.** A restaurant lunch or dinner is a 1.5- or 2-band
event, so it is expensive in exactly the currency the game is about. What it buys is
not more Warmth per band — it is a **closed table**. Nobody wanders up; the roster is
fixed when you book it. Money is explicitly a non-issue in this world (§1.1), so the
whole price is time and exclusion, and the effect is a clean inversion of the dining
hall: **Annenberg grows your network, a restaurant deepens two or three bonds.** It is
also where the §7.5 romance beats want to happen, and where an arrangement made over a
two-band dinner is much harder for either side to break.

### 3.6 The calendar is an object the player edits

The calendar is not a read-only projection of content. It is **a thing you author**,
with the affordances a real calendar has — because the prototype's player was
maintaining exactly this by hand in a spreadsheet, and the tedium of doing so is one
of the two reasons they stopped.

One event model covers everything:

```yaml
event:
  id: ev_0231
  title: "HCRC long run"
  kind: class | commitment | arrangement | personal | institutional | deadline
  when:
    # exactly one of:
    recur: { freq: weekly, days: [Wed, Fri], bands: ["16:45"],
             from: 2027-09-07, until: 2027-12-09 }
    once:  { date: 2027-10-15, bands: ["19:30", "21:00"] }   # multi-band
    span:  { from: 2027-11-24, to: 2027-11-28 }              # multi-day
  # r7: any of the above may carry a half-band tail
  startHalf: second          # optional; defaults to `first`
  bandLength: 1.5            # in bands, in units of 0.5 (§3.1)
  people: [ ... ]
  target: math21b            # optional: what hours from this event count toward
  hard: true                 # a lecture is hard; "extra Math practice" is not
  exceptions:
    - { date: 2027-10-21, action: cancelled }
    - { date: 2027-10-28, action: moved, toBands: ["19:30"] }
```

The pieces that earn their place:

- **`recur` with `exceptions`** is the one every hand-rolled calendar gets wrong.
  Skipping *this* Wednesday's run is not editing the recurrence; it is one exception
  on one date. Without this, breaking a standing commitment (§3.4) can't be
  represented, and breaking standing commitments is the game.
- **`bands` is a list**, so a lab, a rehearsal, a three-hour section, or an evening
  that ran long occupies contiguous bands as one event.
- **`startHalf` + `bandLength`** (r7) let an event occupy half-bands without a second
  event model. The Thursday CS 50 section is `bands: ["13:30", "15:00"]` with
  `bandLength: 2`; the Sunday long run is one band at `bandLength: 1.5`. Conflict
  detection therefore works on halves, and a half-band gap is visible in the grid
  rather than being silently rounded away.
- **`span` for multi-day** covers Family Weekend, Thanksgiving recess, Harvard–Yale,
  and reading period — the institutional events that don't decompose into bands and
  shouldn't have to.
- **`hard`** separates what you cannot move from what you merely promised. The
  engine only needs to warn you about conflicts between hard events; a soft conflict
  is just a decision.

Two layers, and the split matters:

| Layer | Source | Mutable | Example |
|---|---|---|---|
| **Institutional** | `content/` | no | term dates, lectures, deadlines, Housing Day |
| **Personal** | player actions, event-sourced | yes | study blocks, arrangements, club sessions, a trip home |

Institutional events are pinned by the content hash and identical in every
playthrough (§4.7). Personal events are actions in the log, so the calendar
participates in undo and replay for free.

**What the calendar view must do**, in rough priority order: show a week on the band
grid with density shading (§3.2); accept drag-to-move on soft events; flag hard
conflicts at creation rather than on the day; show deadlines as a rail down the side
with days-remaining; and let you *plan forward* — place a study block three weeks out
against a deadline you can already read. That last one is the whole reason syllabi
are play-invariant (§4.7). A player who cannot plan into a knowable future is not
being offered the game this design is about.

---

## 4. The academic spine

**Every course has a real syllabus, and the syllabus is the single source of
truth.** It is authored content, not generated, and it does not branch. Play
freshman year with the same course set and you get the same lectures on the same
dates, the same problem sets on the same topics, due on the same days, every
single time.

This is the most important structural idea in the design after §2.

### 4.1 What a syllabus contains

An ordered list of **sessions** (lectures and sections), each with a date and a
topic, and a list of **assignments**, each with an assigned date, a due date, an
estimated hour cost, a weight toward the final grade, and the sessions whose
material it depends on. Exams are assignments with a date and a coverage range.

**Revised since first written, to match what shipped.** Two things below moved out of
this example and into the engine, both for the same reason: a hand-typed absolute date is
one holiday away from being wrong, and the fix should live in one place, not be re-derived
per course. `sessions` carry no `date` — `fitSessions()` computes it from `meetings` against
the shared term calendar (`content/calendar/`), so a cancelled Monday simply doesn't consume
a session number. And `meetings` names a real block-schedule `pattern`/`time`, not a single
`band` string, because which of the three canonical slots (§3.1's `BLOCK_STARTS`) a section
lands on is a registration-time fact, not something a syllabus pins. Assignment dates follow
the same rule: `assigned`/`due`/`date` are `{ week, session }` (the Nth of the course's own
real meetings that term week) or `{ week, day }` (an explicit weekday, for a date outside the
course's own pattern — an evening exam, a reading-period deadline). See `CourseWeek` in
`packages/engine/src/schema.ts`.

```yaml
id: cs50
title: Introduction to Computer Science
demand: 7                            # r15 — derived at runtime, not hand-picked (§4.6);
workload_hint: "~12h/week"          # r15 — also derived. Both optional, and shown here as
                                     # what they evaluate to. A stub omits both, and omits
                                     # each office hour's `demand` too (one below the
                                     # course's, so authoring it says nothing new).
demands:                             # r11 — what the course asks of you, per tag
  code: 2
  math: 1
meetings:
  - { type: lecture, days: [Mon, Wed], time: "09:00-10:30", size: 850, attendance: flexible }
sessions:                            # dates computed by fitSessions(), never authored here
  - { n: 1, topic: "Scratch, and what a program is" }
  - { n: 2, topic: "C, types, and the compiler" }
  - { n: 3, topic: "Arrays, strings, and memory" }
assignments:
  - id: ps1
    title: "Problem Set 1 — Scratch"
    kind: pset
    assigned: { week: 1, session: 1 }
    due: { week: 2, session: 1 }
    est_hours: 6
    weight: 0.05
    depends_on_sessions: [1]
  - id: ps2
    title: "Problem Set 2 — Caesar"
    kind: pset
    assigned: { week: 2, session: 1 }
    due: { week: 3, session: 2 }
    est_hours: 9
    weight: 0.07
    depends_on_sessions: [2, 3]
  - id: midterm
    kind: exam                      # kind drives the hour target + bracket, §4.4
    date: { week: 8, day: "Thu" }   # an evening exam, outside the lecture pattern
    weight: 0.25
    covers_sessions: [1-12]
  - id: final_project
    kind: project
    assigned: { week: 8, day: "Sun" }
    due: { week: 15, day: "Mon" }    # reading period — past the term's last day of classes
    weight: 0.30
    brackets: { moderate: 15, narrow: 20 }   # override of the default 10/16
    stages:
      - { id: proposal, due: { week: 11, day: "Sun" } }
```

`kind` selects the exam-matrix defaults (§4.4): `pset` grades on completion,
`exam` rolls 8 letters, `final` 10, `project` 12, `essay` 4 per stage. `brackets`
overrides the hour thresholds per item — the prototype's one authored difficulty
dial, and the right one.

`size` on a meeting is not cosmetic; see §7.2.

**r11: `demands` is the field that makes a handicap escalate.** A course names the
**subject tags** it asks for and the **level** it asks at, so CS 50 wants `code` at 2 and
`math` at 1, while Math 21b wants `math` at 3 and nothing else. It is a profile rather than a
single difficulty number because multi-tag courses are the interesting ones: CS 50 is where a
`math` handicap ambushes someone who thought they were only signing up to program.

The tag set is **closed at thirteen** — `math` · `stats` · `code` · `writing` · `reading` ·
`lab` · `discussion` · `proof` · `visual` · `language` · `fieldwork` · `memorization` ·
`ethics` — and closed on purpose. Every course stub carries them, so adding a fourteenth
means revisiting all ~160 stubs; whereas the other two tag namespaces (§7.4) can grow freely.

It was seven until the real course set arrived and the seven visibly could not describe it:
Gen Ed 1046 "Race and Social Justice" wants `ethics` and `discussion`, Chem 17 wants `lab`
and `memorization`, and under the original seven both would have been mis-annotated as
`reading` and shrugged at. The widening is the exception that proves the rule about *when* a
closed set can be reopened: before the ~160 stubs were authored, when the migration cost was
six strings rather than six strings times a hundred and sixty files. The `language` tag
forced a matching rename in the other namespace — the kind tag formerly called `language` is
now `multilingual`, because §7.8 forbids one string serving both. `demand` survives alongside `demands` and keeps its old job: overall workload
weight, which is what shopping week compares. `demands` is about *whose* workload it is.

**Milestone reset.** The prototype allowed one genuinely interesting move: after a
bad conference, the player *changed an essay's subject* and the accumulated hours
were **halved** to reflect partial carryover (11.83 → 5.915). That's a real
mechanic — abandoning sunk work at a stated discount — and it's authorable per item:

```yaml
    resettable: { carryover: 0.5, before: 2026-11-02 }
```

### 4.2 What play changes, and what it doesn't

| Fixed by the syllabus | Determined by how you play |
|---|---|
| Which assignments exist | How many hours you put into each one |
| What they cover | Whether you attended the sessions they depend on |
| When they're due | Whether you started early or the night before |
| What each is worth | Whether you submitted late, or at all |
| When exams are and what they cover | Your Energy and Stress when you sat down |

The syllabus is the board. Play is how you move on it.

### 4.3 Attendance becomes a real mechanic

Because assignments declare `depends_on_sessions`, skipping lectures has a
specific, legible cost: **an assignment whose prerequisite sessions you missed
takes more hours to complete.** Miss the lecture on memory and Problem Set 2
costs 14 hours instead of 9.

This is pure engine arithmetic, it comes free from the syllabus structure, and it
reproduces the actual experience of falling behind — not a vague "attendance"
stat, but *this specific p-set is now brutal because of a Wednesday you slept
through three weeks ago.* Office hours partially recover the deficit, at the cost
of a slot.

### 4.4 Grades: hours in, readiness out

The mechanic's job is narrow and worth stating before the machinery: **show that work
makes a grade easier to reach.** Nothing more. Grades are not the drama; what you gave
up to get them is. So this section is deliberately the least visible system in the
game — it must be exact, computed, and quiet.

**r6 correction, and it reverses r5.** The prototype ran on a visible string of
letters (`C D D B D D D B`) and in r5 I wrote *"the letters are the UI."* That was
wrong. The alphabet is arbitrary — an artifact of a human needing dice they could
trust — and putting it on screen asks the player to learn a scoring system instead of
making a decision. What the player actually knows is *"I can work this much."* The
letters stay; they move **under the hood**.

#### The player-facing model

One reading per assessment, and it is the only academic number the UI leads with:

```
Psych 15 · Midterm 1 · Wed Oct 20            2 days out
  banked        11.5 h        (of ~16 h for a comfortable margin)
  readiness     ███████░░░    moderate
  confidence    low           — you have not seen a practice problem yet
  likely        D+ … B−       could be anything in there
  next step     +4.5 h  →     C … B−          and confidence: moderate
```

Five things, and each is a decision input rather than a score:

- **Banked hours** — what you have actually put in, with the target for a safe
  margin named. This is the number the player thinks in.
- **Readiness** — a bar, not a grade. Coarse on purpose.
- **Confidence** — how well you can estimate at all. See below; this is r7's addition
  and it is the one that makes the readout feel like being a student.
- **A likely range.** Ranges, never point estimates. A student two days out does not
  know their grade; they know roughly where they stand and how badly it could go.
- **What the next block buys.** The single most important line, because it is the
  actual choice: *is four and a half more hours worth the Saturday?* Sometimes the
  answer is visibly no — the range doesn't move — and that is the mechanic working.

#### Confidence: the second axis

**r7.** The forecast has two dimensions, and separating them is what makes it play:

| | Set by | What it is |
|---|---|---|
| **Position** | hours banked | where in the range you sit |
| **Confidence** | *what kind* of work you did | how wide the range is |

Hours move the middle. Confidence decides whether the estimate is `B− … B+` or
`D+ … B−`, and **low confidence is itself the pressure.** *"It could be a B− or a D+.
I can't tell. I have to work, and fast"* is a completely different feeling from "I need
four more hours," and it is the more accurate one — the true panic before an exam is
rarely knowing you'll do badly, it is not knowing.

What raises confidence is not volume, it is **contact with the actual assessment**:

- doing the practice problems or the past paper
- going to the review session or to office hours
- having studied *with* someone who has (§4.5 — your partner tells you what's on it)
- an attendance record that means you know what was emphasised (§4.3)

So the two axes reward different behaviour and neither substitutes for the other.
Grinding twelve solo hours off the syllabus gives you a good position you cannot
*trust*. One hour of past papers barely moves the position and collapses the range.
Both are real strategies, and a player who only ever does one of them is playing at a
disadvantage they can see.

Two states worth naming, because they are the whole point:

- **High confidence, low position.** You know exactly how badly this will go, and you
  know it early. That is a specific dread the game did not previously have available,
  and it is *actionable* — it is the state that makes someone cancel a weekend.
- **Low confidence, high position.** You have done the work and still can't tell. The
  right move is one cheap hour of practice problems, not four more of reading — and the
  `next step` line will say so.

Mechanically confidence *is* the volatility bracket from the prototype, promoted to
the surface and named. It was always the interesting half of that mechanic; r6 left it
hidden behind a readiness bar for no good reason. The bracket is now the readout.

**r15 correction.** Position and confidence are no longer two independently-set dials.
Banked hours pick *which band* you're in (§4.5's `moderate`/`narrow` thresholds); the
band alone then sets both the width of the outcome *and*, through the point table below,
its expected value — a wider band isn't just less certain, it's worse on average too,
because it includes more scoring-nothing outcomes. There's no separate mean-shift term:
narrowing the band is the entire mechanism, exactly as the sentence above always claimed,
which is what building it revealed the old two-axis description didn't actually satisfy.

#### Under the hood

The prototype's matrix does not survive as the implementation — building it surfaced
that the specified shape (hours move a mean, confidence sets noise around it) was never
consistent with "hours narrow the range, they don't raise it." What ships instead:

1. **Hours accumulate per course toward the next milestone**, with no gaps between
   milestones — same claim as before, but now two ledgers at once: the course's pool in
   full, and every demanded tag's level ledger split by the same demand-weight ratio
   that prices the demand gap (§4.5, §7.8). Sources: a study band at ×1.0, a joint
   session at a multiplier set by §4.5, simply attending a class at ×1.25, and **+1 h**
   per completed problem set, reading, or homework toward the pool specifically (a pset's
   own hours bank to the level ledger regardless, even though they never touch the pool).
2. **Hours buy a band**, not a score: under the item's `moderate` threshold is *wide*,
   at or above it but below `narrow` is *moderate*, at or above `narrow` is *narrow* —
   two thresholds, not three; a fourth, wider band was considered and dropped; wide
   absorbs it. The thresholds themselves are **derived**, not hand-set per item — see
   §4.6 — with a per-item override (the prototype used 15/20 for large open-ended
   projects) as the escape hatch for a genuine exception.
3. **At T-48h, and not one moment earlier, the hidden draw resolves**: N integer "cards",
   each drawn uniformly from `-range..range` where `range` is 1 (narrow), 2 (moderate),
   or 4 (wide) — N by type (8 midterm, 10 final, 12 major project, an essay's stages
   escalate 4, 5, 6…, capped at 8 as the course progresses). There is no early trigger:
   a practice exam or a 1-on-1 review only banks hours at a higher multiplier before this
   moment, it does not move the moment itself (see the two-day crisis, below).
4. **Each card scores points** — `0 → 1.0`, `±1 → 0.75`, `±2 → 0.5`, `±3` or `±4 → 0` —
   and the average of all N, times 100, **is** the percentage. Linear, no curve. Read off
   an authored letter table (evenly spaced, pass at 50%) for display.
5. **Hours after the draw no longer bank pool progress.** Every 2 hours instead **bumps**
   one card one step toward zero — whichever card is closest to its next *scoring*
   transition (a card at ±1, ±2 or ±3 always gains points from a bump; a card at ±4 gains
   nothing until it reaches ±3, so it's serviced last, never first). The level ledger
   keeps accruing from these same hours regardless — leveling never stops, an item's
   grading does, the moment its cards are drawn.

The band is the whole design in two rows: more hours doesn't raise your grade, it
*narrows the range you can land in* — and because the scoring curve punishes distance
from zero non-linearly, a narrower range is also a better one on average, not merely a
more certain one. That is both closer to how studying actually feels and a far better
incentive shape than a linear score, because it means an under-prepared player can get
lucky and a well-prepared one is merely safe. Luck is only available to people who left
room for it, and the room shrinks in an already-decided, non-adjustable proportion to
how many cards are drawn — averaging more cards over a wider band still under-performs
averaging fewer over a narrower one, so "more chances to get lucky" is never the better
strategy than actually banking the hours.

**The forecast never leaks the draw.** The range shown is derived from the *bracket*,
not from the resolved values. So the forecast is honest and un-gameable at the same
time: it tells you exactly what a real student knows, and no amount of staring at it
reveals the outcome.

#### The two-day crisis, kept

The prototype's best property was that a bad grade arrived *two days early* and became
a playable emergency rather than a verdict. That survives, and reads better without
letters. At T−2 the reading stops being a range and becomes a position — diegetically,
this is the practice exam, the past paper, the moment you sit down with a month of
notes and find out:

```
Oct 16   forecast                D+ … B−   confidence low     ← honest, and useless
Oct 18   practice exam           on this showing: D           ← the draw resolved
Oct 18   +6 h  (joint, Lamont)   → C−
Oct 19   +6.5 h                  → C
Oct 20   +2 h                    → C+                         ← final
```

Read the first two lines together, because that is the r7 shape: **the practice exam is
always better than the guess.** For two weeks you have a range you cannot act on
precisely; then you sit the past paper and the range collapses to a position, and it is
worse than the middle of your guess. The information and the bad news arrive in the
same moment, which is why it works as a crisis rather than a status update.

**r15 withdraws the last sentence of the paragraph above.** r7 said a player could buy
that moment earlier; modeling it showed the opposite is true. The draw is fixed at
T-48h and nowhere else — triggering it sooner would only shrink the 48 hours of
bumping left to recover in, which is strictly worse for the player, never better. A
practice exam or a 1-on-1 review is still worth doing early, but as *the highest
support-multiplier study session available*, banking more effective hours into the pool
before the fixed moment arrives — not as a way to see the moment sooner.

That is the prototype's real Psych recovery, same arithmetic, same three days, no
alphabet. And the diminishing returns still land where they landed: a later two-hour
push on an essay moved it inside a grade band and *did not reach the next boundary* —
visible, honest, and it hurt without a word of prose.

Two consequences of hiding the letters, both improvements:

- **The shift-placement decision disappears, and nothing is lost.** In r5 the player
  chose which letter a shift improved. A rational player always picks the same one,
  so it was bookkeeping wearing the costume of a choice. The engine applies it. One
  fewer route, one fewer screen.
- **The mechanic can be retuned without retraining the player.** Nobody has memorised
  a scoring table, so the bracket thresholds, the draw counts, and the conversion
  curve are all free to change during balancing. That matters a lot at milestone 3.

**Determinism, and the one thing not to port.** The prototype went to elaborate
lengths for randomness the *human player* could not bias — a fixed word pool, 20
random words filtered to a–e, and it insisted the seed come from OS entropy *"not from
me."* That is a trust ritual for a human keeping their own score, and the engine must
**not** port it. Draws derive from `(save, assessmentId)`, so a reload cannot reroll a
bad grade.

**Hours only count if the work was real.** The prototype enforced this by hand: a
problem set finished by copying a friend's answer at 6am was *explicitly excluded*
from the tally, and the hour spent later genuinely solving it *was* counted. Worth
keeping as an authored property of the action, not a judgement — `copied` work
completes the assignment and buys no bracket progress. It is the cleanest expression
of "everything affects everything" in the whole prototype. **r15**: a copied pset
grades flatly at a C, rather than being scaled by real hours it doesn't have — copying
still "completes the assignment" in the sense that matters for prerequisites and
dependent sessions, it just never earns better than average credit for doing so.

**Two additions of mine that the prototype did not have**, flagged as additions:

- **Assignment weights and a course grade.** The prototype tracked item grades (B,
  B, C+, B+) and never combined them into anything. Weights (§4.1) let a course
  produce a grade and the year produce a GPA. Keep them — but note the player's
  felt experience is the *item*, so the UI should lead with items. **r15**: the
  combination is a plain weighted average of percentages — `Σ(item% × weight) / Σweight`
  — since psets (completion-graded) and milestones (card-drawn) both already live on the
  same 0-100 scale by the time they're combined; no separate GPA-conversion step exists
  yet between a course's percentage and a term GPA.
- **Attendance feeding the tally.** §4.3's `depends_on_sessions` raises an
  assignment's hour cost when you skipped its lectures. That composes cleanly:
  skipping lectures makes each assignment cost more hours, which starves the exam
  tally, which widens the bracket. One resource, three systems. **r15**: this stacks
  *multiplicatively* with the demand gap (§4.5) on the same assignment's effective
  hours — two independent penalties, same composition rule as every other multiplier
  pair in this design. The §4.3 formula that actually computes the attendance
  multiplier itself is still unbuilt; only the stacking rule is decided.

### 4.5 Levels, and the two gaps that use them

**r11 renamed this section**, because levels now price two different things and conflating
them would be an easy and expensive mistake:

| | Gap between | Prices |
|---|---|---|
| **Demand gap** | you and the **course** (§4.1 `demands`) | how many hours the work costs you |
| **Partner gap** | you and a **study partner** | how much each of those hours is worth |

They compose in the obvious order: the demand gap says an assignment is 9 hours for you
rather than 6, and the partner gap says the hours you spend on it run at ×1.6. One says how
big the hill is, the other says how fast you climb.

#### The demand gap: why a handicap gets worse as you go up

For each tag a course demands, compare its level to yours. The cost multiplier on that
course's baseline hours is **convex** — each additional level of gap hurts more than the last:

| Demand gap (course − you) | Hours multiplier | What it feels like |
|---|---|---|
| **−2 or better** | ×0.75 | You have seen this before. It is nearly free. |
| **−1** | ×0.85 | Comfortable. |
| **0** | ×1.0 | The course as written, for the student it was written for. |
| **+1** | ×1.25 | You are working a bit harder than the people around you. |
| **+2** | ×1.7 | Every problem set is an evening you did not plan for. |
| **+3** | ×2.4 | You are behind from week one and the debt compounds. |
| **+4** | ×3.5 | Survivable only by giving up something else entirely. |
| **+5 or more** | **not survivable** | Shopping week says so outright (§4.6), and §9.3 treats it as closed. |

Convexity is the whole point, and it is what makes a creation-time handicap escalate the way
it does in life. Follow a player who took `bad with numbers` and is therefore at `math: −2`:

| Course | Demands | Gap | Cost |
|---|---|---|---|
| a Gen Ed in aesthetics | no `math` at all | — | nothing. The handicap is invisible. |
| Psych 15 | `math: 0`, `stats: 1` | +2 | ×1.7 — the statistics unit is an ambush |
| CS 50 | `math: 1`, `code: 2` | +3 | ×2.4 — and they came for the programming |
| Math 21b | `math: 3` | **+5** | **closed.** Not this year. |

*The further into a subject you go, the less you can survive not knowing what a fraction is*
— and that comes out of one curve rather than a special rule.

Note that the bottom row says **not this year**, not *never*. Levels move with hours banked
and courses passed (below), so a +5 is a statement about the player's current position, and
the route through it is a lower-demand quant course first — which is what a real advisor
would say. The player who built the handicap does not get locked out of the requirement;
they get a longer path to it, and one fewer free elective to spend elsewhere.

Two consequences fall out for free. **Prerequisites become mechanical** rather than
administrative: taking the prereq raises your level, so skipping it shows up as a gap and a
multiplier instead of a permission error. And **shopping week finally has a number worth
showing** — not "this course is hard" but "this course wants `math` at 3 and you are at 1."

#### The partner gap: joint study is a competence band

r5 had a flat 1.5× for studying with anyone. That is too generous and, worse, it is
not a decision — if any company beats no company, you always bring company. The real
shape is a **band**: a study partner has to be close enough to your level to work with
you, and far enough above it to be worth the trouble.

Everyone has a level **per subject tag** — for the player, **derived at creation** from the
trait build (§7.8) and then moved by hours banked, prerequisite coverage (§4.3), and prior
results; for an NPC, from their own enrollments and their `strengths` tags (§7.4). What
matters here is the **gap**, in levels, between you and them:

| Gap (them − you) | Session | Why |
|---|---|---|
| **+3 or more** | **×0 — wasted** | They are working problems you can't parse. You watch. Two hours gone. |
| **+1 to +2** | **×1.6 — best available** | The sweet spot. Far enough ahead to explain it, close enough to remember not understanding it. |
| **0** | **×1.35** | Two people stuck in the same place get unstuck faster than one. |
| **−1 to −2** | **×1.05** | You are mostly teaching. Barely beats solo — but see below. |
| **−3 or less** | **×0.8 — a real cost** | You spent the session explaining week two. |

And a hard gate underneath, independent of the gap: **the partner must be a fit.**
Not enrolled in the course, or a `strengths` profile with no purchase on the subject,
or Tension high enough that you don't actually work — any of these and the session is
**×0** regardless of how strong they are. A brilliant historian cannot help you with
linear algebra, and neither can someone you're not speaking to.

**Three consequences, all of them the good kind:**

- **The 1.6× is a scarce resource you have to cultivate.** The person one step ahead
  of you in Math 21b is a specific NPC. Finding them takes a growing network (§7.2);
  booking them takes arrangements (§3.5); keeping them takes Warmth. That is three
  systems pointed at one number, and it means "study with people" stops being a
  free lunch and becomes something you *built*.
- **Teaching is a social move priced honestly.** The ×1.05 row is nearly worthless
  academically — and it is one of the best Warmth-per-hour rates in the game, plus a
  Respect gain and a shared-history tag. So an evening spent dragging a struggling
  friend through a p-set is a genuine choice with a genuine cost, which is exactly
  the sacrifice the design is built to record (§7.5). The prototype's player made
  this trade repeatedly and it was the good part.
- **Your subjects are asymmetric, and so is what you can trade.** Your strongest
  subject is where you can afford to teach; your weakest is where you need the scarce
  partner most and have least to offer in return. That tension costs nothing to
  author — it falls straight out of per-subject levels.

**Groups, not just pairs.** A session's multiplier is set by the **best bridgeable
partner present**, then dragged down by everyone who isn't:

```
mult = base(bestBridgeableGap) − 0.15 × (unbridgeable participants) − 0.05 × max(0, n − 4)
```

Which produces the result every student recognises: a group of three that clicks beats
a group of eight, and one brilliant person in a room of lost ones helps nobody. The
size penalty also stops "invite everyone" from being the dominant move.

**Where this leaves the prototype's 1.5×.** It was a good average of a curve, measured
by someone who mostly studied with well-matched people. Keeping the average and losing
the curve would keep the number and throw away the decision.

#### Levels move (r15)

§7.8 derives *starting* levels from the trait build; until now nothing moved them
afterward, which meant a `bad with numbers` handicap taken at creation was a life
sentence rather than a bet with a due date, contradicting §4.5's own demand-gap table
("not this year," not "never"). Levels now move, purely on hours banked — **passing a
course grants nothing by itself**, only the hours spent studying do, since the whole
point is that the debt is repayable but expensive.

The cost to climb one level is asymmetric around zero:

```
cost(x → x+1) = 100 · max(x+1, -x)
```

At or above zero each level costs more than the last (100, 200, 300…); below zero,
climbing out of a hindrance costs `100 · |x|` — escaping `-2` costs 200 hours, escaping
`-1` costs 100. Running one tag from 0 to 5 by pure hours costs 1,500 hours total, over
a multi-year career, if it's the only thing ever studied — which is why the actual
route out of a bad handicap, per §4.5's own demand-gap table, is a lower-demand course
in the same tag first, not raw grinding.

**One real hour funds two ledgers at once, independently.** It banks in full to whatever
course's grading pool it was spent on (§4.4), *and* it splits across every tag that
course demands — weighted the same way the demand gap is priced, by demand level — into
each tag's level ledger. A CS50 hour (`code: 2, math: 1`) is 0.67h of `code` progress and
0.33h of `math` progress, simultaneously with its full hour banking to CS50's grade. A
pset's hours count toward leveling even though they never touch the milestone pool at
all (§4.4) — leveling doesn't care what a course-graded hour was *for*.

Real hours only partly convert into durable level progress: a **0.6 base accrual rate**,
halved again to 0.3 for study on a tag no enrolled course currently demands (isolated
study is real, just discounted — the design already prices "study ahead" this way
elsewhere), and multiplied *up* by the same support multipliers everything else gets:
joint study's partner-gap multiplier, tutoring, and simply **attending a class counts as
studying, at ×1.25** — showing up is guaranteed contact with the material, and it's
priced like it.

Because syllabi are readable in advance, shopping week is an **information
problem, not a gamble.** You can open every candidate syllabus and see the whole
term's workload laid out on a calendar.

The UI shows a stacked workload preview across candidate course sets: est_hours
per week, with collision points highlighted. You can *see* that CS50 + Ec 10 +
Chem 17 puts three problem sets and a midterm in the week of October 19, and then
decide whether you can take it.

**r11: the preview is now personal, and it names the reason.** Before `demands` (§4.1),
every player saw the same `~12h/week` next to CS 50. Now the hours are run through your own
demand gaps, and the screen says *why* — which turns a number the player has to trust into
an argument they can check:

```
  CS 50  Introduction to Computer Science               ~15h/wk   (base ~12h)
         wants  code 2   you 2   ·                      —
                math 1   you −2  · gap +3               ×2.4 on the math half
         ── the programming is fine. The problem sets are not. ──

  MATH 21B  Linear Algebra                              not survivable
         wants  math 3   you −2  · gap +5
         ── take a lower-demand quant course first (§9.3 lists three) ──
```

Two rules this screen obeys, both inherited from §4.4. It shows **price, never outcome** —
hours and gaps, no predicted grade. And a closed course is closed *with its reason and its
route*, because §9.3's job is to report why rather than to refuse.

**r15: `base ~12h` is derived, not hand-typed**, and so is the `demand` scalar itself
(now called `effort` when discussed as a number, though the schema field is still named
`demand`). Both used to be per-course guesses — the exact thing that makes ~120 future
courses unmanageable by hand. Now: raw weekly hours come from summing `meetings`'
contact time, a representative section length (joined from the real, registration-time
section pool in `sections.yaml` — a syllabus alone never pins one), exam sit-time
amortized over the course, and total pset hours over the weeks they actually span; and
`effort = round((rawHours + Σdemands) / 2)` — so `effort` answers "how heavy is this in
general," `demands` answers "heavy for *whom, specifically*," and neither substitutes
for the other. `demands` (the tag-level map) remains the one number per course that still
needs a human, because it's the only one that's actually about subject content rather
than workload arithmetic.

The ~160-course stub set turned that from a principle into a schema change: `demand`,
`workload_hint` and each office hour's `demand` are all **optional**, resolved by
`effectiveDemand` / `effectiveWorkloadHint` / `effectiveOfficeHourDemand` when the
catalogue is served. An authored value still wins — a published figure, or a genuine
exception — and the content tests check the authored ones against the derivation, which is
where a number that has drifted away from its course shows up. A course with no assignments
at all says so out loud rather than quoting a total that silently omits every pset it will
turn out to have — the hint reads *"~5.8h/week in class, coursework TBD"* instead of
*"~5.8h/week"* — which is what made it obvious that deriving from contact time alone wasn't
enough: with no coursework to price, 138 of the 160 stubs came out at demand 3, and a
catalogue where nothing is heavier than anything else can't be shopped. So the import
generates an assignment skeleton too (ARCHITECTURE §3.1), sizing each course's coursework
budget from its contact hours *and* its subject demands — 1.5 h of work per contact hour plus
an hour per demand point, so a 4-credit lecture lands near the twelve hours a real syllabus
quotes. The derived spread is 6–10.

Two earlier versions failed, and it is worth naming the second: budgeting each course
*whatever was left* of a ~12 h/week target after its contact time. That looks like it prices
the course and doesn't. If coursework is `target − contact` then total hours **are** the
target, contact cancels, and `effortScore` collapses to `4 + Σdemands` — which held for 162 of
163 courses. The number had stopped measuring anything and become a relabelling of its own
input, pricing a 5.5 h/week lab identically to a 2 h/week seminar with the same tags. The fix
is that coursework now scales with contact time *and* adds a demand term, so neither can
cancel the other.

The remaining compression is in the authored data, not the arithmetic: 141 of 163 courses land
at 6 or 7 because the spreadsheet's tag levels only ever take the values 1–3 and 148 courses
carry exactly two tags. That is an authoring question — the workload arithmetic is arithmetic,
and the human's judgement is the tag map.

There is also a **semester effort cap** (`rules.academics.semesterEffortCap`, 28) —
a *soft* warning, not a hard block, on the sum of `effort` across a player's enrolled
courses. It's a line, not a wall: shopping week names it, it never refuses a course set
for crossing it.

This makes **workload collision an authored difficulty lever.** The content author
places the crunch weeks deliberately. Difficulty comes from level design, not from
random numbers — which is a much better foundation for balancing.

The target experience, in the words of the person who played the hand-run
prototype: *"looking at the calendar and skipping the cabin weekend because I
cannot attend CS Section on Thursday."* That sentence is the design spec for this
whole section. The collision has to be **visible in advance**, **specific** (a
named section on a named day), and **genuinely costly to resolve either way**. If
the player can't see the wall coming, it's not a decision; if giving up the cabin
weekend is free, it's not a sacrifice.

### 4.7 Play-invariance is what makes mastery possible

This is the design payoff of your constraint, and it's worth naming explicitly.

Because the homework never changes, **the second playthrough is smarter.** You
learn the year. You know week 8 of the fall term is a wall, that Ec 10's
problem sets are front-loaded, that the Chem 17 midterm is three days after
Housing Day. That knowledge is the reward for replaying, and it compounds.

If assignments were generated, none of that would be learnable, and every
playthrough would be equally blind. Fixed content converts replay into mastery
instead of into fresh randomness — and mastery is the better long-run motivation
for a game about time management.

It also means the game is **balanceable at all**, and that a difficulty tuning
pass is a real thing you can do.

**r8, and this needs saying plainly because it looks like a loophole and isn't: the
rule is about *runtime*, not about authoring time.** "Nothing academic is ever
LLM-generated" means no syllabus, assignment, due date or weight is ever produced
*while someone is playing*. It does not mean a human hand had to type every line.

A syllabus that gets drafted once, reviewed and corrected by a person, committed to
`content/`, and covered by the content hash is **play-invariant in exactly the way this
section requires** — it is identical for every player on every run, it can be read in
advance, and it can be tuned. How the first draft came into existence is invisible to
the mechanic. The review step is the load-bearing part, not the typing: a syllabus that
nobody checked can be internally inconsistent, and the boot validator (`ARCHITECTURE.md`
§3.2) catches structural contradictions but cannot tell you that a course's week 4
problem set assumes material it teaches in week 6.

So: drafts get written against real course structures, then read and corrected, then
committed. What is forbidden is a generated syllabus reaching a player unreviewed, and
that is a process rule the content hash happens to enforce for free.

### 4.8 What the narrator may and may not say

The narrator receives the relevant syllabus context — the topic of today's
lecture, the assignment you're working on, what's due when — and is **forbidden
from inventing academic content.** It may not mention a problem set that isn't in
the syllabus or a topic that isn't in the sessions list.

This is a hard prompt rule and a standing eval case. It's also why the
syllabus makes the *prose* better: instead of "you struggled with the reading,"
the model has "four hours on the Caesar cipher and the wrap-around still breaks
on 'z'." Concrete authored detail is what the LLM is good at dressing, and bad at
inventing consistently.

**r7: the narrator may write about confidence, and should.** It is player-facing now
(§4.4), and *"you have read everything and still have no idea what Tuesday will ask
you"* is one of the most writable states in the game. The rule stays one-sided: the
narrator gets `confidence: low` as a fact to dress and never receives the draw, the
score, or a letter. So it can write the uncertainty and cannot spoil the outcome —
which is exactly the position the player is in.

### 4.9 The honest cost

This is the largest authoring job in the project: roughly 8-10 syllabi for
freshman year, each with ~25 sessions and ~10 assignments. Call it ~250 sessions
and ~100 assignments of YAML.

**Correction from the first three shipped syllabi.** The ~25-session figure was a flat
per-syllabus average; it isn't. A TTh/MW course (Expos 20: 26, CS 50: 23) lands near it,
but a full-term MWF course does not — Math 21b runs 36 real sessions, 44% over the
estimate, simply because MWF meets three times a week for the same ~14 weeks. If the
remaining 5-7 syllabi include other MWF lecture courses, plan on **~28-30 sessions
average** and a total nearer **~280-300 sessions**, not 250.

It's tractable — it's fast, mechanical writing, and it's the kind of content that
can be drafted quickly and tuned later — but it should be scheduled as real work,
not assumed to fall out of the engine. Upside: because syllabi are pure data,
courses become the natural unit of expansion (and of modding).

Revised after reading the prototype: **four of those syllabi already exist** in
usable detail — the `Fall 2027 Daily Calendar` sheet carries per-date lecture topics
and every deadline for a full term across four courses, forward to the final exam. It
is ~14 weeks of one course-set, authored by hand, and it ports. The r4 estimate of
"~12 NPCs" was the bigger miss: budget **~60 background records** (cheap, enumerated,
generatable at authoring time) plus **~55 foreground NPCs** (§7.1).

**r6 adds one authoring job and it is smaller than it looks.** The seven tracks of §9
are requirement graphs — roughly 8–12 lines of YAML each, plus the college-wide set
once. But every track needs *courses that satisfy it*, and a Sociology track cannot be
tested against a CS course list. So the real cost is **course stubs**: id, title,
field, credits, typical term, prerequisites, and which requirement buckets it counts
for — no sessions, no assignments. A stub is two minutes; ~120 of them cover four years
of every track. Full syllabi are still only needed for courses the player can actually
enrol in, which in year 1 is a shopping list of ~10. The prototype's `Course Plan`
sheet already contains the CS/MBB half of this, including the honours-track rules.

**r8 settles who writes them: drafted against real course structures, then reviewed and
corrected, then committed** (§4.7 explains why that satisfies play-invariance). Two
scheduling notes that follow. Milestone 2 needs only **two** syllabi to prove the format
and produce a workload collision, and the four ported from the prototype cover freshman
fall — so the full ~10 is a milestone 8 problem, not a blocker on anything earlier. And
the review pass is where the hours actually go: drafting a syllabus is fast, reading one
closely enough to catch that week 4's problem set needs week 6's material is not.

**r10 adds the second real authoring job, and it is not small.** The priced trait economy
(§7.8) needs roughly 40–60 trait records, and unlike a course stub a trait record is not two
minutes: each one wants a cost, tag effects, `requires`/`excludes`, a `contagious` flag, an
Affinity weight, and a line of prose for the creation screen. Two mitigations, both real. The
vocabulary is not invented — §7.4's table is lifted from the prototype's own `Students` sheet,
so most of the personality and strengths traits already have names and are already in use on
~115 NPCs. And **subject tags are the cheap part**: thirteen tags (`math`, `stats`, `code`,
`writing`, `reading`, `lab`, `discussion`, `proof`, `visual`, `language`, `fieldwork`,
`memorization`, `ethics`) annotated onto subjects once, which the course stubs can carry from
the start at almost no marginal cost.

**r11 adds one field to that annotation and it is worth being honest about the cost.**
`demands: {tag: level}` (§4.1) is not just a tag list — it is a tag list *with a number
per tag*, on ~120 course stubs. In practice most stubs carry one or two demands and the
numbers cluster hard (an introductory course wants 0–1, a 100-level course wants 2–3), so
this is minutes per stub rather than a research task; and r11's own pricing gives it a
second use, since the requirement-coverage weight in §7.8 reads the same field. But the
number is the part reviewers must actually look at, because a stub tagged `math: 0` where
it should say `math: 2` makes a handicap free in exactly the way §7.8's invariant is meant
to prevent — and the invariant checks that a tag *appears*, not that it appears at a
plausible level. That check stays human.

The genuine risk here is balance surface, not typing. Costs on 50 interacting traits is the
first thing in this design that cannot be reasoned about on paper, which is why §7.8's
no-dominant-build check has to be a balance-bot assertion rather than a review item.

**Which is why traits ship as packs.** Start with a `core` pack of roughly twelve to sixteen
traits — enough to exercise every mechanic once: two languages and an `international` for both
Affinity tiers, one athletic trait plus one gated child for the prerequisite DAG, two
subject-positive, two hindrances, three contagious personality traits, one conviction — and add
packs during development as the balance bot tells you what the existing costs are worth.

This is a better shape than authoring fifty traits up front for a reason beyond scheduling: a
trait's cost is only meaningful *relative to the others in the pool*, so a large first pass
would be fifty numbers guessed simultaneously against each other. Sixteen can be tuned; fifty
cannot. It also keeps the creation screen legible in a terminal (§12) during the months when
the game is being played mostly by its author.

The one thing packs must get right from the first commit is **pinning** — a save records which
packs it was created under, because rarity is computed against the live pool (§7.4) and adding
a pack would otherwise silently move every Affinity weight in every existing save. That is
cheap now and very expensive later, so it belongs in the schema before the second pack exists.

### 4.10 Probation: what failing actually does

**r8.** Until now the academic system had no downside beyond a closed track, which
quietly undercut the whole design — if hours can only ever buy you *more*, allocating
them is arithmetic rather than fear.

**A term GPA below 2.0 puts you on academic probation.** Not a game over; freshman year
always finishes. What probation does instead:

- **A required advisor meeting**, as a Tier 3 milestone. Named, scripted, unavoidable,
  and it goes in the Chronicle. This is the part that stings.
- **A cap on extracurricular bands** for the following term — the engine refuses
  allocations past the cap, and your standing commitments (§3.4) have to be cut to fit.
  You choose which club to abandon, which is the most honest punishment available in a
  game about time.
- **Tracks close, with the reason stated** (§9.3), and honours eligibility can be lost
  outright rather than merely deferred.
- **It follows you.** Probation is on the record for the rest of the game, it is
  referenced in the epilogue, and a second term of it escalates the meeting rather than
  repeating it.

Why no expulsion: the prototype's best moment was **recovery from a D**, not
elimination. A 180-day game that can end on day 60 throws away authored content the
player has been paying attention to, and it converts a tense system into a
save-scumming one — which §3.3's derived draws exist specifically to prevent. Failure
should cost you *options*, permanently and visibly, and options are the resource this
game is actually made of.

The one thing to hold to: **probation must be reachable.** If the balance bot cannot
find a plausible playthrough that triggers it, the thresholds are wrong and the
downside is decoration.

---

## 5. The narration budget

**Decisions are daily. Narration is earned.** Prose is spent on the days that
deserve it — not mainly because tokens cost money, but because a generated novel
every day would be exhausting to read and would flatten the good days into noise.

The engine assigns each day a tier; the player feels it as rhythm.

| Tier | Frequency | LLM | What the player sees |
|---|---|---|---|
| **0 — Routine** | ~55% of days (≈4/week) | none | A terse log line, specific because it's built from the syllabus: *"Tue Sep 15 — CS50 lecture: arrays & memory · 3h on PS2 (Caesar) at Lamont, with Amelia (×1.6) · dinner in Annenberg, arranged Thursday's session with Wei. PS2 62%→85%. Math: 11.5h banked, confidence still low. Psych commitment: 0 of 2h. Energy 6→4."* Zero tokens. |
| **1 — Flavor** | ~22% (≈1-2/week) | cheap, batched | A sentence or two of texture. No consequences, no choices. Generated a week at a time in one call. |
| **2 — Scene** | ~20% (≈1-2/week) | full | A narrated beat with choices, per §6. |
| **3 — Milestone** | ~3% (a handful/year) | full, higher effort | Housing Day, finals results, a romance turning point, the term epilogue. |

Density is not uniform — tiers are trigger-assigned, so a dead February week is
nearly all Tier 0 and finals week is dense with scenes. The percentages are the
yearly average, not a quota.

Note how §4 improves Tier 0: the log line is *specific* — real lecture topics,
real assignment names, real progress numbers — at zero token cost. The single
source of truth makes the cheapest tier the most concrete one.

### 5.1 Continuity: the Chronicle, and why context stays small

The prototype's other failure mode, in your words: *"LLM context got so large it
became boring in its attempts."* That is a real and well-known degradation curve,
and the design's answer is to refuse to grow the context at all.

The engine maintains an append-only **Chronicle** of short factual entries:

```
Sep 18  submitted CS50 PS2 four hours late, 71%
Sep 24  Marcus asked you to join his Ec 10 study group
Oct 02  skipped Maya's birthday to finish PS4; she noticed
```

Each narrative call receives a **fixed, budgeted** context: a state digest, the
scoped syllabus excerpt (§4.8), the resolved cast with traits (§7.1), and a
selection of Chronicle entries — the most recent N, plus any tagged with this
scene's cast. That's roughly 1.5-2K tokens, **and it does not grow.** A call in May
costs the same and performs the same as a call in September.

Two consequences:

- **Every narrator call is stateless and single-turn.** No conversation history to
  accumulate, no compaction machinery, no slow decay in quality. State lives in
  the database where it is queryable and testable.
- **Continuity gets better as the game goes on, not worse** — because it comes
  from selecting relevant history out of a structured log, not from the model
  holding four years of transcript in its head. The model is told the three things
  that matter about Marcus right now, rather than being asked to remember
  everything about everyone.

At term boundaries the Chronicle is compressed — an LLM summarizes a term's
entries into a handful of durable ones. This is safe because it's lossy prose over
prose and touches no state.

### 5.2 The boundary, stated explicitly

**Always the engine — never the LLM:**

- The calendar, dates, deadlines, exam schedules
- **The entire syllabus: sessions, topics, assignments, due dates, weights**
- Band allocation and every resource cost
- All stats, all deltas, all probability rolls, all thresholds
- **The grading model in its entirety** (§4.4): the hour tally, the bracket, the
  confidence level, the draw, the improvements, the score, and the forecast range
  shown to the player. The player supplies hours; the engine decides everything else,
  and the draw is never shown to anyone — player or model.
- **Joint-study multipliers** (§4.5): levels, gaps, bridgeability, group drag
- **Whether a half-band was long enough to be worth anything** (§3.1), and the meal
  gap clock (§3.5)
- **Who is available to sit with at a meal** (§3.5) — and whether an NPC accepts an
  arrangement
- **Acquaintance growth** (§7.2): the per-venue cap, the saturation curve, and which
  background NPC gets promoted
- **Trait acquisition** (§7.7): the thresholds and the gate. The LLM writes the scene
  in which you notice; it does not decide that you changed.
- Grading and GPA
- Which beat fires, and when
- Relationship and romance state transitions (§7)
- **Requirement tracking and track feasibility** (§9) — including *why* a track closed
- Failure-state detection

**Always the LLM — never touches state:**

- Scene prose, dialogue, NPC voice
- Diegetic option labels
- Flavor lines
- Interpreting free text into an engine-legal action
- Epilogues, and Chronicle compression at term boundaries

### 5.3 The gray zone

| Tempting | Verdict | Why |
|---|---|---|
| Generate assignments / syllabi per playthrough | **Authored** | §4.7. Destroys mastery, balance, and the ability to tune difficulty. This is now a load-bearing rule. |
| Let the LLM decide who is in a scene | **Engine** | §7.1. This is the Marcus/Carl bug. The engine resolves the cast from schedules and hands the narrator a roster. |
| Let the LLM pick which event fires | **Engine** | You lose all pacing and balance control. The model will reliably escalate, because escalation is more interesting to write. |
| Let the LLM decide how much a choice costs | **Engine** | The whole point of §2. |
| Let the LLM decide whether an NPC forgives you | **Engine** decides *whether*, LLM renders *how* | A threshold crossing is a mechanic. The apology scene is writing. |
| Generate NPCs per playthrough | **Authored** | NPCs must be balanced and referenced by name in beat templates. |
| Let the LLM summarize the term | **LLM, safely** | Lossy prose compression of the Chronicle. Touches no state. |
| Free-text novel actions | **LLM, clamped** | §6.3. Real agency, bounded blast radius. |

### 5.4 Tone

**r8 confirms what I had only assumed: dry and observant.** Close third person, specific,
unsentimental. The prose reports what happened and trusts the arithmetic to supply the
feeling.

```
Lamont, 21:40. The wrap-around still breaks on 'z'. Amelia left at nine and took
the good whiteboard marker with her, and you have not touched the Psych reading.
```

Not:

```
You felt a wave of despair wash over you as the crushing weight of your
responsibilities threatened to overwhelm you completely.
```

Three reasons this is the right register, and none of them are taste:

- **It is what the model is most reliably good at**, and reliability across ~180 days
  matters more than peak quality on any one of them. Understatement degrades gracefully;
  emotional intensity degrades into the same four sentences, which is precisely the
  *"boring in its attempts"* failure the prototype hit (§1.1).
- **It makes the earned moments land by contrast.** If Tuesday in October is reported
  flatly, then a Tier 3 milestone that allows itself one interior sentence hits hard.
  Spend the emotional register like a resource, because that is what it is.
- **The engine already supplies the emotion.** The player knows what the six hours cost
  them; they do not need to be told they feel tired. Naming a feeling the mechanics have
  already produced actually weakens it.

Two standing prompt rules follow, both eval cases: **no summarising the player's
emotional state**, and **no adjective the syllabus or the state model cannot support.**
"Difficult" is earned if the hour cost says so. "Devastating" never is.

The exception, stated so it does not get argued about later: **the romance track (§7.5)
and epilogues get more interior access.** They are ~3% of calls, they are the payoff the
restraint everywhere else pays for, and the whole point of holding a register is having
somewhere to go.

---

## 6. Scenes

### 6.1 The beat template

Authored skeletons with fully pre-costed outcomes:

```yaml
id: roommate_confrontation
trigger: npc.roommate.tension >= 3 && !calendar.inReadingPeriod
cast: [roommate]
question: Do you address the tension, or let it fester?
independent: true
options:
  - id: confront_directly
    effects: { roommate.tension: -2, roommate.respect: +1, energy: -1 }
    risk: { p: 0.30, effects: { roommate.tension: +1, roommate.warmth: -2 } }
  - id: passive_note
    effects: { roommate.tension: -1, stress: +3 }
  - id: avoid
    effects: { roommate.tension: +1, stress: +5 }
fallback_prose: "You said nothing. The room stayed cold."
```

The LLM gets the skeleton, a state digest, relevant syllabus context, and the
relevant Chronicle entries, and returns prose plus a diegetic label per option —
not "confront directly" but *"Knock on her door tonight, before you lose your
nerve."* The mechanical outcome was decided before the model was called.

Beats can trigger off the academic spine, which is where the two systems meet:
`trigger: assignment('cs50.ps2').hoursRemaining > 6 && calendar.daysUntil('cs50.ps2.due') <= 1`.

### 6.2 Choices cost something real

Every scene option is priced in a resource the player currently needs. A scene
offering a free good outcome is a bug, and content review should reject it.
"Everything affects everything" is enforced at the content level, not hoped for.

### 6.3 Free text

The player can ignore the options and type. The LLM either:

1. **Semantic-matches** an existing option — "I'll slide a note under her door"
   maps to `passive_note`, and the engine applies that authored delta.
2. **Proposes a novel action** — the model returns a delta under a strict schema,
   and the engine **validates and clamps** every field against per-stat caps and
   an allowlist. Grades, credits, romance stage, and **anything in the syllabus**
   are not writable.

Worst case for a successful prompt injection: a small unearned nudge to a social
meter. See `ARCHITECTURE.md` §7.

---

## 7. People

### 7.1 NPCs are fixed people with fixed lives

This section exists because of a specific failure in the hand-played prototype:

> *"Marcus asks... whoops... Marcus is in EC10 not in Math 21b. My mistake. I was
> supposed to say Carl. Yes. So, Carl asks..."*

That is the single most important bug report in this document. It is not a prose
problem or a context-window problem — it is a **category error**. The LLM was
being asked to remember who was where, which is bookkeeping, which is the one
thing it must never own (§2).

The fix has three parts:

**1. NPCs are authored, with fixed traits.** Each NPC is a content record: name,
background, a small set of stable traits, a voice note for the narrator, and
nothing generated at runtime. Marcus is Marcus in every playthrough.

The prototype's `Students` sheet shows the shape, and it corrects my r4 budget of
"~12 NPCs" by an order of magnitude. **114 people, in two tiers:**

| Tier | IDs | Count | State |
|---|---|---|---|
| **Background** | `#0001`–`#0061` | ~60 | Fully specified — concentration, dorm, hometown, personality, **and which of your courses they're in** — but marked *"Not yet met"* and *"Generated background student — flesh out if they become story-relevant."* |
| **Foreground** | `#0100`+ | ~55 | Promoted on contact. Same schema, richer notes. |

This is the real anti-hallucination mechanism, and it's content rather than code:
**the pool is populated in advance so nobody ever has to invent a person.** When the
engine needs one more face in a section, it promotes a background record — it does
not ask the narrator for a name.

Background records are cheap because almost every field is drawn from a closed
vocabulary (§7.4); the whole tier is generatable at authoring time and then frozen
into content. The expensive part is only the ~55 who get lines.

**Name uniqueness is a build check, not a discipline.** The prototype's own notes
are a record of losing this fight by hand: *"Renamed from 'Elena Fernsby' to resolve
a surname duplicate"*, *"First name changed from 'Elena' to reduce first-name
repetition"*, *"corrected from an initial name collision"*, and a standing
open thread titled **"Name-collision watch"** tracking two James's and two Priya
Anands (resolved by giving one the nickname "PJ"). Content validation asserts
first-name and surname uniqueness across the entire pool. Two lines of code retire
an entire recurring category of confusion.

**2. NPCs have their own schedules.** Each NPC declares their enrollments, their
orgs, their dining hall, their rough daily rhythm. Marcus is in Ec 10. He is *in
the schedule data* as being in Ec 10. He cannot be in Math 21b, because the engine
would have to have put him there.

**3. The engine computes the cast; the narrator never chooses it.** Every scene's
participants are resolved from state before the model is called — who is enrolled
in this course, who is in this org, who is in this dining hall at this hour. The
narrator receives a roster of exactly the people present, with their traits, and
writes them. It is never asked "who is here?", so it can never get it wrong.

If the model does produce a name that isn't on the roster, that's a validation
failure the eval suite catches, not a thing the player is asked to forgive.

### 7.2 A consequence worth having: your course list shapes your social graph

NPC schedules give this for free, and it's one of the better emergent properties
in the design. You meet people in the rooms you're in. Choosing CS50 means Marcus
is reachable and Carl isn't. Dropping a course drops the people in it.

Which means **shopping week is also a casting decision**, made before you know
who anyone is. That's a good kind of consequential — you can't optimize it on a
first playthrough, and on a second one you can (§4.7).

**Venues have a real size, and you know a fraction of it.** The prototype tracked
this explicitly, in a header row I nearly skipped:

```
Known people (out of assumed size):
  Math 21b 9/25 · CS50 Thu Section 9/18 · Expos 20 4/14 · Psych 15 7/90
  HCRC 4/60 · HURC 8/100 · HBC 6/150
```

Every course meeting and every org carries a `size`; state carries `known: NpcId[]`
per venue. Attending is how the fraction grows. This is nearly free and it buys
three things:

**How fast it grows, and where it stops.** Two rules, and the second is the one that
makes a network feel like a network.

*First, a cap that declines as a fraction of the room.* The prototype's own figures
at six weeks in — 9/25 Math, 9/18 section, 4/14 Expos, 7/90 Psych, 6/150 HBC —
extrapolate to roughly this by end of term:

| Room size | Knowable by end of term | As a fraction |
|---|---|---|
| 14–20 | essentially all of them | 90–100% |
| 25 | ~15 | 60% |
| 50 | ~15 | 30% |
| 90 | ~12 | 13% |
| 150 | ~10 | 7% |
| 850 | ~8 | <1% |

The fraction collapses; the absolute number barely moves. That is the honest result
and it is the interesting one: **a lecture hall of 850 is socially smaller than a
seminar of 18.** One integer per venue produces that, and it is why §4.6 should show
room sizes next to workload hours — a course set is also a choice about how many
people you can possibly know.

*Second, a saturation curve over attendance, not a per-visit dice roll.* Expected
acquaintances after `m` attended meetings is `cap × (1 − e^(−m/τ))`, τ ≈ 8. Early
meetings introduce people fast; by November a lecture almost never produces a new
face. This matters because it front-loads meeting people into the weeks when the
player has the least information to act on it — you meet everyone in September and
find out in November which of them mattered.

Modifiers on the rate, all of them things the player controls: small-group work
(sections, joint study, arrangements) accelerates it sharply; sitting in the same
seat with the same people slows it to nothing; the player's own `personality` traits
scale it (§7.7 — and this is one place a trait acquired from an NPC visibly changes
what you can do).

**And each new acquaintance arrives as a named moment**, however small — a Tier 1
flavour line, one sentence, with the person's real name and a fixed trait attached.
Never *"your social circle grew."* The prototype's log gained people one at a time
and remembered where each came from, and that is the texture being reproduced: by
March you should be able to look at your roster and know that you met Amelia because
you took the Thursday section instead of the Friday one.

- **A clean trigger for meeting someone.** Attend a venue with a low known-fraction
  and the engine promotes a background NPC into it. No randomness needed at the
  narrative layer, and no invented people.
- **A reason to attend section that isn't the assignment.** The 18-person section is
  where the fraction actually moves; the 850-person lecture is not.
- **Authored intimacy, for free.** Expos 20 has **14** people — you can genuinely
  know all of them, and the prototype's player did, and they became the essay group
  that recurs for ten weeks. Psych 15 has **90** — you never will. That difference
  is felt without a single line of prose about it, and it's one integer per venue.

**NPCs have their own lives, off-screen.** Because NPCs carry enrollments, they
carry assignment loads too, which means they have their own crunch weeks for free.
The prototype's most quietly effective beat: the romantic interest *"had three
midterms the same week"* as the player's own worst week and **got straight A's on all
three**, mentioned in passing with total nonchalance. The player recorded it as *"a
real, grounding contrast worth remembering."* That lands only because her schedule
was real and independent, and it costs nothing but a query.

The same data supports NPC↔NPC relationships forming without the player — the
prototype produced *"a real, independent friendship... unmediated by Pekka"* between
two side characters, which promptly generated a small, unprompted jealousy beat. A
sparse NPC-to-NPC affinity graph is worth stubbing in year 1 even if little content
reads it.

### 7.3 Relationship state

Every NPC carries four accrued axes — **Warmth**, **Respect**, **Tension**,
**Status** — plus shared-history tags. Warmth and Tension being independent is
deliberate: you can be close to someone you're furious at, which is where the
good scenes are.

On top of those sits one thing that is *not* accrued: **Affinity**.

### 7.4 Affinity: the thing that made the prototype work

In the prototype, what made the relationship real was **similarity** — you both
spoke Swedish, and that became "our own little thing." That's not a meter you
grind. It's a fact about two people that makes every hour spent together worth
more.

So Affinity is a **static multiplier computed from trait overlap** between the
player and an NPC — shared language, shared background, shared taste, being in the
same section, coming from the same kind of place. It doesn't change over the year.
It determines how *fast* Warmth accrues per hour spent together.

Two consequences, both good:

- **Time spent with a high-affinity person is worth several hours with a
  low-affinity one.** This makes the social budget a real allocation problem
  rather than a grind — you can't befriend everyone, and the game rewards
  noticing who you actually click with.
- **The shared trait becomes the narrator's material.** "Our own little thing" is
  a shared-history tag the model gets handed and can use forever. That's authored
  specificity the LLM dresses rather than invents — exactly the division from §2.

Player traits are partly set at character creation and partly earned through play,
so affinity is discoverable but not fully controllable.

**The trait vocabulary is no longer an open question.** The prototype's `Students`
sheet already uses closed, reused enumerations — the same strings appear verbatim
across dozens of background records, which is exactly what makes them a vocabulary
rather than prose:

| Axis | Values (as authored) |
|---|---|
| `personality` | earnest overachiever, slightly anxious · highly organized, mentor type · curious generalist, hard to pin down · pragmatic, career-focused · laid-back, surprisingly sharp · quietly intense, works best alone · guarded at first, loyal once trusted · warm and inclusive, campus connector · restless creative, easily bored · outgoing, thrives in group settings · observant, writerly |
| `strengths` | entrepreneurship/business · historical research · lab sciences · athletics (varsity) · finance/social ease · programming · writerly observation |
| `background` | school type (public · public magnet · boarding · international) **×** place |
| `multilingual` | native/fluent languages |

**Weights must be uneven, with a few rare high-value tags.** This is the finding, and
it's decisive. In the prototype the two deepest relationships in ten weeks were both
**shared-language** bonds — Swedish with the romantic interest, Finnish with a
running-crew friend whose grandmother emigrated from Finland. Nothing else came
close. A shared rare language produced *"our own little thing"*, code-switching as a
running motif, and a private register no one else in the cast had access to.

So Affinity is not a uniform count of overlapping tags. A small number of **rare**
tags (shared native language, shared home country, shared unusual formative
experience — the prototype's protagonist had military service) carry large weights;
common tags (both like running) carry small ones. Rarity should be computed against
the actual NPC pool at boot, so a tag's weight is a property of the cast rather than
a hand-tuned number — which means adding NPCs automatically dilutes what was once
distinctive, exactly as it should.

#### r10: Affinity matches on two tiers, exact and kind

**Traits carry kind tags, and a match on the kind counts for something even when the traits
differ.** The player's example is the one that proves it: two people who each speak a
language other than English have something real in common *even if it is Swedish and
Mandarin* — neither of them grew up doing this in their first language. So:

| Tier | Example | Weight | Rarity |
|---|---|---|---|
| **Exact trait** | `speaks Swedish` × `speaks Swedish` | large | rare |
| **Kind tag** | `speaks Swedish` × `speaks Mandarin` → both `multilingual` | small | common |

This is not a nicety; it repairs a flaw in the paragraph above. Exact matching alone makes
Affinity **sparse** — across ~115 NPCs the player has one or two real matches and everyone
else sits at zero, which makes the whole cast interchangeable and the social budget (§7.2) a
non-decision. The kind tier gives a dense weak layer underneath the sparse strong one, so
most people are slightly more or less reachable and a few are transformative.

The invariant that keeps this honest, and it is machine-checkable:

> **The sum of every possible kind-tag match must stay below a single rare exact match.**
> Otherwise a build that collects one trait from each of six kinds out-bonds the shared
> rare language, and the prototype's central finding is quietly overturned by arithmetic.

Which in practice means kind-tag contributions have **strong diminishing returns** — the
second `multilingual`-tag acquaintance is worth much less than the first — rather than a flat
per-tag bonus.

Some kinds worth having, all already present in the content: `multilingual` · `international` ·
`athletic` · `conviction` · `creative` · `service` (the prototype's military reserve, and
Phillips Brooks House volunteering) · `first-gen`. `international student` × `international
student` from different countries is the second case that sells the mechanic — two people who
both left home, with no other overlap at all.

**Hindrances weigh 0 on both tiers by default.** Since traits are now point-priced (§7.8),
letting a cheap hindrance contribute would make hindrances a way to buy social reach. A few
may be authored `bonding` — two people drowning in the same Gen Ed genuinely is a
friendship — but it is an opt-in per trait, never the default.

#### r11: dispositions are a third namespace, and they are NPC-only

Not every fact about a person is a similarity axis, and the test is simple: **does sharing it
create a bond?** *Speaks Swedish* — yes. *Guarded at first* — no; two guarded people are
conspicuously not bonding. So the prototype's `personality` column splits in two, and the
half that describes **how a person relates to others** is not Affinity material at all. It is
a set of modifiers on the relationship machinery:

| Disposition | What it modifies |
|---|---|
| `mentor type` | accepts the ×1.05 teaching session willingly, instead of it costing Warmth (§4.5) |
| `guarded at first, loyal once trusted` | slow Warmth ramp, then a markedly steeper one past a threshold |
| `warm and inclusive, campus connector` | introduces you onward — accelerates the acquaintance curve for *their* contacts (§7.2) |
| `restless creative, easily bored` | Warmth decays faster without new shared activity |

Why this must not live in the kind-tag namespace: if `mentor type` were a kind tag, a player
who had it would gain Affinity with every mentor in the cast, which is nonsense. Its actual
effect is on the joint-study table and the network, so it belongs where that code reads it.

**The player never has a disposition.** Not a restriction for its own sake — it falls out of
what these things are. A disposition describes how someone behaves toward *you*, and the game
does not need to model how you behave toward yourself; where a player-side equivalent is
wanted, it already exists as a trait with a mechanical effect (`outgoing` accelerates your own
acquaintance curve, §7.7).

So: three namespaces, with deliberately different growth properties.

| Namespace | Lives on | Read by | Player has it | Grows? |
|---|---|---|---|---|
| **Subject tags** — the closed thirteen (§4.1) | courses' `demands`; traits' `affects` | hour cost, levels, requirements, the §7.8 invariant | through effects only | **closed** |
| **Kind tags** | traits' `tags` | Affinity, both tiers | yes, symmetric | open — new packs may add |
| **Dispositions** | NPC records | Warmth ramp, teaching, introductions | **no** | small, closed-ish |

The closed/open split is practical. A fourteenth subject tag means revisiting ~160 course
stubs, so that set wants to be right now; a new kind tag costs nothing, because rarity is
derived from the pool and a new tag simply starts rare. That asymmetry is also why the 7 → 13
widening (§4.1) resolved its collision with the kind tag `language` by renaming the *kind*
tag to `multilingual`: the cheap namespace absorbs the churn.

### 7.5 The romance track

An explicit state machine in the engine, not an emergent LLM phenomenon:

```
stranger → acquaintance → friend → close → ambiguous ─────→ together
                                              │  ▲              │
                                              │  └── (stays) ───┤
                                              ↓                 ↓
                                            faded      steady | strained | ended
```

**`ambiguous` is a real ending, not a failure to reach `together`.** This is a
direct correction from the prototype: what actually happened there was feelings
that never became a relationship, and that was *satisfying* — the good version of
the story, not a missed win condition. So the state machine treats it as a stable
terminal state with its own epilogue, and the five-axis score does not penalise
ending the year there.

The journal confirms the shape of the machine, including the loop back onto
`ambiguous`. Ten weeks, five transitions, and the emotional peak is *staying put*:

```
Sep 02  met at a Yard event, conversation switches to Swedish   → acquaintance
Sep 11  slow dance at the welcome concert; both name the moment
        breaking and close on "nästa vecka, då" — unresolved      → friend
Oct 02  invited to meet the player's visiting parents; she takes
        a beat before saying yes                                  → close
Oct 09  explicit mutual conversation at 1am: both say they feel
        something, both say they don't want it named yet, and
        they agree out loud to leave it as it is                   → ambiguous
Oct 31  asked directly whether it's good, answers plainly for the
        first time: "we're good. better than good."               → ambiguous (stays)
```

Two design notes fall out of that. The `ambiguous` state needs its **own** beats —
the arc did not stall there, it *developed* there, and a state with no content is a
state the player experiences as a dead end. And the Oct 09 transition was a scene in
which the choice was **"don't escalate,"** and taking it was the good outcome. Beat
options must be able to offer declining as a real, rewarded move, not just as the
absence of progress.

Getting to `ambiguous` is gated on two engine-evaluated conditions:

1. **Shared history** — a minimum count of co-attended events, weighted by
   Affinity (§7.4). High affinity gets there on fewer hours.
2. **Warmth threshold** — the meter has to be there.

Crossing from `ambiguous → together` requires a third:

3. **An earned beat** — at least one scene where you *chose them over something
   that cost you.*

Splitting the gates this way is the point. The unconsummated version is reachable
by genuinely spending time with someone you click with. **Dating requires a
documented sacrifice.** And §4 makes that sacrifice concrete: the thing you gave
up is a specific, named assignment with a real hour cost and a real weight.

```ts
sacrifices: [{ date, chosePerson: 'maya', gaveUp: 'ec10.ps4',
               cost: { hoursLost: 5, weightAtRisk: 0.08 } }]
```

The `ambiguous → together` transition **requires a non-empty sacrifice log for
that person.** Romance cannot be grinded by dumping free slots on someone; it
requires a documented cost. And the cost is legible in the epilogue: *you got
together in November and it cost you a letter grade in Ec 10.*

Neglect is tracked symmetrically — skipping her birthday to finish PS4 is logged
and gates transitions the other way.

**The prototype already produced this, unprompted, and it is the best evidence in
any of the three files that the design works.** Reconstructed from the journal and
the prototype's own `exam_matrix.md`:

> Family Weekend ran Oct 15–17. The player introduced her to their parents — the
> §7.5 sacrifice beat, offered voluntarily. Across those three days the journal
> records a *"15-minute solo Psych study attempt failed completely — effectively zero
> real study hours during the day."* The Psych 15 midterm's roll point was **Oct 18**.
> It rolled **56.25%, a D.** The next two days went to nothing but Psych and dragged
> it to **C+**.

No designer placed that. It is the composition of four independent systems — a
person the player cared about, an authored deadline, hours as a shared currency, and
a roll that happens two days early — and it produced a three-act arc with a real
cost, a real recovery, and a grade the player will remember. The sacrifice log
should record it exactly that way:

```ts
sacrifices: [{ date: '2027-10-16', chosePerson: 'freya',
               gaveUp: 'psych15.midterm',
               cost: { hoursLost: 6, bracketBefore: 'narrow',
                       bracketAfter: 'moderate', gradeDelta: -2 } }]
```

`gradeDelta` is computable because §4.4 is deterministic: the engine can replay the
roll with the hours the player *would* have had, and state the counterfactual in the
epilogue. That is a sentence no LLM could be trusted to produce and that the engine
gets for free.

### 7.6 Why the LLM must not own this

Romance is exactly the system where an LLM feels magical for ten minutes and then
falls apart. It would advance the relationship because advancing is narratively
satisfying, regardless of whether you earned it, and it would forget that you
stood her up in October. The state machine can't forget and can't be charmed. The
LLM's job is to make the transition *land* — and it's very good at that.

### 7.7 Traits are contagious: the people you pick change who you are

Until r6, traits flowed one way — the player had traits, they fed Affinity (§7.4), and
NPCs were fixed. That is backwards from the thing a university year is actually
*about*. So: **sustained time with a person can give you one of their traits.**

**r10: only positive-cost traits are ever contagious.** Once traits have prices (§7.8),
hindrances must be excluded from the pool entirely — catching *bad with numbers* from a
friend would punish the player for the one behaviour this whole section exists to reward,
and traits do not come off again.

Some traits are marked `contagious` in content; most are not. Contagious ones are
habits and dispositions — *highly organized* · *quietly intense, works best alone* ·
*outgoing, thrives in group settings* · *pragmatic, career-focused* · *restless
creative* — and a language, which is the strongest case in the whole design because the
prototype produced it naturally: the player's Swedish went from a shared tag to a
private register. Not contagious: hometown, school type, family background, varsity
athletics. You cannot catch having grown up in Lagos.

**The gate is deliberately slow and steep.** Acquisition needs cumulative hours with
the person past a high threshold, Warmth above a floor, and the trait to be one you
have been *repeatedly exposed to in context* — you pick up *highly organized* from
someone you actually studied with, not someone you ate lunch beside. Roughly a
semester of real investment in one person, which means a player gets a handful of
these in a year, not a collection.

**Every acquisition is a Tier 3 milestone.** This is one of the few things in the game
that changes who the player *is*, so it gets the full scene treatment and an explicit,
named line in the epilogue. It should feel like a realisation, not a level-up: you
notice you have started doing the thing they do.

Why this earns its complexity:

- **It closes the loop on Affinity.** Traits gained from your first-semester friends
  change who you click with in year two. The friend group you fell into in September
  quietly determines who is reachable to you as a sophomore — which is both true to
  life and the strongest possible argument for the four-year schema (§11).
- **It feeds §4.5 and §7.2 mechanically.** *Highly organized* improves what standing
  commitments you can actually hold; *outgoing* accelerates the acquaintance curve;
  *works best alone* raises solo study and dampens the joint multiplier. Traits are
  not cosmetic and they are not strictly upgrades.
- **It makes a strong friend a fork in the road.** Investing a year in one person
  costs the breadth of a network and pays a permanent change to your own sheet. That
  is the same shape as every other decision in this design, applied to the thing that
  matters most.

Two guard rails. Traits are **acquired, essentially never lost** — an early bad
grouping must not be able to lock a player out of anything, so traits are keys, not
locks. And a small number of contagious traits are **mutually exclusive**
(*works best alone* / *thrives in group settings*), where acquiring one displaces the
other. That is the only place a trait leaves, and it is the interesting place.

### 7.8 Character creation, and why it is not optional

**r8.** Everything in §7.4 and §7.7 runs on **the player's own trait set** — Affinity is
trait overlap weighted by rarity, and contagion adds to that set over time. Which means
that if the player's starting traits are fixed, so is the entire social graph, in every
playthrough, forever. The same people are reachable, the same bonds are cheap, the same
romance is available on the same terms. That is a strange thing to build underneath a
design that claims replay is a mastery curve (§4.7).

So: **you build a character, and Pekka ships as a preset.**

```
  PEKKA VIRTANEN — preset                        budget 10 · spent 10 · left 0
  ─────────────────────────────────────────────────────────────────────────────
  hometown       Tampere, Finland
  school type    public, non-US
  program        degree                                              (§9.5)
  intended track Computer Science — MBB               (a target, not a commitment)

  traits         international student                                  +3
                 └─ Nordic  → Swedish                                  −3
                 long mathematics                                      −3
                 highly organized                                      −4
                 works best alone                                      −1
                 endurance athlete                                     −2
  ─────────────────────────────────────────────────────────────────────────────
  resulting levels     math +2   stats +1   writing −1   discussion −1
                       code 0    reading 0  lab 0
  ─────────────────────────────────────────────────────────────────────────────
  Costs are illustrative, not balanced. − spends, + refunds.
```

**Nothing but traits is ever bought.** The levels on the bottom line are not a second
spend — they are what the traits above them *did*. `long mathematics` costs 3 and therefore
buys +2 `math` and +1 `stats` on r11's schedule below; `international student` is −1 to
everything tagged `writing`, because writing sustained argument in a second language is
genuinely harder; `works best alone` takes `discussion` down with it. This is r9's argument
carried one step further: r9 removed points from four attributes and moved them onto
subject levels, and r10 removes them from there too. You cannot put a point on a number
anywhere in this game. You choose facts about a person, and the numbers follow.

What creation sets, and nothing more: **hometown, school type, program, an optional target
track, and a set of traits that spends the budget exactly.** That list got shorter in r10,
which is the point — family background and languages used to be separate fields and are now
*traits*, and the level spend is gone entirely because levels are derived. One payload, one
validator, one place a build can be wrong. Everything here is precisely the non-contagious
dimensions from §7.7 — the ones the game will never change — plus a small contagious seed
the game *will* change.

**The preset's arithmetic, worked, because it should be checkable:**

```
  spends   Nordic −3 · long mathematics −3 · highly organized −4
           works best alone −1 · endurance athlete −2          = −13
  refunds  international student                                = +3
  net                                                           = −10   budget 10 ✓

  levels   long mathematics      +2 math  +1 stats     (the −3 row of the schedule)
           international student −1 writing
           works best alone      −1 discussion
```

Two of those traits are deliberately *not* level purchases, and they are the honest cases
the schedule's third rule covers. `highly organized` at −4 buys no level at all — it buys
§3.1's spin-up behaviour and §3.4's commitment adherence, which is worth more than any two
levels and is priced by judgement. And `works best alone` is a **mixed** trait: it nets to
−1 because a solo-study benefit is offset by the `discussion` penalty it comes with. A trait
is allowed to be both, and the tolerance in the schedule is what makes that sayable.

#### The points buy asymmetry, not quality

**r9.** There are no attributes to spend points on (§8 explains why all four were
deleted). Points go into **starting per-subject levels**, and the budget is zero-sum:
every subject you begin ahead in is one you begin behind in. *(r10 and r11 replaced this
mechanism twice over — points buy traits, traits move levels, and the budget balances
**costs against refunds** rather than levels against levels. The argument below is what
survived both passes intact, which is why it is still stated in its original form: the
conclusion is that a start must be a **shape**, and every later revision found a better way
to produce one.)*

That single constraint does a lot of work:

- **It cannot be optimised**, which is what this section requires. There is no build that
  is simply stronger; there are builds that are strong in different weeks of the term.
- **It feeds §4.5 instead of fighting it.** The joint-study mechanic runs on the *gap*
  between you and a partner. A global intellect stat would lift you above everyone in
  everything and quietly delete the ×1.6 band; asymmetric levels create the gaps that
  make specific people useful to you in specific subjects.
- **It makes `school type` and `background` load-bearing.** A Finnish public school start
  is plausibly strong in Math and weak in Expos — writing sustained argument in a second
  language is genuinely harder. A US prep school is the reverse. So the background choice
  produces an academic *shape*, not a bonus, and the shape is diegetic: you took the
  calculus, you never touched CS.
- **The budget size is a difficulty setting.** A smaller budget means a flatter start and
  fewer subjects where you have any edge — a real difficulty lever that costs no content.

And it is more distinct than a stat block, not less. *"Strong in Math, hopeless at writing
English, works best alone, runs every morning, speaks Swedish"* is a person.
`Int 62 / Dis 71 / Cha 44 / Res 55` is a character sheet.

#### Traits have prices, and hindrances pay them back

**r10.** Every trait carries a **cost**. Most spend from the budget; some *refund* into it.
The reference is Project Zomboid, and it is the right reference — a build is assembled by
deciding what you are willing to be bad at.

```
  ATHLETE BACKGROUND                                                       −2
  Six years of organised sport. You know how to show up.
    → Condition floor +2, and Condition falls slower over a bad week   (§3.5)
    → unlocks   RECRUITED ATHLETE · OLYMPIAD · TEAM CAPTAIN
    → reaches   14 people in the pool

  BAD WITH NUMBERS                                                        +2
  Arithmetic was always someone else's talent.
    → −2 math      formal manipulation, proofs, calculus       primary
    → −1 stats     inference, study design, reading results     secondary
    → excludes  LONG MATHEMATICS · OLYMPIAD
```

The `stats` secondary is doing real work, and it is r11's clearest illustration of why a
hindrance spreads. Reading a results table where the control group measures differently is not
calculus — people are routinely fine at one and hopeless at the other — so `stats` is its own
tag and a *correlated* penalty rather than the same one. Which produces the trap: a player
takes `bad with numbers` specifically to avoid CS, and then meets Psych 15's statistics unit,
Government's methods requirement, and MBB's Stat 110. **You cannot escape numbers by studying
people**, which is true of Harvard and is exactly the bet-with-a-due-date r10 needs.

Note also what the trait does *not* need to enumerate. It never mentions CS 50 — but CS 50
demands `math: 1` alongside `code: 2` (§4.1), so the −2 lands there anyway. **Reach is
emergent from how courses are tagged, not authored per trait**, which is what keeps a
fifty-trait vocabulary from becoming fifty little matrices. Hence the cap: **one primary at −2,
at most one secondary at −1.**

Four rules make this an economy rather than a shopping list:

- **Traits move *subject tags*, not named courses.** `bad with numbers` is −2 to everything
  tagged `math`; it does not enumerate CS 50 and Stat 110. Subject tags are authored on
  subjects in `content/` alongside the syllabi, so adding a course never means revisiting the
  trait list, and one trait can shape a whole area of the curriculum. This is also the only
  version that survives four years of content (§11).

  > **Two tag namespaces, and they must never be merged.** A trait's `affects:` are
  > **subject tags** — `math`, `writing`, `code` — the curriculum surface it modifies. A
  > trait's `tags:` are **kind tags** — `multilingual`, `athletic`, `international` — what sort
  > of fact it is, used by Affinity's kind tier (§7.4). `speaks Swedish` has kind tag
  > `multilingual` and affects nothing academic; `bad with numbers` affects `math` and has no kind
  > tag at all. They are different fields with different vocabularies, and a schema that lets
  > one string serve both will eventually let a trait grant Affinity for being bad at
  > calculus.
- **Levels are priced convexly and refunds concavely.** Stacking three math-positive traits
  should cost more than the first one did, and going a level deeper into a hindrance should
  pay *less* than the level before it. Without both curves the dominant strategy is always
  "one enormous spike, everything else dumped." *(r11 replaces this paragraph's original
  "refunds are priced flatly" with a schedule; flat refunds were nearly the bug — see below,
  where the first draft of that schedule paid **more** per level the deeper you went.)*
- **Refunds are capped at about half the budget.** Not a cap on the *number* of hindrances,
  which is arbitrary and scales badly — a cap on total refund, which scales automatically
  with the budget and therefore with difficulty.
- **The budget is one number in `content/`** (§4.9), which keeps r9's free difficulty lever
  intact: a smaller budget means fewer defining facts about you, in either direction.

#### r11: the cost schedule, so prices are derived rather than guessed

§4.9 named the real risk in r10 — fifty trait costs are fifty numbers guessed simultaneously
against each other. **A fixed schedule removes the guessing:** you do not price a trait, you
describe its shape and the price falls out.

**Buying levels.** Convex in the primary axis, which is where spikes get built:

| Cost | Primary tag | Secondary tag | Note |
|---|---|---|---|
| **−1** | +1 | — | |
| **−2** | +1 | +1 | breadth |
| **−3** | +2 | +1 | depth — note +2 primary costs 3, not 2 |
| — | +3 | — | **not available at creation.** You are eighteen. |

**Refunding levels.** Concave, and this is the correction that matters most:

| Refund | Primary | Secondary | Total damage | Points per level of damage |
|---|---|---|---|---|
| **+1** | −1 | — | 1 | 1.00 |
| **+2** | −2 | −1 | 3 | 0.67 |

**No single trait refunds more than +2 in levels.** Together with concavity, that closes the
farm: going catastrophically bad at one thing pays *worse* per level, so a large refund
requires several hindrances across *different* tags — and breadth of damage is far harder to
route around than depth, since the college picks some of your courses (§9.1). The pressure
points the right way.

**Grants are priced; exclusions are free.** An exclusion only costs you something if you
wanted the excluded thing, and you didn't or you would not have taken the trait. Paying for
`excludes: olympiad` would make the dominant hindrance whichever one excludes three traits
nobody takes. Exclusions are the DAG being structurally honest, not a currency.

**Then multiply by a derived weight, because shape is not value.** The schedule prices *shape*
and would otherwise price `+1 math` and `+1 discussion` identically — which they are not, since
the curriculum is not symmetric. So:

```
cost = round( schedule(shape) × weight(the specific tag) )
```

and both weights are content queries the project already runs, not hand-tuned numbers:

- **Subject tags** — weighted by requirement coverage: how many requirements demand this tag,
  and how avoidable they are. This is *the same join* as the invariant below, so the query that
  proves a hindrance bites also says what it is worth. Add a math-heavy track and numeracy
  quietly gets more expensive, correctly.
- **Kind tags** — weighted by rarity against the live NPC pool (§7.4), already specified.

Three rules keep the schedule honest rather than tyrannical:

- **It validates with ±1 tolerance; it does not generate.** A schedule enforced exactly starts
  driving content — you would invent a grant for `bad with numbers` purely to fill a column,
  and filler traits are how a vocabulary rots.
- **Round costs up, refunds down.** The player is the one hunting mispricings, so bias every
  rounding against them and the residual errors come out boring instead of exploitable.
- **Structural effects are outside the schedule, and that is admitted.** `international
  student` refunds +3 while only −1 of it is a level; the rest is no US school network, breaks
  as a logistics problem, and visa constraints. No table prices that. It is a judgement call,
  which is exactly what the tolerance and the balance bot exist for — better to say so than to
  pretend the schedule is total.

#### Min-maxing is the feature; dominance is the bug

The player's own framing, and it is the correct one: *a hard game with a dumb jock who wants
to be a computer nerd, or an environmentalist studying Government.* Those builds should be
**buildable and bad**, and the fact that they are bad is the entire appeal. A player who
takes `bad with numbers` and then targets CS has set their own difficulty, diegetically,
on the creation screen. That is a better hard mode than a slider, because it comes with a
story attached.

So r8's rule needs restating, because as written it was too strong. It is not *no build is
stronger* — the jock **is** weaker, on purpose. It is:

> **No build is strictly stronger.** A refund must buy something the player actually
> wanted, and a hindrance must cost something they cannot route around.

Only the second clause is hard to guarantee, and it is where Project Zomboid actually leaks:
its notorious builds take hindrances whose downside never arrives, because a survival sandbox
lets you control your own exposure. A university does not, and that difference is already
built.

#### Why a hindrance always bites, and it isn't the balance pass

**College requirements are held separately from track requirements** (§9.1), and they are not
negotiable. Harvard makes everyone satisfy a distribution spread and a quantitative
requirement. So `bad with numbers` cannot be dodged by never declaring CS — the *college*
puts you in a math-tagged course, in a term you did not choose, at a workload you did not
plan, and the −2 applies for the whole of it.

That converts the min-max from an exploit into **a bet with a due date**. And a lost bet is
fully playable with machinery that already exists: a Gen Ed you have to survive (§4.4), a
track that closes with the reason stated (§9.3), or a term that ends below 2.0 (§4.10).

One content invariant makes this a guarantee rather than an intention, and it is
machine-checkable:

> **Every tag a hindrance can target must appear in at least one requirement no student can
> avoid.** If someone authors a hindrance against a tag the college never forces, CI fails.

That is a better safeguard than tuning, because it cannot silently rot as courses are added.

There is also a second bite, and it is the more interesting one. §4.5 says a subject level
moves with hours banked, and that the joint-study multiplier peaks against a partner **one to
two levels ahead**. A player who starts −2 in their own concentration is therefore the player
for whom the ×1.6 band is widest and most necessary. **The handicap build is the build that
has to use other people.** Hard mode does not just make the game harder; it forces the player
through the best mechanic in it — which is a thoroughly appropriate thing for a game about
university to do.

#### Traits gate traits

`requires` and `excludes` on trait records, exactly as the player described: `athlete
background` unlocks `recruited athlete`, `olympiad`, `team captain`; `bad with numbers`
excludes `long mathematics`. This is a small prerequisite DAG, and §9.3 already built the
part that is actually hard — a solver that reports **why** something is closed rather than
merely greying it out. Creation reuses that reporter verbatim: *"Olympiad requires Athlete
background or Long mathematics; you have neither."*

Two consequences worth having:

- **`international student` becomes a trait, not a field.** It was a `background` string;
  it should be a priced, gating trait, since it is the single most consequential fact about
  the prototype's protagonist. It refunds — no US school network, `writing` is harder,
  Thanksgiving is a logistics problem, and `program` interacts with it (§9.5) — and it opens
  the rare-language traits that §7.4 weights most heavily. The orientation-week
  international check-ins already sit in the campus calendar waiting for it.

  **r11 gives it a mandatory child**, which is the shape the whole trait tree should follow:
  a broad fact, then a forced specialisation that makes it specific.

  ```
  INTERNATIONAL STUDENT                                                   +3
    kind tag   international
    affects    writing −1        arguing at length in a second language
    excludes   US SCHOOL · HOMETOWN US
    requires   exactly one of ↓

      NORDIC          −3    a language from [Finnish · Swedish · Norwegian · Danish]
      EAST ASIAN      −3    a language from [Mandarin · Korean · Japanese · Cantonese]
      SOUTH ASIAN     −2    a language from [Hindi · Urdu · Tamil · Bengali]
      ANGLOPHONE      +1    no language gained — the mildest, cheapest version
  ```

  Three things this gets right that one flat trait could not. **It feeds both Affinity tiers
  from one structure** — the child supplies the rare *exact* match (Swedish × Swedish), the
  parent supplies the common *kind* match (`international` × `international`), so a Finn and a
  Korean have something real and small in common while a Finn and a Swede have something large.
  **`Anglophone` refunding is correct and self-balancing**: a Canadian is genuinely
  international — no US school network, breaks are still a problem — but gains no rare
  language, so it is the pure-cost version and should pay. And **Pekka nets to zero**: +3 then
  −3, no points spent, and what he bought was a rare language, a thinner starting network, and
  a permanent `writing` penalty. §7.8's "asymmetry, not quality" demonstrated in arithmetic
  rather than asserted.

  The non-Anglophone children are also what actually deliver §9.1's `language: testable_out` —
  two recovered course slots — so the parent refunds points and the child buys the slots back.

- **Exclusion, not removal.** *"It removes the `local` tag"* was the natural way to describe
  this, but `excludes` is the better mechanism and it is already in the schema. A removal is
  imperative, so purchase order starts to matter or a resolution pass is needed; `excludes` is
  declarative and the DAG validator checks it for free. Nothing needs to auto-grant `local` —
  being local is itself purchasable (`US school`, `hometown US`), so international simply
  excludes those and there is nothing to strip. If something ever does auto-grant tags, revisit
  it then.
- **Gating is how a build acquires a theme.** `environmentalist` is not a stat; it is a
  conviction that opens a cluster of extracurriculars and people and closes another cluster
  (you are not going to enjoy the finance club), and it pairs with Government — a
  `writing`-heavy track — to produce a genuinely hard run if you also took a `writing`
  hindrance. Theme, difficulty, and social graph from one choice.

#### What an athlete build buys, and what it does not

One correction, because it matters for what gets authored. There is no sports concentration
at Harvard, and §4.7 forbids inventing one, so `recruited athlete` must not grant academic
levels in a subject that does not exist. It should not route through an `esteem` tag either;
that would be an attribute wearing a costume, which is exactly what r9 deleted.

What it buys instead is already fully modelled, and it is substantial:

| Athlete traits give you | Via |
|---|---|
| Extracurricular **Reputation**, tracked separately from academic | §8 |
| A **closed roster** of teammates seen daily — the deepest-bond mechanic | §3.5, §7.2 |
| A **Condition** floor, which is now the Stress recovery rate | §3.5, §8 |
| Access to traditions and away trips as authored beats | §10 |

And it costs the calendar, brutally, with no new rules: a varsity sport is a §3.4 standing
commitment eating roughly two bands a day six days a week, with travel that removes whole
weekends, and breaking it has the same consequences as breaking any other promise. That is a
real price, paid in the game's actual currency, and it prices itself. A dumb jock is not
short of ability — he is short of bands, and behind in `math`.

#### Where this collides with the rest of §7, and the rules that fix it

Adding prices to traits touches two systems that already assumed traits were free.

- **Hindrances are never `contagious`** (§7.7). Catching `bad with numbers` from a friend
  would punish the player for the exact behaviour this design is built to reward, and since
  traits are acquired-essentially-never-lost, it would be permanent. Only positive-cost
  traits enter the contagion pool.
- **A trait acquired by contagion is free, and that is a legitimate strategy.** Costs exist
  only at creation, so declining to buy `highly organized` and instead catching it from
  someone in November is a real play — one that costs a semester of investment in one
  person, which is precisely the §7.7 fork in the road. Deliberate, not a loophole.
- **Hindrances carry Affinity weight 0 by default** (§7.4). Otherwise cheap hindrances buy
  social reach, which is a second dominance vector. A few may be flagged `bonding` where a
  shared weakness genuinely is one — two people drowning in the same Gen Ed is a real
  friendship — but that is an authored opt-in, never the default.

Why this is cheap rather than a new system: the trait vocabulary already exists, rarity
is already computed against the actual NPC pool at boot (§7.4), and the tracks already
exist (§9.1). Creation is a screen over machinery that r6 and r7 already built. What it
buys is large:

- **A rare language is a different game.** Swedish is weighted heavily precisely because
  almost nobody in the pool has it, so it makes two or three specific people
  disproportionately reachable — which is exactly how the prototype's deepest bond
  happened. Pick Mandarin instead and a different pair of people become your year.
- **Replay gets a second axis.** You already learn the calendar on a second run (§4.7);
  now you can also *deliberately* play a version of yourself who cannot study alone, or
  who knows nobody.
- **Pekka stays reproducible.** The preset means the prototype's playthrough remains
  playable, the authored relationships attached to him still work, and there is a known
  configuration to balance and test against.

One rule to prevent the obvious failure: **no trait is strictly better than another** —
every one opens some people and closes others, exactly as §7.7 requires — and the creation
screen shows what a choice *reaches* and what it *unlocks*, never what it scores. If the
balance bot finds a build that is better at everything, the costs are wrong. A build that is
much worse at everything is not a bug; it is r10's hard mode, and someone chose it.

---

## 8. State model

**Resources**
Half-bands (§3.1 — twelve discretionary halves plus Night on an empty day) ·
Energy (0-10, carries, borrowable against Night)

**Meters** (0-100)
Stress (>80 risks a burnout milestone) · Condition (§3.5 — slow; runs and gym up,
snack diet down) · Reputation, tracked separately for academic / social /
extracurricular

**There are no attributes.** r9 deleted all four, and this is the single largest
simplification in the document's history. What replaced each one:

| Deleted | Its job now belongs to | Why that is better |
|---|---|---|
| **Intellect** | **per-subject levels** (§4.5), derived at creation from the trait build (§7.8, r10) | Asymmetric by construction, and a global stat actively damaged the joint-study gap |
| **Discipline** | the traits `highly organized`, `works best alone` (§7.7) | Already specified there, with effects. A scalar beside a trait doing the same job is duplication |
| **Charisma** | traits (`outgoing` accelerates the acquaintance curve, §7.7) | Same. Affinity is trait overlap; a global charm multiplier flattens it |
| **Resilience** | **Condition drives Stress recovery** (below) | Turns a number you were dealt into something you maintain 180 times |

The reasoning that decided it: **points and traits obey opposite logics.** A trait opens
some doors and closes others, which is what §7.8 requires of everything on the creation
screen. A point on a 0–100 scalar just makes you better — Intellect 70 beats Intellect 40
at studying, always. Put both on one screen and the traits become decoration while the
points become the real build.

**Condition is now the stress-recovery rate**, and this is the piece that earns its keep.
Stress accrues from deadlines, conflict, broken promises and Night-band borrowing. How
fast it falls, and how high your burnout ceiling sits, is set by Condition — which §3.5
already feeds from the daily wakeup run, the Saturday gym, and whether you have been
eating or snacking.

Which makes the morning run **your Stress buffer** rather than a line on a grid. The
player who cuts it for three weeks to buy study bands is spending resilience they will
want in November, and the prototype's own schedule already contains the input: a wakeup
run every single day and one gym session on Saturday. Nothing was invented here; a stat
was deleted and an existing habit was given a consequence.

What still *grows* over the year, since the attribute block was the notional home for
character growth: per-subject levels (hours), the trait set (contagion, §7.7), Condition,
and the network (§7.2). Four growth vectors, all specified, all visible to the player.

**Academic** — per enrolled course: attendance record per session; **the study-hour
tally toward that course's next assessment** (§4.4); a **per-subject level** feeding
joint-study matching (§4.5); and per assignment: hours invested, completion, whether
the work was genuine or copied, submission time, lateness, and — for resolved items —
the hidden draw, the improvements applied to it, and the resulting score. Also, per
assessment, the **confidence inputs** — practice problems attempted, review sessions and
office hours attended, whether a partner who had seen the material was present (§4.4).
Those are state because they are *history*: a review session in week three still counts
in week nine. The draw is **never** in a view model; confidence is. Global: GPA, credits.

**Study plan** (§9) — `program`, the target `track` (nullable until declared),
`declaredAt`, planned course assignments per future term, and the cached feasibility
result per track with its reason string.

Note that **the syllabus, the tracks, and the requirement graphs are not state** —
they're content. See `ARCHITECTURE.md` §3.1.

**Commitments** — the standing weekly plan (§3.4), plus planned-vs-actual hours per
commitment per week, so a broken promise has a name and a number.

**Calendar** (§3.6) — the player-authored event set: recurrences with their exception
lists, one-offs, spans. Institutional events are content, not state.

**Arrangements** (§3.5) — pending, held, and broken study/social pacts, each with who
made it, when it was made, and who broke it.

**Body** (r7) — two numbers and nothing more. `bandsSinceFood`, the gap clock that
prices every meal decision (§3.5), and `Condition`, the slow axis that morning runs and
gym bands raise and a diet of snacks lowers. Deliberately not a suite of stats: this is
a game about time, and the body exists here only because skipping meals to buy bands has
to cost something.

**Social** — NPCs per §7, plus `known: NpcId[]` per venue and per-venue meetings
attended, which is what the saturation curve reads (§7.2). **Affiliations** — orgs with
status (`none` → `comping` → `member` → `board`) and Standing.

**Player traits** — the current trait set, each with its provenance: set at creation,
or acquired from a named NPC on a named date (§7.7). The provenance is not
bookkeeping; it is epilogue material.

**Creation** (§7.8) — hometown, school type, `program`, plus the **resolved build**: the
trait set as purchased, each trait's cost, and the budget it was spent against. Set once,
never mutated, and referenced by Affinity every time a new NPC is met. Distinct from `Player
traits` precisely because these are the dimensions the game will never change. Note that
family background and languages are *not* separate fields any more — r10 made both traits, so
they live in the build and nowhere else.

The costs are kept even though nothing reads them in play, for two reasons: the epilogue can
say what you chose to be bad at, and a save must remain re-validatable against the content it
was created under. **Starting subject levels are not stored here** — r10 made them derived
from traits (§7.8), so they are computed at boot from the build and the tag table, and only
their *movement* through banked hours is state.

**Levels** (r11) — thirteen numbers, one per subject tag (§4.1), each the derived start plus its
accumulated movement. The count is worth stating because these levels are now read by
two different systems that must agree: the demand gap against a course, and the partner gap
against a person (§4.5). Nothing else in state is allowed to hold a per-subject competence
number, or the two gaps will eventually disagree about how good you are at statistics.

**Standing** (§4.10) — probation history per term, the current extracurricular band cap
if any, and whether honours eligibility has been lost. On the record permanently, and
read by the epilogue.

---

## 9. The study plan

The single largest addition in r6, and it is the system that gives the whole game a
spine longer than a term. **You choose what you are trying to become, and every course
choice is measured against it.**

The prototype had this and I had missed how load-bearing it was. Its `Course Plan`
sheet is not a list of courses — it is a **track decision with its consequences worked
out**, including a two-page argument the player wrote themselves about why MBB beats a
full joint concentration ("costs real scheduling flexibility for outside electives").
That argument is the game. A player who has that argument with themselves has been
given something no individual Tuesday can offer.

### 9.1 Tracks

A **track** is a named destination with a requirement graph. Year 1 you have not
declared; you are accumulating courses that open or close tracks, and the game's job is
to tell you honestly which is which.

```yaml
track:
  id: cs-mbb
  name: "Computer Science — Mind, Brain & Behavior track"
  field: cs
  honors_eligible: true
  thesis_required: true
  declare_by: { year: 2, term: fall }
  requirements:
    - { id: prog-1,      need: 1, from: [cs50] }
    - { id: prog-2,      need: 1, from: [cs51, cs61] }
    - { id: formal,      need: 2, from: [cs20, cs1200, cs1210, cs1240] }
    - { id: probability, need: 1, from: [stat110] }
    - { id: cs-core,     need: 8, from: [ ... ], counts: [prog-1, prog-2, formal] }
    - { id: mbb-core,    need: 3, from: [psych15, mcb80, neuro80, ...] }
    - { id: thesis,      need: 1, from: [cs91r] }
  diploma: "Computer Science"
```

The tracks worth shipping, because they differ *mechanically* and not just in name:

| Track | Shape of the burden |
|---|---|
| **CS, basic** | 9 CS courses, no thesis, not honours-eligible. The most free bands of any track. |
| **CS, honours** | 11 CS courses. Heaviest single-field load; leaves almost no elective room. |
| **CS + MBB** | 8 CS courses + 3 MBB + thesis. Lightest honours-eligible CS load — buys elective freedom, spends it on a thesis. |
| **Sociology, basic** | Reading- and writing-heavy rather than problem-set-heavy: different weekly rhythm, more essays, fewer psets. |
| **Sociology, honours** | Adds a thesis and a methods sequence. |
| **Sociology + ecology / environmental** | Cross-divisional; adds lab courses, which are **multi-band events** (§3.6) and hit the calendar much harder than their credit count suggests. |
| **Joint concentration** | Full requirements from *both* fields plus a thesis acceptable to both. The hardest track in the game, and the diploma says so. |

That last row is the design justification for the whole section: a joint concentration
should be *visibly* the hard road, and with a requirement graph it is — the feasibility
check (§9.3) simply tells you it no longer fits.

**College-wide requirements live separately**, because every track carries them and
duplicating them across tracks is how requirement data rots:

```yaml
college_requirements:
  - { id: expos,        need: 1, from: [expos20] }
  - { id: gen_ed,       need: 4, one_from_each: [aesthetics, ethics, histories, science_society] }
  - { id: distribution, need: 3, one_from_each: [arts_hum, social_sci, sci_eng] }
  - { id: quant,        need: 1, subject_tag: math }
  - { id: language,     need: 2, testable_out: true }
```

**r10 added the `quant` row, and it is not decoration.** Harvard requires quantitative
reasoning of everyone, and §7.8's hindrance economy depends on that being true in content:
`bad with numbers` is only a real cost if the college can put you in a math-tagged course
against your will. Note it is expressed as a **subject tag** rather than a course list, which
is what lets the CI invariant in `ARCHITECTURE.md` §10 check it mechanically.

`language: testable_out` is the mirror image, and worth noticing because it is the clearest
case of a refund trait paying for itself: a native Finnish speaker tests out and recovers two
course slots — roughly half a term of freedom — which is a large, concrete benefit sitting
opposite `international student`'s refund. That is what §7.8 means by *a refund must buy
something the player actually wanted*, and it was already in the content before r10 needed it.

Different fields also have different **assessment mixtures**, and that is where the
track choice reaches the daily loop: a CS track's hours go into problem sets and
projects with hard binary completion; a Sociology track's go into essays with two
staged deadlines each (§4.4). Those feel different to schedule, and they interact
differently with joint study — an essay is much harder to work on with someone than a
p-set, which quietly makes the humanities tracks lonelier. That is a real difference,
and it comes for free from data already in the syllabus schema.

### 9.2 The planner

A screen, always available, never a scene. It shows:

```
CS + MBB track (undeclared — declare by Fall Y2)          28 / 32 slots planned

  Programming 1     ✓ CS 50                                    done
  Programming 2     ○ CS 51 or CS 61                            planned Y2 Fall
  Formal reasoning  ◐ CS 20 planned · 1 more needed
  Probability       ○ Stat 110                                  planned Y1 Spring
  MBB core          ◐ Psych 15 done · 2 more needed
  Thesis            ○ CS 91r                                    Y4
  Gen Ed            ▓▓░░  2 of 4
  Language          ▓▓▓▓  tested out (Swedish, Finnish)

  ⚠ Sociology honours: no longer reachable — methods sequence needs 3 semesters
  ⚠ Joint (CS + Neuro): reachable, but 0 free elective slots remain
```

The two warnings at the bottom are the point of the whole screen. **A track closing is
a consequence, and the player should watch it happen.**

### 9.3 Feasibility is the interesting query

With `k` semesters left at four courses each, is a track still reachable? This is a
pure engine query over content — a small constraint solve, no LLM, no randomness — and
it is the most consequential number in the game because it converts a Year-1 course
choice into a visible Year-4 outcome.

Three outputs, and each is a different kind of decision:

- **Reachable, with slack** — you can still afford to explore.
- **Reachable, tight** — every remaining slot is spoken for. Fail a course and the
  track closes.
- **Closed** — with the specific reason. *"Requires the methods sequence, which is
  three consecutive terms, and you have two."*

The third is the one that makes shopping week (§4.6) matter beyond the term. Right now
shopping week asks "can I survive this workload?" With the planner it also asks "what
does this cost me in three years?" — and unlike the workload question, the player
cannot answer this one by intuition. They need the tool. That is a good reason for a
screen to exist.

**Failure has to be able to close a track**, or none of this has weight. A failed
prerequisite, a course dropped after the deadline, a term on academic probation — each
consumes slots and can push a track from tight to closed. Which means §4.4's quiet
grading system is what feeds the loudest long-term consequence in the game, exactly as
it should: the grade is boring, what it forecloses is not.

**r11: the solver gains a fourth output, and it is the useful one.** A demand gap of +5
(§4.5) closes a *course*, not a track — so the honest answer is almost never "closed" but
**"closed this year, and here is the cheapest way to open it."** The solver already walks
the requirement graph, so it can walk it one step further: find the lower-demand courses
that raise the blocking tag, and report them.

- **Not yet — 3 routes.** *"Math 21b wants `math` 3, you are at −2. Passing Math 1a
  (wants 0) and Stat 100 (wants 1) puts you at 2 by next fall. Cost: two elective slots,
  and MBB honours goes from tight to closed."*

This is the same reporter §7.8's creation screen borrows, doing the same job in a different
place, and it is why the demand gap was worth adding as a *number* rather than a flag. A flag
can only refuse. A number can be argued with, and told what it would take.

### 9.4 Declaration is a scene

Concentration is declared **sophomore fall** (the prototype's own timing). That is a
Tier 3 milestone with a real conversation, and by then the planner has already told the
player what their year of choices did to their options. The scene's job is not to
present the decision; it is to make the player own it.

Year 1 is therefore played **under deliberate uncertainty**, which is the correct
shape: you take Psych 15 because it interests you, and only later find out it was an
MBB core requirement. The prototype's player did exactly this and then wrote a page
justifying it after the fact. That is the experience being reproduced.

### 9.5 Two decisions that were still open

**The start date: Class of 2031, moving in Thursday Aug 26, 2027, classes from Tuesday
Sep 7, 2027.** Recommendation, and I'd take it unless you object. The reason is
entirely practical: the prototype's `Campus Calendar & Traditions` sheet is already
authored against these dates for all four years, through Commencement in May 2031,
including the Labor Day correction that shifts the first day of classes to a Tuesday.
Re-basing to the present costs a day of calendar work and buys nothing — the game
never mentions the year unless it wants to, and a near-future setting means the world
bible never has to track real events. Freshman year therefore runs **Aug 2027 –
May 2028**.

**Exchange student: build the dimension, ship the degree.** An exchange programme is a
genuinely good mode and a bad first target, because it *removes* the systems this
revision just added — no track, no requirement graph, no declaration, no thesis, no
Housing Day — and replaces them with a single pressure: you are leaving in five months
and everyone knows it. That is a sharp, focused, and much shorter game. It is also the
ideal playtest loop, being one term instead of eight.

So the schema carries `program` from the first commit:

```yaml
program: degree | exchange_term | exchange_year | visiting
```

`program` gates requirement checking (an exchange student has no track and no
declaration), housing (you are placed, not lotteried), and the epilogue (leaving is an
ending, not a failure). Cost now: one enum and a few conditionals. Cost later: a save
migration and a retrofit through the planner. Build the field, build degree mode first,
and turn exchange on when there is a game to be an exchange student in.

The interesting design note is that exchange mode makes **§7.2's saturation curve** the
central mechanic rather than a supporting one. With one term you cannot know many
people, the curve's early-meetings-matter-most shape becomes the whole strategy, and
every arrangement (§3.5) is scarce. It would play completely differently on identical
content, which is the best possible argument for eventually building it.

---

## 10. Freshman year: structure

| Phase | Dates | What it's about |
|---|---|---|
| Opening Days | late Aug | Move-in, roommate assignment, first impressions |
| Shopping week | early Sep | Reading syllabi and choosing your term. §4.6 |
| Fall term | Sep-Dec | Finding your people, the first real academic failure, comping something |
| Reading period + finals | Dec | Consequences arrive |
| Winter break | Dec-Jan | Fast-forwarded, with a reflective milestone |
| Spring term | Jan-May | Deeper relationships, Housing Day, the friendship that doesn't survive |
| Spring finals | May | Year-end epilogue and the five-axis report |

The prototype's `Campus Calendar & Traditions` sheet already contains the fixed
institutional beats for all four years, which is a content file I no longer have to
invent. Year 1: Move-in · Global Day of Service · orientation week · Convocation ·
Crimson Kickoff (first-years compete by Yard) · classes begin · **Crimson Jam** ·
Family Weekend · Harvard–Yale · Thanksgiving recess · fall finals · **Housing Day** ·
spring break · **Yardfest** · **First-Year Formal** · spring finals. Two of these —
Crimson Jam and a Housing-Day-scale event — carried real weight in the prototype's
actual play, which is a useful signal about where to spend Tier 3 milestone budget.

**Scored on five axes** — Academic, Social, Reputation, Wellbeing, Purpose — with
an epilogue written from your Chronicle. The axes trade against each other by
construction; there is no dominant strategy.

**Failure states:** academic probation → required leave; burnout; running out of
money. All reachable, all recoverable if caught early.

---

## 11. Extending past freshman year

Extension is **a content problem plus two bounded features**, provided the schema
is right on day one.

**Free — no engine changes**, given three things now:

1. The calendar is a real date range with a `year` dimension, never a day counter.
2. Courses, syllabi, requirements, and Gen Eds are fully data-driven, with
   `concentration` present and unused in year 1. §4 makes this stronger than it
   was: adding sophomore year is *literally adding YAML files*.
3. All state machines are defined to completion — romance through
   `steady | strained | ended`, org status through `board`, academic standing
   through `probation | leave` — even where year-1 content never reaches them.

**Content only** — more syllabi, beats, NPCs, orgs, calendar events. The bulk of
years 2-4, needing no architectural change.

**Two features needing real new engine code**, deferred deliberately:

- **Housing lottery + blocking groups** (year 2) — group formation, mutual
  preference, a lottery. State fields stubbed now so the schema doesn't migrate.
- **Senior thesis** (year 4) — a long-horizon project with an advisor
  relationship, chapter milestones, a defense. Also stubbed, not built. Worth
  noting it's essentially *a syllabus you write yourself*, so it may reuse §4's
  machinery more than it first appears.

Extra cost of building the schema for four years up front: about a day.
Recommended.

---

## 12. The interface is HTML

**r14. The game is rendered as a browser application: semantic HTML, CSS, and React.**

The prototype established the important thing: the UI must make a dense life simulation
legible and actionable. It did not establish that the terminal is the right medium. HTML
removes the fixed-frame and ASCII constraints while preserving React, the server API, and
the client rule that every game number comes from the server.

The HTML client has these requirements:

- **The planner is spatial.** It needs a stable band grid, direct manipulation, and a
  readable relationship between free time, commitments, and consequences.
- **Choices show their price, never their outcome.** `+1.0 h`, `1 band`, `due Wed`, and
  a confidence shift are valid previews; hidden results remain hidden.
- **Narrative scenes are a distinct reading mode.** They use comfortable prose layout
  and choices at the end, visibly different from the planning view.
- **The application is responsive without becoming vague.** Layout changes by deliberate
  breakpoints and controls remain usable on mouse, keyboard, and touch.
- **Accessibility is part of the renderer.** Use semantic landmarks, native controls,
  visible focus, sufficient contrast, and labels that do not depend on color alone.

The shape, close to the planner sketch:

```
 Monday, 1 May 2028                                    day 213 · 3 free bands
 ─────────────────────────────────────────────────────────────────────────────
  09:15 – 10:30   Math 21b lecture                             Sever 113
> 10:45 – 12:00   ── free ──
  12:00 – 13:15   LUNCH  Annenberg
  13:30 – 14:45   ── free ──
  15:00 – 16:15   Psych 15 lecture                              Emerson 105
  16:45 – 17:30   HCRC official session            you have missed 2 of 4
 ─────────────────────────────────────────────────────────────────────────────
  10:45 – 12:00   what do you do?

   1  Study        Psych 15 midterm      +1.0 h    confidence unchanged
   2  Study        Psych 15 practice     +1.0 h    confidence low → moderate
   3  Work         Math 21b PS6          2.5 h remaining · due Wed
   4  Office hours Psych 15              1 band · Warmth + · confidence ++
   5  Extend       breakfast, sit longer  → Wei, Amelia at the table
   6  Rest

  [c]alendar  [s]tudy plan  [p]eople  [j]ournal  [f]ast-forward  [?]
```

The Chronicle remains readable in-game as a journal view, because the prototype's player
kept one by hand and it was where the game's memory lived (§5.1). Details of the client
toolchain and boundary are in `ARCHITECTURE.md` §1 and §4.

---

## 13. What I am *not* proposing

- **No LLM-driven world state.** §2.
- **No generated academic content.** §4.7. This is now a load-bearing rule, not a
  preference.
- **No open-ended NPC chat.** Free text is per-scene and resolves to a mechanical
  outcome.
- **No procedurally generated beat mechanics.** Beats are authored; that's why
  the game can be balanced.
- **No prose on every day.** §5. A design position, not a budget compromise.
- **No graphics, no sprites, no map screen.** §12. Also a design position — but the
  server contract is presentation-agnostic, so this one is cheap to revisit.
- **No sub-half-band time.** §3.1. Halves or nothing; minutes would make the planner a
  spreadsheet, which is the thing the prototype quit over.
- **No economy, and no money at all.** Established as a non-issue (§1.1), so it is not
  even a tracked resource (§8). Time is the currency the player *spends*; Energy,
  Stress and Condition are the ones that make spending it cost something.
- **No multiplayer, no real-time.**
