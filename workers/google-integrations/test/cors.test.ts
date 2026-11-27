import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'
import type { Env } from '../src/types.js'

const env = { ALLOWED_ORIGINS: 'https://overseer.example' } as Env
describe('CORS allowlist', () => {
  it('rejects unconfigured Web origins', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/google/calendar/status', { headers: { origin: 'https://attacker.example' } }), env)
    expect(response.status).toBe(403)
  })
  it('never emits wildcard origins and handles allowed preflight', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/google/calendar/status', { method: 'OPTIONS', headers: { origin: 'https://overseer.example' } }), env)
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://overseer.example')
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*')
  })
})
