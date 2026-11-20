import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AuthPage() {
  return (
    <main className="auth-page">
      <div className="auth-brand-row">
        <Link to="/" className="brand"><span className="brand__mark"><span /></span><span className="brand__word">overseer</span></Link>
        <Link className="back-link" to="/"><ArrowLeft size={15} /> Back home</Link>
      </div>
      <section className="auth-card">
        <div className="auth-icon"><ShieldCheck size={23} /></div>
        <span className="eyebrow">ACCOUNT ACCESS</span>
        <h1>Sign in to your<br />study space.</h1>
        <p>Authentication is not connected yet. No account has been created or signed in.</p>
        <div className="auth-config-note"><span className="status-dot" /><span>Firebase Authentication setup is required to enable account access.</span></div>
        <Link className="button button--primary button--large button--full" to="/dashboard">Explore the dashboard preview <ArrowLeft className="auth-button-arrow" size={16} /></Link>
        <small className="auth-footnote">Preview data is sample content and is not associated with an account.</small>
      </section>
      <footer className="auth-footer">Your time. Your lessons. Under control.</footer>
    </main>
  )
}
