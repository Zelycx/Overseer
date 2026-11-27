import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { readD1Migrations } from '@cloudflare/vitest-plugin'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: resolve(root, 'wrangler.toml') },
    miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations(resolve(root, 'migrations')) } },
  }))],
  test: { setupFiles: ['./test/apply-migrations.ts'] },
})
