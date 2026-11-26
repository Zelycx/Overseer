# Google Calendar and Classroom Functions setup

This implementation has not been deployed. Configure the following in a non-production Firebase project first.

## Required project resources

1. Enable Google Calendar API, Google Classroom API, and Cloud KMS API in the Firebase project's linked Google Cloud project.
2. Create a Cloud KMS key ring and symmetric encryption key. The Function runtime service account needs `roles/cloudkms.cryptoKeyEncrypterDecrypter` on that key only.
3. Create the Secret Manager secret `GOOGLE_OAUTH_CLIENT_SECRET`. Grant the Functions runtime service account `roles/secretmanager.secretAccessor` only on that secret.
4. Configure a Web OAuth client with the deployed HTTPS URL for `googleOAuthCallback` as an authorized redirect URI. Keep its client ID as configuration and its secret in Secret Manager.
5. Configure exact HTTPS return origins for each supported Web host. Do not include wildcard origins.
6. Complete the OAuth consent screen and publish/test-user configuration for the requested scopes. Google may require verification before external users can grant restricted/sensitive scopes.

## Functions parameters

Set these Firebase Functions parameters in the target environment:

- `GOOGLE_OAUTH_CLIENT_ID`: Web OAuth client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET`: Secret Manager secret value, accessed via the Firebase secret parameter only.
- `GOOGLE_OAUTH_CALLBACK_URL`: fixed HTTPS callback URL registered on the Web OAuth client.
- `GOOGLE_OAUTH_KMS_KEY_NAME`: full KMS CryptoKey resource name.
- `GOOGLE_OAUTH_RETURN_ORIGINS`: comma-separated exact HTTPS origins allowed as post-consent destinations.
- `GOOGLE_ANDROID_OAUTH_CLIENT_ID`: registered Android OAuth client identity.
- `GOOGLE_ANDROID_OAUTH_REDIRECT_URI`: exact HTTPS Android App Link redirect URI.
- `GOOGLE_IOS_OAUTH_CLIENT_ID`: registered iOS OAuth client identity.
- `GOOGLE_IOS_OAUTH_REDIRECT_URI`: exact HTTPS iOS Universal Link redirect URI.

Use Firebase's parameter/secret prompts in a local non-production setup. Do not put secret values in source control, ordinary `.env` files, client builds, Firestore, or logs. No resource creation or deployment is authorized by this repository change.

## Current implementation boundary

The Functions callback supports the Web authorization-code flow with PKCE. Native clients must obtain a supported native authorization code with PKCE and use a registered, fixed callback identity; they must not send a client secret. A dedicated native callback/handoff adapter is still required before Android/iOS can use the same server callback.

Native callable contract:

- `beginNativeGoogleAuthorization({ provider, platform, codeChallenge })` returns `{ authorizationUrl, state, redirectUri, expiresAt }`. `provider` is `calendar` or `classroom`; `platform` is `android` or `ios`. The server selects the configured native client ID and redirect URI; clients cannot override either.
- The native Google OAuth request uses the returned URL and HTTPS redirect URI. The app generates an S256 PKCE verifier/challenge pair and keeps the verifier in memory for the authorization attempt.
- `completeNativeGoogleAuthorization({ provider, platform, state, code, codeVerifier })` exchanges the code server-side and returns only `{ connected, provider, accountEmail, grantedScopes }`. It derives UID from Firebase Auth and atomically consumes the attempt before exchange. No client secret is used for native client exchange.
- The native redirect URI receives Google's authorization response. The app must immediately submit the code over the authenticated callable and discard it; never persist or log it. App/Universal Link association is required for the configured HTTPS paths.

Android App Links require an `assetlinks.json` association at the exact host/path and an Android intent filter with `android:autoVerify="true"`, matching package name and signing certificate fingerprint. iOS Universal Links require the `apple-app-site-association` file at the associated domain and the app's Associated Domains entitlement. Configure each exact redirect path as authorized for its respective OAuth client. These associations and clients are not created by this change.

Refresh tokens are envelope encrypted with AES-256-GCM and a per-record data key wrapped by Cloud KMS. KMS authenticated data and AES-GCM associated data bind the token to the Firebase UID, integration provider, and token purpose. Records are stored under the server-only top-level collection `_googleIntegrationCredentials`; OAuth attempts use `_googleOAuthAttempts`. Firestore Rules deny client access to both collections.

Disconnect removes only the selected local integration record. Provider-wide Google token revocation is intentionally not called because revocation may invalidate grants for other integrations associated with the same Google account/client.
