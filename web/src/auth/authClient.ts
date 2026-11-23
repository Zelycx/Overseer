import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type Unsubscribe,
  type User,
} from 'firebase/auth'

export function observeAuthState(
  auth: Auth,
  onUser: (user: User | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onAuthStateChanged(auth, onUser, onError)
}

export function createEmailAccount(auth: Auth, email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export function signInWithEmail(auth: Auth, email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function signInWithGoogle(auth: Auth) {
  return signInWithPopup(auth, new GoogleAuthProvider())
}

export function signOutUser(auth: Auth) {
  return signOut(auth)
}
