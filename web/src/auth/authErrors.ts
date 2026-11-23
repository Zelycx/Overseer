export function getAuthErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''

  if ([
    'auth/account-exists-with-different-credential',
    'auth/credential-already-in-use',
    'auth/email-already-in-use',
  ].includes(code)) {
    return 'This email already has an account using another sign-in method. Sign in with the provider you originally used. Accounts are not automatically linked.'
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'The email or password is incorrect. Check your details and try again.'
  }
  if (code === 'auth/invalid-email') return 'Enter a valid email address.'
  if (code === 'auth/weak-password') return 'Choose a stronger password and try again.'
  if (code === 'auth/too-many-requests') return 'Too many attempts were made. Wait a little and try again.'
  if (code === 'auth/network-request-failed') return 'Authentication could not reach Firebase. Check your connection and try again.'
  if (code === 'auth/operation-not-allowed') return 'This sign-in method is not enabled for this Firebase project.'
  if (code === 'auth/popup-closed-by-user') return 'Google sign-in was closed before it finished. Try again.'
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow popups and try again.'
  if (error instanceof Error && error.message.startsWith('Firebase is unavailable')) return error.message
  return 'Authentication could not be completed. Check the Firebase setup and try again.'
}
