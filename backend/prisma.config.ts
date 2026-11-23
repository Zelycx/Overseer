import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// A non-secret fallback allows `prisma generate` before a local database is configured.
// Database commands still require a valid DATABASE_URL in the environment.
const datasourceUrl =
  process.env.DATABASE_URL ??
  'postgresql://overseer:change_me@127.0.0.1:5432/overseer?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: datasourceUrl,
  },
});
