type CourseRegistrationScreenProps = {
  onBack: () => void
}

// A structural placeholder, same idea as CalendarScreen: real course data, demand gaps and
// registration logic are Tier 2 content that does not exist yet.
export function CourseRegistrationScreen({ onBack }: CourseRegistrationScreenProps) {
  return (
    <main className="course-registration-shell">
      <section className="course-registration-page" aria-labelledby="course-registration-title">
        <header className="character-header">
          <button className="back-button" type="button" onClick={onBack}>← Back</button>
          <span className="brand-name">HARVARD</span>
          <img className="character-crest" src="/harvard-logo.png" alt="Harvard University crest" />
        </header>

        <div className="course-registration-body">
          <p className="kicker">Course registration</p>
          <h1 id="course-registration-title">Coming soon.</h1>
          <p>
            Course lists, demand gaps and the requirement solver arrive with Tier 2. For now,
            your dorm and roommate are set — the rest of the term is still being written.
          </p>
        </div>
      </section>
    </main>
  )
}
