# Overseer Google Integrations Worker

This Worker is a Spark-compatible replacement path for Google Calendar/Classroom API operations. Firebase Functions sources remain in the repository and are not removed. Web and Android Google integration calls use this Worker when `VITE_GOOGLE_WORKER_URL` and the Android `googleWorkerUrl` Gradle property are configured.

## Local setup

1. Install Node.js 20.19+ or 22.12+ and create a free Cloudflare account. No billing activation is required for the documented Workers Free + D1 Free configuration.
2. From this directory run `npm install`.
3. Copy `wrangler.toml` to local planning; replace only the explicit non-secret placeholders in your working copy: Firebase project ID, OAuth client IDs, exact Android App Link redirect, Worker callback URL, allowed Web origin, and D1 database ID. Do not commit real secrets or local override files.
4. Create local-only `.dev.vars` in this directory (ignored by Git) with `GOOGLE_WEB_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEYS`. `TOKEN_ENCRYPTION_KEYS` is a JSON object mapping key versions to base64-encoded 32-byte keys; keep the current and any prior decryption key entries during rotation. Set `TOKEN_ENCRYPTION_CURRENT_VERSION` in `wrangler.toml` to the active version. Generate keys locally with a cryptographic random generator; never paste values into chat or source files.
5. Run `npx wrangler d1 migrations apply overseer-google-integrations --local`, then `npm run dev`. Local D1 is disposable test data.
6. Set Web `VITE_GOOGLE_WORKER_URL` to the local Worker URL. Set Android Gradle property `googleWorkerUrl` to a URL reachable from the device/emulator. A real device needs a trusted HTTPS tunnel for local testing; the app deliberately rejects arbitrary cleartext HTTP hosts.
7. Set Android Gradle property `googleOAuthHost` to the exact host used by `GOOGLE_ANDROID_REDIRECT_URI`. Publish the matching Android App Link Digital Asset Links file for the app package and signing certificate.
8. For a credential-free startup/authentication smoke check, run `curl -i http://127.0.0.1:8787/v1/google/calendar/status`; it should return `401 Authentication required.` without a Firebase bearer token. Google account testing additionally requires the local OAuth and encryption secrets described below.

## Cloudflare Free setup (no deploy performed)

1. In Cloudflare dashboard, create a D1 database named `overseer-google-integrations`. Copy its database ID into the ignored/local Wrangler config or a separately managed deployment config; keep the checked-in sample values as placeholders.
2. Create a Worker from this directory with the free Workers plan. Configure D1 binding `DB` and apply versioned migrations using `npx wrangler d1 migrations apply overseer-google-integrations --remote` only after manually creating the free database.
3. Configure non-secret vars: `FIREBASE_PROJECT_ID`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_ANDROID_REDIRECT_URI`, `GOOGLE_WEB_CALLBACK_URL`, `GOOGLE_WEB_RETURN_ORIGINS`, `ALLOWED_ORIGINS`, and `TOKEN_ENCRYPTION_CURRENT_VERSION`.
4. Add Worker secrets via Cloudflare dashboard: `GOOGLE_WEB_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEYS`. Do not use `wrangler secret put` for initial setup unless you intend its documented version deployment side effect.
5. Register exactly `GOOGLE_WEB_CALLBACK_URL` on the Web OAuth client. Register the exact Android redirect URI on the Android OAuth configuration and publish Digital Asset Links for that App Link host/package/signing certificate. Do not create an iOS OAuth client in this phase.
6. Set Web `VITE_GOOGLE_WORKER_URL` to the Worker origin and Android Gradle property `googleWorkerUrl` to the same origin. CORS accepts only exact `ALLOWED_ORIGINS`; native requests have no browser Origin header.
7. Set Android `googleOAuthHost` to the host in its redirect URI. The configured redirect must be accepted for the selected Android OAuth client and associated with the app through Digital Asset Links before Google authorization can be tested.

## Security model and limitations

- Firebase ID tokens are verified as RS256 against Google's published Secure Token X.509 certificates, including `iss`, `aud`, `exp`, `iat`, `auth_time`, and non-empty `sub`. The Worker derives the UID from `sub`; request UID values are ignored. This local verification does **not** check Firebase revocation; see [the revocation limitation](AUTHENTICATION.md).
- OAuth attempts are UID/provider/platform-bound, expire after ten minutes, and are consumed with a conditional D1 update that succeeds once. Web callbacks also atomically consume state before token exchange, including denied callbacks.
- Refresh tokens use AES-256-GCM with Web Crypto, random 96-bit IVs, and UID/provider/purpose AAD. `TOKEN_ENCRYPTION_KEYS` is a Worker secret keyring. D1 stores only ciphertext, IV, key version, scopes, identity metadata, and timestamps. This is application-managed symmetric encryption; Cloudflare Worker secrets are not a KMS, offer no envelope encryption or per-record key wrapping, and depend on operators retaining/rotating the keyring safely. Loss of a key version makes records using it unrecoverable.
- D1 state consumption is a single conditional `UPDATE ... WHERE consumed_at IS NULL AND expires_at > ?`; duplicate callbacks cannot both win. Credential changes use a single SQLite upsert; refresh tokens are preserved only for the same Google subject and OAuth client platform when a reauthorization omits one.
- `GET /v1/google/classroom/courses` reads courses for the signed-in user with Classroom's student scopes. Google documents student-specific coursework access via `classroom.coursework.me.readonly`; announcements return only items that the requesting account can view. No service-account or teacher permissions are assumed.
- Free quotas are finite: Workers Free is currently 100,000 requests/day, 10 ms CPU/invocation, 50 outgoing subrequests/invocation; D1 Free currently includes 5 million rows read/day, 100,000 rows written/day, 5 GB total storage, and 10 databases/account. A single data response fetches at most 42 Google API pages. If work remains, it returns the partial page plus `{ pagination: { hasMore: true, nextCursor } }`; the opaque cursor is authenticated-encrypted, bound to UID/provider/query, and expires after 15 minutes. Clients merge subsequent pages by provider IDs. A 401 can trigger at most one mid-request access-token refresh and retry; the failed page and retry use the 42-page allowance, while the token refresh request uses subrequest headroom. The remaining headroom covers the initial token refresh and Firebase signing-certificate retrieval. Google errors are sanitized; repeated page tokens fail instead of looping. Exceeding free quotas causes operations to fail until reset; it must not trigger an automatic upgrade.

## Routes

- `POST /v1/google/web/authorize` → `{ authorizationUrl }`
- `GET /oauth/callback` → safe redirect to an allowed Web return origin
- `POST /v1/google/native/android/authorize` → `{ authorizationUrl, state, redirectUri, expiresAt }`
- `POST /v1/google/native/android/complete` → `{ connected, provider, accountEmail, grantedScopes }`
- `GET /v1/google/{calendar|classroom}/status`
- `GET /v1/google/calendar/events?timeMin=...&timeMax=...`
- `GET /v1/google/classroom/courses`
- `DELETE /v1/google/{calendar|classroom}`

Every `/v1` request needs `Authorization: Bearer <Firebase ID token>`. OAuth secrets, access tokens, and refresh tokens are never returned to clients.

Calendar and Classroom data routes accept an optional `cursor` query parameter from the prior response's `pagination.nextCursor`. Preserve the Calendar date range while continuing. Refreshing without a cursor starts a new listing. Cursor payloads are opaque; clients must not inspect or construct them.

See [KEY_ROTATION.md](KEY_ROTATION.md) for the staged credential-encryption key rotation and recovery procedure.
