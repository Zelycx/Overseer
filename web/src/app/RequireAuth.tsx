import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getProtectedRouteDecision } from '../auth/authRouting'
import { useAuth } from './AuthContext'

export default function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const decision = getProtectedRouteDecision(loading, user !== null)

  if (decision === 'loading') {
    return <main className="auth-page" role="status" aria-live="polite">Checking your account…</main>
  }
  if (decision === 'redirect') {
    return <Navigate to="/auth" replace state={{ from: location }} />
  }
  return <Outlet />
}
