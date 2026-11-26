export type Provider = 'calendar' | 'classroom'
export type Platform = 'web' | 'android'
export interface Env {
  DB: D1Database
  FIREBASE_PROJECT_ID: string
  GOOGLE_WEB_CLIENT_ID: string
  GOOGLE_ANDROID_CLIENT_ID: string
  GOOGLE_ANDROID_REDIRECT_URI: string
  GOOGLE_WEB_CALLBACK_URL: string
  GOOGLE_WEB_RETURN_ORIGINS: string
  ALLOWED_ORIGINS: string
  TOKEN_ENCRYPTION_CURRENT_VERSION: string
  GOOGLE_WEB_CLIENT_SECRET: string
  TOKEN_ENCRYPTION_KEYS: string
}
export interface Attempt {
  state_hash: string; firebase_uid: string; provider: Provider; platform: Platform;
  redirect_uri: string; return_url: string | null; code_verifier: string | null;
  code_challenge: string | null; expires_at: number; consumed_at: number | null;
}
export const SCOPES: Record<Provider, string[]> = {
  calendar: ['https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'],
  classroom: [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
],
}
