import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { AppData, FocusSession, FocusTimer } from '../types/app'
import { createEmptyData, createId, loadAppData, saveAppData } from '../data/storage'

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
  const [data, dispatch] = useReducer(reducer, undefined, loadAppData)
  const [storageError, setStorageError] = useState<string | null>(null)
  const update = useCallback((patch: Partial<AppData>) => dispatch({ type: 'patch', patch }), [])
  const importData = useCallback((imported: AppData) => dispatch({ type: 'import', data: imported }), [])
  const resetData = useCallback(() => dispatch({ type: 'reset' }), [])

  useEffect(() => {
    try { saveAppData(data); setStorageError(null) } catch (error) { console.error('Unable to save local Overseer data', error); setStorageError('Overseer could not save changes in this browser. Export a backup and free local storage space, then try again.') }
  }, [data])

  useLayoutEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
    const applyAppearance = () => {
      const dark = data.preferences.appearanceMode === 'dark'
        || (data.preferences.appearanceMode === 'system' && (systemDark.matches || data.preferences.appearancePreset === 'midnight'))
      root.dataset.theme = dark ? 'dark' : 'light'
      root.dataset.preset = data.preferences.appearancePreset
      root.dataset.accent = data.preferences.accentColor
      root.dataset.density = data.preferences.density
      root.dataset.reducedMotion = String(data.preferences.reducedMotion)
      root.style.colorScheme = dark ? 'dark' : 'light'
      const background = getComputedStyle(root).getPropertyValue('--background').trim()
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background || (dark ? '#101921' : '#f5f4ed'))
    }
    applyAppearance()
    systemDark.addEventListener('change', applyAppearance)
    return () => systemDark.removeEventListener('change', applyAppearance)
  }, [
    data.preferences.appearanceMode,
    data.preferences.appearancePreset,
    data.preferences.accentColor,
    data.preferences.density,
    data.preferences.reducedMotion,
  ])

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
