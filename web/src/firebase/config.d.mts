export interface FirebaseEnvironment {
  VITE_FIREBASE_API_KEY?: string
  VITE_FIREBASE_AUTH_DOMAIN?: string
  VITE_FIREBASE_PROJECT_ID?: string
  VITE_FIREBASE_APP_ID?: string
  VITE_USE_FIREBASE_EMULATORS?: string
}

export interface FirebaseClientConfiguration {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  useEmulators: boolean
}

export interface FirebaseConfigurationResult {
  config: FirebaseClientConfiguration | null
  error: string | null
}

export const EMULATOR_PROJECT_ID: 'demo-overseer-web'

export function resolveFirebaseConfiguration(
  environment: FirebaseEnvironment,
  isProduction: boolean,
): FirebaseConfigurationResult

export function initializeIfConfigured(
  result: FirebaseConfigurationResult,
  initialize: (configuration: FirebaseClientConfiguration) => void,
  reportError: (message: string) => void,
): boolean

export function requireFirebaseConfiguration(
  result: FirebaseConfigurationResult,
): FirebaseClientConfiguration
