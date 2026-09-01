import { inflateRawSync } from 'node:zlib'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
  Syllabus,
  Term,
  realMeetingDates,
  sumDemands,
  termWeekOf,
  type Meeting,
} from '@harvard/engine'

/**
 * `npm run import:courses`
 *
 * Turns `authoring/harvard_course_schema.xlsx` into one course YAML per row under
 * `content/courses/` — tags, meeting pattern and office hours from the sheet, plus a
 * generated session spine and assignment skeleton.
 *
 * Written as a script rather than a loader step on purpose: the spreadsheet is the *author's*
 * working copy, not content. Content is the YAML, which is what the hash covers and what a
 * save pins itself to (ARCHITECTURE §3.1) — an xlsx read at boot would make the content hash
 * depend on a binary nobody diffs.
 *
 * Re-running is safe and is the expected way to pick up a sheet edit: a file this script
 * generated is overwritten, and a file it didn't is never touched, so a transcribed syllabus
 * can't be flattened back into a stub by a rerun. The test for "generated" is the marker
 * comment on line 1 — delete it and the file becomes hand-authored, which is exactly the
 * gesture you want when you start filling one in.
 *
 * Three things the import does rather than passing the sheet through verbatim, each because
 * the sheet's convenient form is wrong *as content*:
 *
 * - **Only non-zero tags are emitted.** The sheet writes 0 for the twelve tags a course
 *   doesn't ask for. Arithmetically the zeroes are inert (levels weight by
 *   `courseLevel / totalDemand`), but `isCourseOpen` iterates every key in `demands`, so a
 *   zero is a prerequisite the course never meant to put up.
 * - **`demand`, `workloadHint` and office-hour `demand` are not emitted at all.** All three
 *   derive from the course's structure (`effectiveDemand` and friends). The sheet's
 *   `officeHours` cells do carry a hand-picked `demand:`, which this strips: the standing rule
 *   is one below the course's own demand, and the course's own demand is itself derived, so a
 *   number picked before either was computed can only disagree with it — as 101 of the 163
 *   rows did.
 * - **The meeting type `language` becomes `drill`,** because a subject tag already owns that
 *   string and §7.8's whole point is that one string never means two things.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const XLSX = join(root, 'authoring', 'harvard_course_schema.xlsx')
const OUT = join(root, 'content', 'courses')
const CALENDAR = join(root, 'content', 'calendar', 'fall2026.yaml')

/** The thirteen closed subject tags, in `SUBJECT_TAGS` order — the sheet's tag columns. */
const SUBJECT_TAGS = [
  'math', 'stats', 'code', 'writing', 'reading', 'lab', 'discussion',
  'proof', 'visual', 'language', 'fieldwork', 'memorization', 'ethics',
] as const

// ── a minimal zip reader ──────────────────────────────────────────────────────────────
// An xlsx is a zip, and Node ships the inflate but not the container. Reading the central
// directory is ~30 lines; a dependency for it would be the larger cost, and this file is
// the only thing that ever needs it.

