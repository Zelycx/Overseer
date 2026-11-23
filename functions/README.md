# Overseer Cloud Functions

This isolated package uses Node.js 24 and native ESM. It provides reusable Admin SDK initialization, contract-backed job models and validators, authenticated Course and Task deletion request/status callables, lease-fenced resumable Course and Task deletion workers, Firestore job-write dispatch, and scheduled reconciliation. Task requests reuse a valid parent Course deletion operation when the Course is already deleting. The Course worker preserves Course deletion jobs and Task-ID manifests after completion; the Task worker preserves its completed job after deleting the Task.

The contract requires complete lease metadata for `running` jobs and null lease metadata for `retryable` jobs. It does not prescribe whether `queued` or `failed` jobs must carry a lease tuple or nulls; validators accept either complete form and reject partial tuples. Course completed jobs require null lease fields and cursor; the contract does not specify a required lease state for completed Task or migration jobs.

From the repository root, build and run the complete Functions suite against the Firestore Emulator:

```sh
npm --prefix functions run build
./web/node_modules/.bin/firebase emulators:exec --only firestore --project demo-overseer-functions "npm --prefix functions test"
```

Run the opt-in integration suite from the repository root:

```sh
npm --prefix functions run build
./web/node_modules/.bin/firebase emulators:exec --only auth,firestore,functions --project demo-overseer-functions "npm --prefix functions run test:integration"
```

The integration suite requires Node.js 24 and the Auth Emulator (`127.0.0.1:9099`), Firestore Emulator (`127.0.0.1:8080`), and Functions Emulator (`127.0.0.1:5001`) running together under the exact demo project ID `demo-overseer-functions`. The Emulator UI is configured on port `4000` but is not required by the tests. The suite creates actual Auth Emulator users and ID tokens, invokes the exported callable endpoints, observes Firestore-triggered workers, verifies Course and Task completion/status polling and cross-user isolation, exercises the Course-lock-wins Task race, and invokes Task reconciliation to recover an eligible retryable job.

The reconciliation function is invoked directly in the integration test; Cloud Scheduler timing and delivery are not emulated. Production Firebase configuration, deployed trigger delivery, Cloud Scheduler behavior, and other deployment-only behavior remain unverified. Deployment is not part of this stage.
