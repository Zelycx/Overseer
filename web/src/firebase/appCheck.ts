import { initializeAppCheck, type AppCheck, type AppCheckOptions } from 'firebase/app-check'
import type { FirebaseApp } from 'firebase/app'

/**
 * App Check activation boundary. Call only after the provider and environment
 * setup have been approved and configured. This module intentionally does not
 * activate App Check during Phase 1A.
 */
export function initializeAppCheckBoundary(app: FirebaseApp, provider: AppCheckOptions['provider']): AppCheck {
  return initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true })
}
