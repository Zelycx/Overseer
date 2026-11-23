import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { AppData, FocusSession, FocusTimer } from '../types/app'
import { createEmptyData, createId, loadAppData, saveAppData } from '../data/storage'
import { useAuth } from './AuthContext'

type Action =
  | { type: 'patch'; patch: Partial<AppData> }
  | { type: 'import'; data: AppData }
  | { type: 'reset' }
  | { type: 'completeTimer'; at: number }

function reducer(state: AppData, action: Action): AppData {
  if (action.type === 'patch') return { ...state, ...action.patch }
  if (action.type === 'import') return action.data
  if (action.type === 'reset') return createEmptyData()
  if (action.type === 'completeTimer') {
    const timer = state.focusTimer
    if (timer.status !== 'running' || !timer.startedAt) return state
    const endedAt = new Date(action.at).toISOString()
    const session: FocusSession = {
      id: createId('session'), mode: timer.mode, startedAt: timer.startedAt, endedAt,
      durationSeconds: Math.max(1, Math.round(timer.elapsedSeconds + Math.max(0, (action.at - new Date(timer.segmentStartedAt ?? endedAt).getTime()) / 1000))), courseId: timer.courseId, taskId: timer.taskId, completed: true,
    }
    const completedTimer: FocusTimer = { ...timer, status: 'idle', remainingSeconds: 0, endsAt: null, startedAt: null, segmentStartedAt: null, elapsedSeconds: 0 }
    return { ...state, focusTimer: completedTimer, focusSessions: [session, ...state.focusSessions] }
  }
  return state
}

interface AppDataContextValue {
  data: AppData
  update: (patch: Partial<AppData>) => void
  importData: (data: AppData) => void
  resetData: () => void
  storageError: string | null
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.uid ?? null

  return <UserAppDataProvider key={userId ?? 'anonymous'} userId={userId}>{children}</UserAppDataProvider>
}

function UserAppDataProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  const [data, dispatch] = useReducer(reducer, userId, loadAppData)
  const [storageError, setStorageError] = useState<string | null>(null)
  const update = useCallback((patch: Partial<AppData>) => dispatch({ type: 'patch', patch }), [])
  const importData = useCallback((imported: AppData) => dispatch({ type: 'import', data: imported }), [])
  const resetData = useCallback(() => dispatch({ type: 'reset' }), [])

  useEffect(() => {
    try { saveAppData(data, userId); setStorageError(null) } catch (error) { console.error('Unable to save local Overseer data', error); setStorageError('Overseer could not save changes in this browser. Export a backup and free local storage space, then try again.') }
  }, [data, userId])

  useEffect(() => {
    if (data.focusTimer.status === 'running' && data.focusTimer.endsAt !== null && data.focusTimer.endsAt <= Date.now()) {
      dispatch({ type: 'completeTimer', at: data.focusTimer.endsAt })
    }
    const interval = window.setInterval(() => {
      if (data.focusTimer.status === 'running' && data.focusTimer.endsAt !== null && data.focusTimer.endsAt <= Date.now()) {
        dispatch({ type: 'completeTimer', at: data.focusTimer.endsAt })
      }
    }, 500)
    return () => window.clearInterval(interval)
  }, [data.focusTimer])

  const value = useMemo(() => ({ data, update, importData, resetData, storageError }), [data, update, importData, resetData, storageError])
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppDataContextValue {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData must be used inside AppDataProvider')
  return value
}
