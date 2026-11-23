# Web Firebase Foundation

This is local development setup for the Web application. It does not deploy Firebase configuration or change Firebase Console resources.

## Firebase CLI project directory

The Firebase CLI project root is the repository root, where `firebase.json` points to the Firestore Rules at `web/firestore.rules` and configures the local emulators. The Web application remains independently managed under `web/`; its dependencies and development, build, typecheck, and test scripts stay in `web/package.json`.

Run the Firebase emulator and Rules-test scripts from the repository root with `npm --prefix web run emulators` and `npm --prefix web run test:rules`. The scripts enter the repository root before invoking the Firebase CLI, use the `demo-overseer-web` project, and the Rules tests load `web/firestore.rules`.

## Environment configuration

Create a local Vite environment file for the Web app (for example, `web/.env.local`) and obtain the Firebase Web app configuration from the existing Firebase project. Set these variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_USE_FIREBASE_EMULATORS`

Do not add service-account credentials, private OAuth credentials, or private keys. Firebase Web configuration is included in the browser bundle, so it is not a place for secrets. Keep the local environment file untracked. No environment template is included in this phase.

Project namespaces are intentionally separate:

- **Local Emulator Suite:** `demo-overseer-web`. When `VITE_USE_FIREBASE_EMULATORS=true`, the client overrides `VITE_FIREBASE_PROJECT_ID` with this demo ID, so emulator-mode requests never use the production project namespace.
- **Production Firebase:** `overseer-f970c`. When `VITE_USE_FIREBASE_EMULATORS=false`, the client uses the explicitly configured `VITE_FIREBASE_PROJECT_ID`; production configuration must specify `overseer-f970c`. There is no production-ID fallback.

During local development, `VITE_USE_FIREBASE_EMULATORS` must be explicitly set to exactly `true` or `false` whenever Firebase configuration is present. Other spellings, whitespace, empty values, or missing values are configuration errors. `true` connects Auth at `127.0.0.1:9099` and Firestore at `127.0.0.1:8080`; the app reports the selected mode in the developer console. A production build rejects `true`; set `false` to use its configured Firebase project.

For emulator development, keep the existing Web app API key, auth domain, and app ID settings, set `VITE_USE_FIREBASE_EMULATORS=true`, and the client will replace the project namespace with `demo-overseer-web`. For production, set the real Web app values, `VITE_FIREBASE_PROJECT_ID=overseer-f970c`, and `VITE_USE_FIREBASE_EMULATORS=false`.

Invalid or incomplete Firebase configuration is reported in the developer console, and Firebase-dependent code receives an actionable error. The app does not substitute a production project or claim remote work succeeded.

## Start the emulators

From the repository root:

```sh
npm --prefix web run emulators
```

In another terminal, run `npm --prefix web run dev` after setting the local variables above and choosing emulator mode. The Auth Emulator uses port `9099`, Firestore Emulator uses port `8080`, and Emulator UI uses port `4000`; the emulator configuration binds to loopback addresses only. The Emulator UI is available at `http://127.0.0.1:4000`.

## Web authentication

The Web app supports email/password account creation and sign-in, Google sign-in, and sign-out. Workspace routes wait for Firebase Auth initialization and redirect signed-out users to `/auth`; the landing page remains public. The Auth session does not migrate or synchronize local workspace data.

Run Auth lifecycle tests with the local Auth Emulator:

```sh
npm --prefix web run test:auth
```

Google popup interaction is browser-based and is not exercised by the Node Auth Emulator tests. Verify it manually in the local Web app with emulator mode enabled. No Firebase Console provider settings are changed by these tests.

When Firebase configuration is absent or invalid, Firebase Auth is unavailable and protected workspace routes lead to `/auth` with an initialization/configuration error. Existing localStorage data is not cleared or uploaded, but workspace access requires valid Firebase Auth configuration.

## Firestore rules

`firestore.rules` is deny-all. No ownership model or application data permissions are defined in Phase 1A, so the emulator tests verify that both authenticated and unauthenticated reads and writes are denied. These rules are local and are not deployed.

Run the Rules tests with:

```sh
npm --prefix web run test:rules
```

## App Check

`src/firebase/appCheck.ts` provides an explicit initialization boundary but is not called by the app. Production App Check is not active as a result of this change. Activation requires a separately approved provider configuration and verified Web App Check setup; development debug-token registration and production site-key configuration must be handled without disabling enforcement.

## Current scope

When valid Firebase configuration is supplied, Firebase App, Auth, and Firestore are initialized by `src/firebase/client.ts`. This phase adds Web Auth session management and protected workspace routing only. Firestore Rules remain deny-all; there is no Firestore CRUD, profile/preferences bootstrap, local-data migration or synchronization, AI Logic, App Check activation, Rules deployment, or Firebase Console change. `overseer.local-data` remains device-local and its import/export, recovery, seed, and reset behavior is unchanged.

Run the focused Firebase configuration tests with:

```sh
npm run test:config
```
