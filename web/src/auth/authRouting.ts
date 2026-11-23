export type ProtectedRouteDecision = 'loading' | 'allow' | 'redirect'

export function getProtectedRouteDecision(loading: boolean, authenticated: boolean): ProtectedRouteDecision {
  if (loading) return 'loading'
  return authenticated ? 'allow' : 'redirect'
}

function getDefaultTrustedOrigin(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.origin
}

export function getPostAuthDestination(state: unknown, trustedOrigin = getDefaultTrustedOrigin()): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return '/dashboard'
  const from = state.from
  if (!from || typeof from !== 'object' || !('pathname' in from) || typeof from.pathname !== 'string') {
    return '/dashboard'
  }

  const pathname = from.pathname
  if (!trustedOrigin || !pathname.startsWith('/') || pathname.startsWith('//')
    || pathname === '/auth' || pathname === '/welcome') {
    return '/dashboard'
  }

  const search = 'search' in from && typeof from.search === 'string' && from.search.startsWith('?')
    ? from.search
    : ''
  const hash = 'hash' in from && typeof from.hash === 'string' && from.hash.startsWith('#')
    ? from.hash
    : ''
  const candidate = `${pathname}${search}${hash}`
  if (candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate) || /%(?![0-9a-f]{2})/i.test(candidate)) {
    return '/dashboard'
  }

  try {
    const base = new URL(trustedOrigin)
    if (!['http:', 'https:'].includes(base.protocol) || base.origin === 'null') return '/dashboard'
    const destination = new URL(candidate, base.origin)
    if (destination.origin !== base.origin) return '/dashboard'
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return '/dashboard'
  }
}
