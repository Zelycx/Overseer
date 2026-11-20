import { ArrowRight, BookOpenCheck, CalendarDays, Check, CirclePlay, Sparkles, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'

const features = [
  { icon: CalendarDays, title: 'Plan around real life', text: 'Build a day that leaves room for classes, breaks, and the work that matters.' },
  { icon: BookOpenCheck, title: 'Learn with your materials', text: 'Keep courses, notes, and lessons together in one calm study space.' },
  { icon: Timer, title: 'Make focus feel doable', text: 'Start with one session, then let steady progress build over time.' },
]

export default function LandingPage() {
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()
  const currentYear = new Date().getFullYear()

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="brand" aria-label="Overseer home">
          <span className="brand__mark"><span /></span><span className="brand__word">overseer</span>
        </Link>
        <nav aria-label="Main menu">
          <a href="#features">Features</a>
          <Link to="/auth">Sign in</Link>
          <Link className="button button--primary button--small" to="/auth">Get started <ArrowRight size={15} /></Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="eyebrow-pill"><span /> STUDY WITH A LITTLE MORE CLARITY</span>
            <h1>Your time.<br /><span>Your lessons.</span><br />Under control.</h1>
            <p>Overseer brings your schedule, study materials, and next steps into one thoughtful space—so you can focus on learning, not keeping track of everything.</p>
            <div className="landing-hero__actions">
              <Link className="button button--primary button--large" to="/auth">Get started <ArrowRight size={17} /></Link>
              <Link className="landing-preview-link" to="/dashboard"><CirclePlay size={18} /> Explore the preview</Link>
            </div>
            <div className="landing-proof"><span className="landing-proof__avatars"><i>J</i><i>A</i><i>M</i></span><span>Made for the way students really study</span></div>
          </div>

          <div className="landing-visual" aria-label="Preview of a student dashboard">
            <div className="landing-orbit landing-orbit--one" /><div className="landing-orbit landing-orbit--two" />
            <div className="landing-note landing-note--top"><span className="landing-note__dot" /><span>One thing at a time</span></div>
            <div className="preview-window">
              <div className="preview-window__top"><span /><span /><span /><small>MY DAY</small><b>···</b></div>
              <div className="preview-window__content">
                <div className="preview-welcome"><div><small>{todayLabel}</small><h3>Looking good, Maya.</h3><p>Here’s a little space to make progress.</p></div><div className="preview-sun">✳</div></div>
                <div className="preview-stats">
                  <div><small>FOCUS THIS WEEK</small><strong>4.5 <em>hrs</em></strong><span className="preview-up">↗ 12% this week</span></div>
                  <div><small>TASKS DONE</small><strong>08 <em>/ 12</em></strong><div className="preview-mini-progress"><span /></div></div>
                </div>
                <div className="preview-agenda"><div className="preview-agenda__heading"><b>Up next</b><span>View day <ArrowRight size={12} /></span></div>
                  <div className="preview-event"><span className="preview-event__line" /><div><small>09:00 — 10:30</small><b>Discrete Mathematics</b><span>Lecture · Room 204</span></div><span className="preview-event__icon"><CalendarDays size={15} /></span></div>
                  <div className="preview-event preview-event--lime"><span className="preview-event__line" /><div><small>11:00 — 12:00</small><b>Study block</b><span>Data Structures</span></div><span className="preview-event__icon"><Timer size={15} /></span></div>
                </div>
                <div className="preview-task"><span className="preview-task__check"><Check size={12} /></span><span><b>Graph theory problem set</b><small>Due today · Discrete Mathematics</small></span><span className="preview-task__priority">HIGH</span></div>
              </div>
            </div>
            <div className="landing-note landing-note--bottom"><span><Sparkles size={15} /></span><span>Progress, at your pace</span></div>
          </div>
          <div className="landing-hero__wash" />
        </section>

        <section className="landing-features" id="features">
          <div className="landing-section-intro"><span className="eyebrow">A calmer way to keep up</span><h2>Everything you need<br />to move forward.</h2><p>Less juggling tabs. More time for the work you came here to do.</p></div>
          <div className="feature-grid">{features.map(({ icon: Icon, title, text }, index) => <article className="feature-card" key={title}><span className={`feature-icon feature-icon--${index}`}><Icon size={21} /></span><h3>{title}</h3><p>{text}</p><Link to="/auth" aria-label={`Get started: ${title}`}><ArrowRight size={17} /></Link></article>)}</div>
        </section>

        <section className="landing-bottom-cta"><div><span className="eyebrow">YOUR NEXT STEP STARTS HERE</span><h2>Make a little room<br />for what matters.</h2></div><Link className="button button--lime button--large" to="/auth">Get started <ArrowRight size={17} /></Link></section>
      </main>

      <footer className="landing-footer"><Link to="/" className="brand"><span className="brand__mark"><span /></span><span className="brand__word">overseer</span></Link><span>Your time. Your lessons. Under control.</span><small>© {currentYear} Overseer · Preview</small></footer>
    </div>
  )
}
