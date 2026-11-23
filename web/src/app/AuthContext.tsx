import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Auth, User } from 'firebase/auth'
import {
  createEmailAccount,
  observeAuthState,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
} from '../auth/authClient'
import { AUTH_ACTION_IN_PROGRESS_MESSAGE, AuthActionGuard } from '../auth/authActionGuard'
import { getAuthErrorMessage } from '../auth/authErrors'

interface AuthContextValue {
  user: User | null
  loading: boolean
  authAvailable: boolean
  actionInProgress: boolean
  error: string | null
  clearError: () => void
  createAccount: (email: string, password: string) => Promise<boolean>
  signIn: (email: string, password: string) => Promise<boolean>
  signInWithGoogle: () => Promise<boolean>
  signOut: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authAvailable, setAuthAvailable] = useState(false)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const authRef = useRef<Auth | null>(null)
  const mountedRef = useRef(false)
  const [actionGuard] = useState(() => new AuthActionGuard())
  const actionGenerationRef = useRef(0)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    mountedRef.current = true

    void import('../firebase/client').then(({ getFirebaseServices }) => {
      if (!active) return
      const { auth } = getFirebaseServices()
      authRef.current = auth
      setAuthAvailable(true)
      unsubscribe = observeAuthState(auth, (nextUser) => {
        if (!active) return
        setUser(nextUser)
        setLoading(false)
        if (!actionGuard.isRunning) setError(null)
      }, (cause) => {
        if (!active) return
        authRef.current = null
        setUser(null)
        setAuthAvailable(false)
        setLoading(false)
        setError(getAuthErrorMessage(cause))
      })
    }).catch((cause: unknown) => {
      if (!active) return
      authRef.current = null
      setUser(null)
      setAuthAvailable(false)
      setLoading(false)
      setError(getAuthErrorMessage(cause))
    })

    return () => {
      active = false
      mountedRef.current = false
      authRef.current = null
      unsubscribe?.()
    }
  }, [])

  const runAuthAction = useCallback(async (action: (auth: Auth) => Promise<unknown>): Promise<boolean> => {
    const auth = authRef.current
    if (!auth || !authAvailable) {
      if (mountedRef.current) {
        setError('Firebase Authentication is unavailable. Check the Firebase configuration and try again.')
      }
      return false
    }

    if (actionGuard.isRunning) {
      if (mountedRef.current) setError(AUTH_ACTION_IN_PROGRESS_MESSAGE)
      return false
    }

    const actionGeneration = ++actionGenerationRef.current
    const outcomePromise = actionGuard.run(() => action(auth))
    if (mountedRef.current) {
      setActionInProgress(true)
      setError(null)
    }

    const outcome = await outcomePromise
    if (outcome.status === 'busy') {
      if (mountedRef.current) setError(AUTH_ACTION_IN_PROGRESS_MESSAGE)
      return false
    }

    if (mountedRef.current && actionGeneration === actionGenerationRef.current) {
      setActionInProgress(false)
      setError(outcome.status === 'success' ? null : getAuthErrorMessage(outcome.error))
    }
    return outcome.status === 'success'
  }, [actionGuard, authAvailable])

  const createAccount = useCallback(
    (email: string, password: string) => runAuthAction((auth) => createEmailAccount(auth, email, password)),
    [runAuthAction],
  )
  const signIn = useCallback(
    (email: string, password: string) => runAuthAction((auth) => signInWithEmail(auth, email, password)),
    [runAuthAction],
  )
  const signInWithGoogleAction = useCallback(
    () => runAuthAction((auth) => signInWithGoogle(auth)),
    [runAuthAction],
  )
  const signOut = useCallback(
    () => runAuthAction((auth) => signOutUser(auth)),
    [runAuthAction],
  )
  const clearError = useCallback(() => {
    if (mountedRef.current) setError(null)
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    authAvailable,
    actionInProgress,
    error,
    clearError,
    createAccount,
    signIn,
    signInWithGoogle: signInWithGoogleAction,
    signOut,
  }), [user, loading, authAvailable, actionInProgress, error, clearError, createAccount, signIn, signInWithGoogleAction, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
