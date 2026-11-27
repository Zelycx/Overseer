import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Database } from '@cloudflare/workers-types'

type Migration = { name: string; queries: string[] }
const bindings = env as unknown as { DB: D1Database; TEST_MIGRATIONS: Migration[] }
await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS)
