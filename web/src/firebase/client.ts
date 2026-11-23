import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'
import {
  initializeIfConfigured,
  requireFirebaseConfiguration,
  resolveFirebaseConfiguration,
  type FirebaseClientConfiguration,
} from './config.mjs'

const configurationResult = resolveFirebaseConfiguration(import.meta.env, import.meta.env.PROD)

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let firestore: Firestore | null = null
let functions: Functions | null = null

function initializeFirebase(configuration: FirebaseClientConfiguration): void {
  const existingApps = getApps()
  const app = existingApps.length === 0 ? initializeApp({
    apiKey: configuration.apiKey,
    authDomain: configuration.authDomain,
    projectId: configuration.projectId,
    appId: configuration.appId,
  }) : getApp()

  if (app.options.projectId !== configuration.projectId) {
    throw new Error('The existing Firebase app has a different project ID than the selected environment. Restart the Web app with the correct configuration.')
  }

  firebaseApp = app
  firebaseAuth = getAuth(app)
  firestore = getFirestore(app)
  functions = getFunctions(app)

  if (configuration.useEmulators) {
    // Vite can reevaluate this module during HMR while Firebase retains its app singleton.
    const globalState = globalThis as typeof globalThis & { __overseerFirebaseEmulatorsConnected?: boolean }
    if (!globalState.__overseerFirebaseEmulatorsConnected) {
      connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
      connectFunctionsEmulator(functions, '127.0.0.1', 5001)
      globalState.__overseerFirebaseEmulatorsConnected = true
    }
    console.info('Firebase Emulator Suite selected: project demo-overseer-web; Auth 127.0.0.1:9099; Firestore 127.0.0.1:8080.')
  } else {
    console.info('Firebase emulator mode is disabled; the explicitly configured Firebase project is selected.')
  }
}

const firebaseConfigured = initializeIfConfigured(
  configurationResult,
  initializeFirebase,
  (message) => console.error(`[Overseer Firebase configuration] ${message}`),
)

if (!configurationResult.error && !configurationResult.config) {
  console.info('Firebase is not configured. Overseer will start with its existing localStorage data only.')
}

export function getFirebaseServices(): { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions } {
  requireFirebaseConfiguration(configurationResult)
  if (!firebaseConfigured || !firebaseApp || !firebaseAuth || !firestore) {
    throw new Error('Firebase is unavailable because its initialization did not complete.')
  }
  if (!functions) throw new Error('Firebase Functions are unavailable.')
  return { app: firebaseApp, auth: firebaseAuth, firestore, functions }
}
