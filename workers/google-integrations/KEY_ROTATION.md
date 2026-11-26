# Google credential encryption key rotation

This guide covers the Worker `TOKEN_ENCRYPTION_KEYS` secret and D1 `google_credentials` records. No key material belongs in this document, Wrangler vars, source control, shell history, or logs.

## Current format

`TOKEN_ENCRYPTION_KEYS` is a JSON object mapping a key version name to a base64 encoded, 32-byte AES-256 key, for example the shape `{ "v1": "<base64-encoded-32-byte-key>" }`. `TOKEN_ENCRYPTION_CURRENT_VERSION` selects the key used for new encryption. The Worker uses AES-GCM with a fresh 96-bit IV and authenticated additional data bound to Firebase UID, provider, purpose, and format version.

Refresh token ciphertexts store their selector in `google_credentials.key_version`; the same row stores the IV and ciphertext. Pagination cursors are encrypted too; their small opaque envelope carries its key version. A key version must remain in the keyring while any credential or unexpired cursor encrypted under it may still be read. The current code does not silently re-encrypt old records during reads.

## Staged rotation

1. **Prepare and back up.** Record the deployed keyring version names and active version in the approved secret-management inventory. Make a protected backup of the key material and a protected D1 backup. Keep them outside the repository with access limited to operators who can perform recovery. A D1 backup without the matching encryption key is not a credential backup.
2. **Add the new key without activating it.** Generate a new independent random 32-byte key in the approved secret manager. Update `TOKEN_ENCRYPTION_KEYS` to contain both the old and new version entries, while leaving `TOKEN_ENCRYPTION_CURRENT_VERSION` on the old version. Deploy/configure this staged keyring and verify normal reads and writes using a canary account. Do not print the secret to verify it; verify only version names and application behavior.
3. **Switch new writes.** Set `TOKEN_ENCRYPTION_CURRENT_VERSION` to the new version. New refresh token ciphertexts and pagination cursors now use the new version. Old credentials continue to decrypt because the previous key remains available. Keep the old key in every active Worker environment.
4. **Re-encrypt existing credentials.** There is no automatic migration in this Worker today. Before retiring the old key, implement and review a restricted one-off maintenance job. It must read rows server-side, decrypt using each row's `key_version`, encrypt with the active version, and update ciphertext, IV, and version together. It must never return or log plaintext. Use compare-and-swap conditions on UID, provider, old key version, and old ciphertext so a concurrent reconnect cannot be overwritten. Make the job resumable and idempotent, record only row counts and opaque completion markers, and test it against a protected copy first.
5. **Verify completion.** Use an authorized read-only D1 query such as `SELECT key_version, COUNT(*) AS credential_count FROM google_credentials GROUP BY key_version;` and confirm the old version has no credential rows. The maintenance job should also perform a server-side decryptability check for each migrated row without emitting token material. Investigate every failed row; do not treat a count alone as proof that ciphertext decrypts.
6. **Retire only after the grace window.** Confirm all running Worker versions use a keyring containing the new version, migration checks pass, no rollback deployment needs old-only configuration, protected backups and recovery access are verified, and the maximum cursor lifetime (currently 15 minutes) plus deployment/cache grace has elapsed. Only then remove the old key from the live keyring. Retain or destroy the protected backup according to the approved retention policy; retiring the live key and destroying all recoverable copies are separate decisions.

## Rollback

Before the old key is retired, rollback is straightforward: retain both keys and set the active version back to the old version if necessary. Both versions remain readable, and any records already re-encrypted under the new version continue to work. Do not roll back to a Worker configuration that lacks either key while rows or live cursors still depend on it. If the migration partially completed, leave both keys configured, verify row versions, and resume or repair the migration; do not try to reverse by copying old ciphertext back over newer records.

## Lost or removed key

If a key is lost, every credential encrypted under that version becomes undecryptable. A D1 export alone cannot recover it. Restore the exact key from an approved protected backup and confirm the version name matches `key_version` before attempting reads. If no valid copy exists, the ciphertext is cryptographically unrecoverable. Reauthorization is **not** a guaranteed recovery method: Google may omit a refresh token on repeat consent, the user may no longer control the Google account, or the old grant may be revoked. The Worker deliberately preserves an existing refresh token when a same-account reconnect omits one; it cannot reconstruct a lost token. Treat key loss as an incident and assess affected accounts individually.

If a version was accidentally removed from the deployed keyring but its material still exists, restore it alongside the active key, verify decryption, then resume the staged procedure. Never generate a different key under an old version name; that would make existing ciphertext appear to use the wrong key and will not recover it.
