import { getApps, initializeApp, type App } from 'firebase-admin/app'

export function getAdminApp(): App {
  return getApps().find((app) => app.name === '[DEFAULT]') ?? initializeApp()
}
