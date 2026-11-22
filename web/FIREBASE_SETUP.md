# Web Firebase Foundation

This is local development setup for the Web application. It does not deploy Firebase configuration or change Firebase Console resources.

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

When no Firebase configuration is supplied, the React application starts in its existing localStorage-only mode. For emulator development, keep the existing Web app API key, auth domain, and app ID settings, set `VITE_USE_FIREBASE_EMULATORS=true`, and the client will replace the project namespace with `demo-overseer-web`. For production, set the real Web app values, `VITE_FIREBASE_PROJECT_ID=overseer-f970c`, and `VITE_USE_FIREBASE_EMULATORS=false`.

Invalid or incomplete Firebase configuration is reported in the developer console, and Firebase-dependent code receives an actionable error. The app does not substitute a production project or claim remote work succeeded.

## Start the emulators

From `web/`:

```sh
npm run emulators
```

In another terminal, run `npm run dev` after setting the local variables above and choosing emulator mode. The emulator configuration binds to loopback addresses only. The Emulator UI is available at `http://127.0.0.1:4000`.

## Firestore rules

`firestore.rules` is deny-all. No ownership model or application data permissions are defined in Phase 1A, so the emulator tests verify that both authenticated and unauthenticated reads and writes are denied. These rules are local and are not deployed.

Run the Rules tests with:

```sh
npm run test:rules
```

## App Check

`src/firebase/appCheck.ts` provides an explicit initialization boundary but is not called by the app. Production App Check is not active as a result of this change. Activation requires a separately approved provider configuration and verified Web App Check setup; development debug-token registration and production site-key configuration must be handled without disabling enforcement.

## Current scope

When valid Firebase configuration is supplied, Firebase App, Auth, and Firestore are initialized by `src/firebase/client.ts`. Without it, the app remains in localStorage-only mode. This phase does not add sign-in screens, Firestore CRUD, local-data migration, AI Logic, App Check activation, Rules deployment, or Firebase Console changes. Existing routes and the `overseer.local-data` browser storage remain the application data source.

Run the focused Firebase configuration tests with:

```sh
npm run test:config
```