function unzip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  // End-of-central-directory record: scan back for its signature (no xlsx writer emits a
  // trailing comment, but scanning is what the format actually specifies).
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry ${i}`)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    // Local header: 30 fixed bytes, then its own (possibly different) name/extra lengths.
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28)
    const raw = buf.subarray(start, start + compressedSize)
    files.set(name, method === 0 ? raw : inflateRawSync(raw))
    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

// ── the sheet ─────────────────────────────────────────────────────────────────────────

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

const textOf = (xml: string) => {
  let out = ''
  for (const t of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) out += unescapeXml(t[1]!)
  return out
}

type Row = Record<string, string | undefined> & { _row: number }

function readSheet(files: Map<string, Buffer>): Row[] {
  const sharedXml = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
  const strings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!))
  const sheetXml = files.get('xl/worksheets/sheet1.xml')!.toString('utf8')

  const rows: { n: number; cells: Record<string, string> }[] = []
  for (const rm of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, string> = {}
    for (const cm of rm[2]!.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cm[1]!)?.[1]
      if (!ref) continue
      const type = /t="([^"]+)"/.exec(cm[1]!)?.[1]
      const value =
        type === 's'
          ? strings[Number(/<v>(\d+)<\/v>/.exec(cm[2]!)?.[1])]
          : type === 'inlineStr' || type === 'str'
            ? textOf(cm[2]!)
            : /<v>([\s\S]*?)<\/v>/.exec(cm[2]!)?.[1]
      if (value !== undefined && value !== '') cells[ref] = value
    }
    rows.push({ n: Number(rm[1]), cells })
  }
  const header = Object.entries(rows[0]!.cells) // [column letter, field name]
  return rows.slice(1).map((r) => {
    const o = { _row: r.n } as Row
    for (const [letter, name] of header) o[name] = r.cells[letter]
    return o
  })
}

// ── the session spine and assignment skeleton ─────────────────────────────────────────

/**
 * How many hours of coursework a week a generated course asks for, out of class. Built *up*
 * from what the course is, rather than down from a target total — the way a syllabus states it
 * ("expect two hours outside class for every hour in"). A standard 4-credit course lands near
 * twelve hours all in, which is the figure the hand-transcribed syllabi quote ("~12h/week" for
 * CS50, "~10-12h/week" for Math 21b).
 *
 * Two earlier versions of this are worth naming, because both failed the same way and the
 * shape of the failure is not obvious from the code:
 *
 * - **A flat 12-hour target, coursework as the remainder.** 112 of 163 courses derived to
 *   demand 8; a Gen Ed lecture priced like Organic Chemistry.
 * - **A target scaling with `demands`, coursework still the remainder.** Barely moved it —
 *   and for a much worse reason. If coursework is `target - contact`, then total hours *are*
 *   the target, contact cancels, and `effortScore` reduces algebraically to `4 + Σdemands`.
 *   It held for 162 of 163 courses. The score had stopped being a measurement and become a
 *   relabelling of its own input, and a 5.5h/week lab priced identically to a 2h/week seminar
 *   carrying the same tags.
 *
 * So: coursework scales with contact time *and* adds a term for subject demand, and neither
 * one can cancel the other. `demands` does still reach `effortScore` twice, once through these
 * hours and once as itself — that double-count is deliberate, since `demands` is the only field
 * on a generated course a human actually chose. A transcribed syllabus overrides all of it.
 *
 * Generating any budget at all matters more than the exact coefficients: `demand` and
 * `workloadHint` derive from `estHours`, so a course with no assignments prices at its contact
 * time alone, and 138 of the 160 stubs came out at demand 3 — a catalogue with no heavy
 * courses in it.
 */
const HOURS_PER_CONTACT_HOUR = 1.5
const HOURS_PER_DEMAND_POINT = 1
const MIN_COURSEWORK_HOURS = 2

/** Per meeting day, mirroring `BLOCK_MINUTES` — a course's own contact time. */
const contactHoursPerWeek = (meetings: readonly Meeting[]) =>
  meetings.reduce((sum, m) => {
    const minutes = { MWF: 50, TTh: 75, MW: 75, Th: 180, W: 120, MTWThF: 60 }[m.pattern ?? 'MWF']
    return sum + (minutes / 60) * m.days.length
  }, 0)

/**
 * What the recurring item is called, from the course's own tags. All four are `kind: pset`,
 * which is not a typo: `pset` is the kind that grades on *completion* and draws no hidden
 * card (§4.1), and that is equally true of a lab write-up, a weekly language quiz, and a
 * reading response. The name is cosmetic; the kind is mechanical.
 */
function weeklyItem(tags: ReadonlySet<string>): { prefix: string; title: string } {
  if (tags.has('lab')) return { prefix: 'lab', title: 'Lab Report' }
  if (tags.has('math') || tags.has('stats') || tags.has('code') || tags.has('proof')) {
    return { prefix: 'ps', title: 'Problem Set' }
  }
  if (tags.has('language') || tags.has('memorization')) return { prefix: 'quiz', title: 'Quiz' }
  return { prefix: 'rr', title: 'Reading Response' }
}

/**
 * Whether the two big items are exams or papers. A course that asks for `writing`, and a
 * seminar or tutorial (which is small enough to grade by argument rather than by exam),
 * gets papers; everything else gets a midterm and a final. This is the only branch that
 * changes an assignment's `kind`, and `kind` is what drives the §4.4 draw — an exam draws 8
 * cards, a final 10, an essay escalates 4/5/6 — so it is the one place a wrong guess here
 * would actually change play, rather than just a label.
 */
const isWritten = (tags: ReadonlySet<string>, meetings: readonly Meeting[]) =>
  tags.has('writing') || meetings.some((m) => m.type === 'seminar' || m.type === 'tutorial')

const round = (n: number, places: number) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

const WEEKLY_SHARE = 0.4
const MIDTERM_SHARE = 0.25

type Plan = { sessions: { n: number }[]; assignments: string[] }

function plan(course: Syllabus, term: Term): Plan {
  const dates = realMeetingDates(course, term)
  const sessions = dates.map((_, i) => ({ n: i + 1 }))

  // Session numbers grouped by term week. Thanksgiving is a whole holiday week in Fall 2026,
  // so *some* week is always empty — which is exactly why the weekly items are laid out over
  // the weeks that really have meetings rather than over `1..14`. Getting this wrong doesn't
  // fail loudly; `resolveCourseWeek` throws on the missing session, but only for the courses
  // whose pattern happens to lose that day.
  const byWeek = new Map<number, number[]>()
  for (const [i, iso] of dates.entries()) {
    const week = termWeekOf(iso, term)
    byWeek.set(week, [...(byWeek.get(week) ?? []), i + 1])
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b)

  const tags = new Set(Object.keys(course.demands))
  const item = weeklyItem(tags)
  const written = isWritten(tags, course.meetings)

  // Assigned in one meeting week, due at the first meeting of the next — so an item never
  // lands in a week the course doesn't meet, and the count follows the calendar.
  const count = Math.max(0, weeks.length - 1)
  const contact = contactHoursPerWeek(course.meetings)
  const perWeek =
    contact * HOURS_PER_CONTACT_HOUR + sumDemands(course.demands) * HOURS_PER_DEMAND_POINT
  const budget = Math.max(MIN_COURSEWORK_HOURS, perWeek) * weeks.length

  const weeklyWeight = count === 0 ? 0 : round(WEEKLY_SHARE / count, 4)
  const eachHours = count === 0 ? 0 : round(budget / count, 1)
  // The final absorbs the rounding, so the weights sum to exactly 1.0 (the content test
  // allows 0.001 of slack; spending it here would be spending it for no reason).
  const finalWeight = round(1 - weeklyWeight * count - MIDTERM_SHARE, 4)

  const lines: string[] = []
  for (let i = 0; i < count; i++) {
    const n = i + 1
    const from = weeks[i]!
    const to = weeks[i + 1]!
    const covers = byWeek.get(from)!
    lines.push(
      `  - { id: ${item.prefix}${n}, title: "${item.title} ${n}", kind: pset,` +
        ` assigned: { week: ${from}, session: 1 }, due: { week: ${to}, session: 1 },` +
        ` estHours: ${eachHours}, weight: ${weeklyWeight}, dependsOnSessions: [${covers.join(', ')}] }`,
    )
  }

  if (written) {
    // Reading period: past `term.lastDay`, so `{ week, day }` rather than a session index.
    lines.push(
      `  - { id: essay1, title: "Midterm Essay", kind: essay,` +
        ` due: { week: 8, day: Fri }, weight: ${MIDTERM_SHARE} }`,
      `  - { id: essay2, title: "Final Essay", kind: essay,` +
        ` due: { week: 15, day: Mon }, weight: ${finalWeight} }`,
    )
  } else {
    lines.push(
      `  - { id: midterm, title: "Midterm Exam", kind: exam,` +
        ` date: { week: 8, day: Thu }, weight: ${MIDTERM_SHARE} }`,
      `  - { id: final, title: "Final Exam", kind: final,` +
        ` date: { week: 16, day: Wed }, weight: ${finalWeight} }`,
    )
  }

  return { sessions, assignments: lines }
}

// ── emitting one stub ─────────────────────────────────────────────────────────────────

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Strips the sheet's hand-picked `demand:` out of an office-hour flow mapping. */
const stripDemand = (line: string) => line.replace(/,\s*demand:\s*\d+\s*(?=\})/, ' ')

/**
 * `OfficeHourLength` accepts `free` or `"N minutes"`. The sheet writes the shorthand `30min`;
 * spelling it out here keeps one canonical form in content rather than widening the regex to
 * accept two ways of saying the same thing.
 */
const spellOutLength = (line: string) =>
  line.replace(/length:\s*(\d+)\s*min(?:s|utes?)?\b/, (_, n: string) => `length: "${n} minutes"`)

/**
 * The sheet calls the daily elementary-language class `type: language`; the schema's
 * `MeetingType` calls it `drill`, because `language` is already a subject tag. Two rows.
 */
const MEETING_TYPES: Record<string, string> = { language: 'drill' }
const renameMeetingType = (line: string) =>
  line.replace(/type:\s*(\w+)/, (m, t: string) => (MEETING_TYPES[t] ? `type: ${MEETING_TYPES[t]}` : m))

/** The sheet's `meetings`/`officeHours` cells are already YAML sequence items, one per line. */
const passThrough = (cell: string, transform: (l: string) => string = (l) => l) =>
  cell
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `  ${transform(l)}`)
    .join('\n')

/**
 * Line 1 of every generated file, and the only thing that makes a rerun safe.
 *
 * Deliberately says nothing but "this script made this file" — no source path, no wording
 * that describes the contents. Anything else in here is a liability: the marker is matched
 * literally, so every character of it is a thing that can change and silently orphan all 160
 * generated files, which then read as hand-authored and stop being regenerated. That has
 * already happened twice (once when the header prose was reworded, once when the sheet moved
 * out of `packages/`), and both times the failure was quiet — a rerun that wrote 0 files.
 * Everything mutable belongs in the lines below, which nothing matches against.
 */
const MARKER = '# Generated by scripts/import-courses.ts'

const header = (row: Row) => `${MARKER}
# from authoring/harvard_course_schema.xlsx. Authored, straight off the sheet: the tags this
# course asks of you, how it meets, and where its office hours are. Absent because it derives: \`demand\`,
# \`workloadHint\`, office-hour \`demand\`. Generated, and therefore placeholder: the session
# spine (sized to this course's real meeting dates in Fall 2026 — the count has to match
# exactly or \`fitSessions\` throws) and the assignment skeleton (a weekly item carrying a
# coursework budget sized from this course's contact hours and subject demands, plus a midterm
# and a final — see \`scripts/import-courses.ts\`). Topics stay \`TBD\` until the real
# syllabus is transcribed; when you transcribe one, delete the first line of this file and the
# importer will stop overwriting it.
id: ${quote(row.id!)}
courseCode: ${quote(row.courseCode!)}
title: ${quote(row.title!)}`

function stubYaml(row: Row, course: Syllabus, term: Term): string {
  const demands = SUBJECT_TAGS.filter((t) => Number(row[t] ?? 0) > 0)
    .map((t) => `  ${t}: ${Number(row[t])}`)
    .join('\n')
  const { sessions, assignments } = plan(course, term)

  return `${header(row)}
