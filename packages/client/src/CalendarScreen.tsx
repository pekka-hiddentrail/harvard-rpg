const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type Cell = { day: number | null; current: boolean }

function monthCells(today: Date): { title: string; weeks: Cell[][] } {
  const year = today.getFullYear()
  const month = today.getMonth()
  const start = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset = (start.getDay() + 6) % 7
  const current = today.getDate()

  const cells: Cell[] = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1
    const inMonth = day >= 1 && day <= daysInMonth
    return { day: inMonth ? day : null, current: inMonth && day === current }
  })
  const weeks = Array.from({ length: 6 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
  const title = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { title, weeks }
}

type CalendarScreenProps = {
  onBack: () => void
}

// A structural placeholder: real events, terms and deadlines are Tier 2 content that
// does not exist yet (ARCHITECTURE §11, milestone 2).
export function CalendarScreen({ onBack }: CalendarScreenProps) {
  const today = new Date()
  const { title, weeks } = monthCells(today)
  const dateLong = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <main className="calendar-shell">
      <section className="calendar-page" aria-labelledby="calendar-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="calendar-heading">
          <p className="kicker">Calendar</p>
          <h1 id="calendar-title">{title}</h1>
        </div>

        <div className="calendar-layout">
          <table className="month-grid">
            <thead>
              <tr>
                {WEEKDAYS.map((d) => <th key={d} scope="col">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, i) => (
                <tr key={i}>
                  {week.map((cell, j) => (
                    <td key={j} className={cell.current ? 'today' : ''}>
                      {cell.day ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <aside className="calendar-notes">
            <p className="kicker">Today</p>
            <p>{dateLong}</p>

            <p className="kicker">What this is</p>
            <p>First pass at the calendar picture. Real events arrive with Tier 2.</p>

            <p className="kicker">Reading room</p>
            <p>Empty grid, waiting for the term.</p>
          </aside>
        </div>
      </section>
    </main>
  )
}
