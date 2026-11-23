import type { Auth } from 'firebase/auth'
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore'
import { decodeUserPreferences, encodeUserPreferences } from '../codecs'
import type { UserPreferences } from '../models'

export interface EditableUserPreferences {
  displayName: string
  timeFormat: '12h' | '24h'
  firstDayOfWeek: 0 | 1
  timeZoneId: string
}

function requireCurrentUid(auth: Auth): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Sign in before accessing cloud preferences.')
  return uid
}

function preferencesReference(firestore: Firestore, uid: string) {
  return doc(firestore, 'users', uid, 'settings', 'preferences')
}

/**
 * The repository derives the owner from Firebase Auth. Callers cannot select a
 * UID, and stale subscriptions stop forwarding data after an identity change.
 */
export function subscribeUserPreferences(
  auth: Auth,
  firestore: Firestore,
  onValue: (value: UserPreferences | null, fromCache: boolean) => void,
  onError: (error: Error) => void,
): () => void {
  const uid = requireCurrentUid(auth)
  return onSnapshot(
    preferencesReference(firestore, uid),
    (snapshot) => {
      if (auth.currentUser?.uid !== uid) return
      if (!snapshot.exists()) {
        onValue(null, snapshot.metadata.fromCache)
        return
      }
      try {
        onValue(decodeUserPreferences(snapshot.id, snapshot.data()), snapshot.metadata.fromCache)
      } catch (cause) {
        onError(cause instanceof Error ? cause : new Error('Cloud preferences have an invalid schema.'))
      }
    },
    (cause) => onError(cause instanceof Error ? cause : new Error('Unable to read cloud preferences.')),
  )
}

export async function saveUserPreferences(
  auth: Auth,
  firestore: Firestore,
  value: EditableUserPreferences,
): Promise<void> {
  const uid = requireCurrentUid(auth)
  const reference = preferencesReference(firestore, uid)
  await runTransaction(firestore, async (transaction) => {
    if (auth.currentUser?.uid !== uid) throw new Error('The signed-in account changed before preferences could be saved.')
    const snapshot = await transaction.get(reference)
    const now = serverTimestamp()

    if (snapshot.exists()) {
      // Decode first so malformed or unsupported records are never overwritten.
      decodeUserPreferences(snapshot.id, snapshot.data())
      transaction.update(reference, {
        ...value,
        updatedAt: now,
      })
      return
    }

    const createdAt = serverTimestamp()
    const candidate: UserPreferences = {
      id: reference.id,
      schemaVersion: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      ...value,
      aiWorkspaceContextConsent: false,
      consentedAt: null,
      revokedAt: null,
      consentVersion: null,
    }
    const encoded = encodeUserPreferences(candidate)
    transaction.set(reference, {
      ...encoded,
      createdAt,
      updatedAt: now,
    })
  })
}