demands:
${demands}
meetings:
${passThrough(row.meetings!, renameMeetingType)}
officeHours:
${passThrough(row.officeHours!, (l) => spellOutLength(stripDemand(l)))}
sessions:
${sessions.map((s) => `  - { n: ${s.n}, topic: "TBD" }`).join('\n')}
assignments:
${assignments.join('\n')}
`
}

// ── run ───────────────────────────────────────────────────────────────────────────────

const term = Term.parse(parseYaml(readFileSync(CALENDAR, 'utf8')))
const courses = readSheet(unzip(readFileSync(XLSX)))

const written: string[] = []
const skipped: { code: string; sheetId: string; existing: string }[] = []

for (const row of courses) {
  const path = join(OUT, `${row.courseCode}.yaml`)
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8')
    if (!existing.startsWith(MARKER)) {
      skipped.push({ code: row.courseCode!, sheetId: row.id!, existing })
      continue
    }
  }
  // Parsed twice on purpose: once without a spine, to get a `Syllabus` the calendar helpers
  // can size one against, and once with, so a generated file that doesn't validate fails here
  // rather than at the next boot.
  const bare = `${header(row)}
demands:
${SUBJECT_TAGS.filter((t) => Number(row[t] ?? 0) > 0).map((t) => `  ${t}: ${Number(row[t])}`).join('\n')}
meetings:
${passThrough(row.meetings!, renameMeetingType)}
officeHours:
${passThrough(row.officeHours!, (l) => spellOutLength(stripDemand(l)))}
`
  const parsedBare = Syllabus.safeParse(parseYaml(bare))
  if (!parsedBare.success) {
    throw new Error(`row ${row._row} (${row.courseCode}) is not a valid syllabus:\n${parsedBare.error}`)
  }
  const text = stubYaml(row, parsedBare.data, term)
  const parsed = Syllabus.safeParse(parseYaml(text))
  if (!parsed.success) {
    throw new Error(`generated ${row.courseCode}.yaml is not a valid syllabus:\n${parsed.error}`)
  }
  writeFileSync(path, text, 'utf8')
  written.push(row.courseCode!)
}

console.log(`read ${courses.length} rows from ${XLSX}`)
console.log(`wrote ${written.length} course file(s) to content/courses/`)
if (skipped.length > 0) {
  console.log(`\nleft alone (hand-authored, no generated marker):`)
  for (const s of skipped) {
    const authoredId = /^id:\s*"?(\d{3})"?/m.exec(s.existing)?.[1]
    // Worth shouting about: two courses cannot share an id (`assertUniqueCourses`), so a
    // hand-authored file whose id the sheet has since handed to someone else breaks the load.
    const clash = authoredId && authoredId !== s.sheetId ? `  ← sheet says id ${s.sheetId}` : ''
    console.log(`  ${s.code} (id ${authoredId})${clash}`)
  }
}
