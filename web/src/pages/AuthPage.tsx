import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { getPostAuthDestination } from '../auth/authRouting'
import { useAuth } from '../app/AuthContext'

export default function AuthPage() {
  const {
    user,
    loading,
    authAvailable,
    actionInProgress,
    error,
    clearError,
    createAccount,
    signIn,
    signInWithGoogle,
  } = useAuth()
  const location = useLocation()
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (loading) {
    return <main className="auth-page" role="status" aria-live="polite">Checking your account…</main>
  }
  if (user) return <Navigate to={getPostAuthDestination(location.state)} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (creatingAccount) await createAccount(email.trim(), password)
    else await signIn(email.trim(), password)
  }

  const submitGoogle = async () => {
    await signInWithGoogle()
  }

  const toggleMode = () => {
    clearError()
    setCreatingAccount((current) => !current)
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-row">
        <Link to="/" className="brand" aria-label="Overseer home">
          <span className="brand__mark"><span /></span>
          <span className="brand__word">overseer</span>
        </Link>
        <Link className="back-link" to="/"><ArrowLeft size={14} /> Back to home</Link>
      </div>

      <main className="auth-card">
        <div className="auth-icon">{creatingAccount ? <UserPlus size={21} /> : <LogIn size={21} />}</div>
        <p className="eyebrow">YOUR OVERSEER ACCOUNT</p>
        <h1>{creatingAccount ? 'Create your account.' : 'Welcome back.'}</h1>
        <p>{creatingAccount ? 'Use email and password or continue with Google.' : 'Sign in to continue to your workspace.'}</p>

        {!authAvailable && error && <div className="auth-config-note" role="alert"><span className="status-dot" />{error}</div>}
        {authAvailable && error && <p className="inline-notice inline-notice--error" role="alert">{error}</p>}

        <form className="editor-form" onSubmit={(event) => void submit(event)}>
          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={!authAvailable || actionInProgress}
            />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={creatingAccount ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={!authAvailable || actionInProgress}
            />
          </label>
          <button className="button button--primary button--medium button--full" type="submit" disabled={!authAvailable || actionInProgress}>
            {creatingAccount ? 'Create account' : 'Sign in'} <ArrowRight size={15} />
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button
          className="button button--secondary button--medium button--full"
          type="button"
          onClick={() => void submitGoogle()}
          disabled={!authAvailable || actionInProgress}
        >
          <KeyRound size={15} /> Continue with Google
        </button>
        <button className="button button--quiet button--medium button--full" type="button" onClick={toggleMode} disabled={actionInProgress}>
          {creatingAccount ? 'Already have an account? Sign in' : 'New to Overseer? Create an account'}
        </button>

        <p className="auth-footnote">
          Authentication does not upload, migrate, or associate your existing local workspace data. Local data remains on this device.
        </p>
      </main>
      <footer className="auth-footer">Your account session and device-local workspace are separate.</footer>
    </div>
  )
}
