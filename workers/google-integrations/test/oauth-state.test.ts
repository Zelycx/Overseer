import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { consume } from '../src/index.js'
import { pkceChallenge, randomUrlSafe, sha256Base64Url } from '../src/crypto.js'
import type { Attempt, Env } from '../src/types.js'

const bindings = env as unknown as Env
async function seed(input: Partial<Attempt> = {}) {
  const state = randomUrlSafe(), verifier = randomUrlSafe()
  const row: Attempt = {
    state_hash: await sha256Base64Url(state), firebase_uid: 'uid-a', provider: 'calendar', platform: 'android',
    redirect_uri: 'https://app.example.invalid/oauth/android', return_url: null, code_verifier: null,
    code_challenge: await pkceChallenge(verifier), expires_at: Math.floor(Date.now() / 1000) + 60,
    consumed_at: null, ...input,
  }
  await bindings.DB.prepare(`INSERT INTO oauth_attempts(state_hash,firebase_uid,provider,platform,redirect_uri,return_url,code_verifier,code_challenge,expires_at,consumed_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(row.state_hash,row.firebase_uid,row.provider,row.platform,row.redirect_uri,row.return_url,row.code_verifier,row.code_challenge,row.expires_at,row.consumed_at,Math.floor(Date.now()/1000)).run()
  return { state, verifier, row }
}
beforeEach(async () => { await bindings.DB.prepare('DELETE FROM oauth_attempts').run() })

describe('D1 authorization state', () => {
  it('consumes valid UID/provider/platform-bound PKCE state only once', async () => {
    const { state, verifier } = await seed()
    await expect(consume(bindings,state,'uid-a','calendar','android',verifier)).resolves.toMatchObject({ firebase_uid: 'uid-a' })
    await expect(consume(bindings,state,'uid-a','calendar','android',verifier)).rejects.toBeInstanceOf(Response)
  })
  it('allows only one concurrent callback to consume a state record', async () => {
    const { state, verifier } = await seed()
    const results = await Promise.allSettled([
      consume(bindings,state,'uid-a','calendar','android',verifier),
      consume(bindings,state,'uid-a','calendar','android',verifier),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
  })
  it('rejects cross-user, wrong-provider, wrong-platform, expired and incorrect verifier attempts', async () => {
    const crossUser = await seed()
    await expect(consume(bindings,crossUser.state,'uid-b','calendar','android',crossUser.verifier)).rejects.toBeInstanceOf(Response)
    const provider = await seed()
    await expect(consume(bindings,provider.state,'uid-a','classroom','android',provider.verifier)).rejects.toBeInstanceOf(Response)
    const platform = await seed()
    await expect(consume(bindings,platform.state,'uid-a','calendar','web',platform.verifier)).rejects.toBeInstanceOf(Response)
    const expired = await seed({ expires_at: Math.floor(Date.now()/1000)-1 })
    await expect(consume(bindings,expired.state,'uid-a','calendar','android',expired.verifier)).rejects.toBeInstanceOf(Response)
    const pkce = await seed()
    await expect(consume(bindings,pkce.state,'uid-a','calendar','android',randomUrlSafe())).rejects.toBeInstanceOf(Response)
  })
})
