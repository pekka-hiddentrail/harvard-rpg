type MenuItem = {
  eyebrow: string
  title: string
  detail: string
  action: string
  primary?: boolean
}

const menu: MenuItem[] = [
  {
    eyebrow: 'A fresh arrival',
    title: 'Start new game',
    detail: 'Build a student and begin the first semester.',
    action: 'Begin',
    primary: true,
  },
  {
    eyebrow: 'Continue your story',
    title: 'Load a game',
    detail: 'Return to a saved term, day, and set of consequences.',
    action: 'Open saves',
  },
]

export function WelcomeScreen() {
  return (
    <main className="welcome-shell">
      <section className="welcome" aria-labelledby="game-title">
        <header className="masthead">
          <span className="brand-name">HARVARD</span>
          <div className="masthead-right">
            <p className="edition">A university life simulator</p>
            <img className="harvard-logo" src="/harvard-logo.png" alt="Harvard University crest" />
          </div>
        </header>

        <div className="intro">
          <p className="kicker">Cambridge, Massachusetts</p>
          <h1 id="game-title">Four years.<br />Every choice.</h1>
          <p className="lead">
            Build a life between lecture halls, late dinners, friendships, and the work that
            follows you home.
          </p>
        </div>

        <nav className="menu" aria-label="Game menu">
          {menu.map((item) => (
            <article className={`menu-item${item.primary ? ' primary' : ''}`} key={item.title}>
              <p className="menu-eyebrow">{item.eyebrow}</p>
              <div className="menu-copy">
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
              </div>
              <button type="button" className="menu-action">
                {item.action}<span aria-hidden="true"> →</span>
              </button>
            </article>
          ))}
        </nav>

        <nav className="secondary-menu" aria-label="Additional options">
          <button type="button">Credits <span aria-hidden="true">→</span></button>
          <button type="button">Settings <span aria-hidden="true">→</span></button>
        </nav>

        <footer className="footer">
          <span>Est. 1636</span>
          <span>Harvard RPG</span>
        </footer>
      </section>
    </main>
  )
}