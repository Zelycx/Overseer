# Canonical Firestore data contract

This layer is separate from `src/types/app.ts` and `src/data/storage.ts`. Those files remain the legacy localStorage contract; the models and codecs here describe the future Firestore representation and are not wired into screens, application context, or repositories.

## Ownership and document IDs

All product data is owned below `users/{uid}`. Canonical child paths are `courses/{courseId}`, `lessons/{lessonId}`, `materials/{materialId}`, `tasks/{taskId}`, `events/{eventId}`, `plannerBlocks/{blockId}`, `focusSessions/{sessionId}`, `settings/preferences`, `settings/timerPreferences`, `settings/focusTimer`, `assistantConversations/{conversationId}`, and `assistantConversations/{conversationId}/messages/{messageId}`.

Server-only infrastructure jobs are not product documents and are not accessible to clients. Their paths are `users/{uid}/courseDeletionJobs/{jobId}`, `users/{uid}/taskDeletionJobs/{jobId}`, and `users/{uid}/migrationJobs/{migrationId}`.

The Firestore document ID is authoritative. Decoders set model `id` from the snapshot/path, and encoders omit `id`; document data must not contain a duplicate mutable ID. A focus session's document ID is generated once and reused for retries. It is not inferred from a `runId`.

Product documents use Firestore `Timestamp` values for `createdAt` and `updatedAt`. Course and Task documents use `schemaVersion: 2`; all other product document types remain at `schemaVersion: 1`. The codec preserves timestamp values. A future client repository must keep `createdAt` immutable and use a server timestamp for `updatedAt`. Client Rules must not allow arbitrary historical `createdAt` values.

Job documents use `jobSchemaVersion: 1`, not product `schemaVersion`. Their `createdAt` and `updatedAt` fields are Firestore Timestamps.

## Time values and event DST metadata

`Timestamp` values represent actual instants. Nullable timestamps remain `null`; malformed or non-Timestamp values are rejected. Task `dueDate` is validated and preserved as a date-only `YYYY-MM-DD` string. It is never converted into a synthetic midnight/noon instant.

Events require `startTimeDisambiguation` and `endTimeDisambiguation`. Each is `null`, `earlier`, or `later`, independently:

- `null` records that the authored local wall time was unambiguous.
- `earlier` or `later` records the user's selection for an ambiguous repeated wall time.
- Nonexistent wall times in a DST gap must be rejected by the future timezone-aware wall-time resolver before a document is written.

`startAt` and `endAt` remain authoritative. Deserialization never derives or recalculates them from timezone/disambiguation metadata. Structural codecs can validate the field values and instant ordering, but cannot prove the metadata matches a timezone's DST transition. Future Firestore Rules can validate that both fields exist and contain only `null`, `earlier`, or `later`; DST correctness must be checked by timezone-aware application logic.

If a user explicitly edits an event's timezone, preserve the entered local wall-clock values and resolve new instants in the newly selected IANA timezone. Re-evaluate ambiguity independently for each endpoint; do not copy previous `earlier`/`later` selections blindly. Changing the device timezone alone does not change stored instants. Timezone-aware DST resolution is intentionally deferred to a separately scoped task. No disambiguation fields belong on tasks or planner blocks.

Cross-midnight events and planner blocks are valid when `endAt` is strictly later than `startAt` as an instant.

## Cross-document invariants

These codecs validate only one document at a time. Future repository, Rules, or trusted Function layers must enforce that every referenced course/task belongs to the same user. A planner block with a `taskId` must have `courseId` exactly equal to that task's `courseId`, including `null`. A focus session with a `taskId` has the same course equality invariant. This task does not implement those lookups or claim that client validation is an authorization boundary.

## Course and task deletion lifecycle

Every new Course and Task document requires these fields:

- `deletionStatus`: `active` or `deleting`
- `deletionJobId`: string or `null`
- `deletionStartedAt`: Firestore `Timestamp` or `null`

The initial state is `deletionStatus: active`, `deletionJobId: null`, and `deletionStartedAt: null`. Clients may create only this initial state. Clients cannot change lifecycle fields after creation or directly delete Course or Task documents. Only trusted deletion workflows may transition a target to `deleting`.

Course document IDs are permanent identities within a user's `courses` collection. For every new Firestore Course, the application must allocate a fresh document reference using a Firestore-generated ID and write to that reference. The create flow must not accept a Course ID, document path, or reusable ID from a client or external caller; it must never knowingly reuse a previously deleted Course ID. Once deleted, the ID is permanently retired, and repeated deletion requests resolve only through validated completed Course deletion job evidence. If that evidence is absent, ambiguous, or inconsistent, fail closed. Status lookups identify the operation by job ID, not solely by Course ID. No Course ID generation field is added.

This permanent-retirement rule is an application-level guarantee, not a guarantee provided by the current Firestore Rules. The current Web `CourseEditor` is localStorage-backed and assigns `createId('course')`; it is not a Firestore Course creation path. The current Rules permit Course creation when the caller owns the user path and the document has valid fields, current timestamps, and the initial lifecycle state, but they do not constrain how `{courseId}` was chosen or check whether it was previously deleted. Rules do not conveniently enumerate completed deletion jobs to establish permanent historical retirement, and the current Rules do not enforce this invariant. An auto-generated ID also cannot be checked against all retired IDs without a trusted record of those IDs. If absolute server-enforced retirement is required, a trusted ID-allocation or tombstone mechanism needs a separate architectural decision and approval; this amendment adds no collection or schema field.

When `deletionStatus` is `active`, both `deletionJobId` and `deletionStartedAt` are `null`. When it is `deleting`, `deletionJobId` is non-empty and `deletionStartedAt` is a Firestore `Timestamp`.

The trusted workflow marks the target as deleting in a transaction and creates or reuses its server-only job. The authenticated request UID must match the `users/{uid}` path. A worker validates that the target and job share that UID path, that the job's target ID identifies the target document, and that the target's `deletionJobId` equals the job document ID. Background workers derive the UID from the trusted job path and never trust a client-supplied UID.

While a target is deleting, client edits to it and new references to it are denied. Missing lifecycle fields are never interpreted as `active`; Rules fail closed until trusted compatibility processing resolves the document.

Course deletion removes lessons, materials, tasks, events, and planner blocks, verifies that no references remain, and only then deletes the Course. Task deletion clears `plannerBlocks.taskId` and `focusSessions.taskId` references while preserving valid course associations and planner-block scheduling information. Course deletion clears `focusSessions.courseId` references. Focus sessions remain as historical records. Workers are trusted, bounded, checkpointed, idempotent, retryable, and resumable.

#### Course deletion task-ID manifest

Each Course deletion job has a server-only task-ID manifest at `users/{uid}/courseDeletionJobs/{jobId}/taskIds/{taskId}`. Only trusted backend code may write manifest records. The manifest document ID is the authoritative Task ID; its data contains only `createdAt`, a Firestore `Timestamp`. It is not a product document, has no product `schemaVersion`, and does not duplicate the UID, job ID, or Task ID in its fields.

Within the existing `deleteTasks` phase, the worker first enumerates all Tasks belonging to the Course and persists the complete manifest using bounded, resumable processing. It verifies that pagination is exhausted and every enumerated Task ID has a valid manifest record before beginning Task deletion. Writes are idempotent; existing records are validated rather than overwritten. The worker then inspects `users/{uid}/settings/focusTimer`. If the timer references the deleting Course or any manifested Task, it performs the approved trusted timer reset before deleting the corresponding Tasks. A Course reference is checked and cleared even when the Course has no remaining Tasks. Only after manifest completion and timer cleanup does the worker delete Tasks. This preserves IDs for the later `deletePlannerBlocks` and `clearFocusSessionReferences` phases, including references in PlannerBlocks whose `courseId` is null or inconsistent. Task deletion remains before PlannerBlock deletion; no phase is added or reordered.

Manifest reads and writes are bounded and resumable. Retain all manifest records indefinitely alongside the completed Course deletion job. No manifest cleanup phase or automatic manifest deletion is permitted. This retention does not change the Course deletion phase order.

#### Active timer references during Course deletion

Course deletion inspects `users/{uid}/settings/focusTimer`. If its `courseId` equals the deleting Course or its `taskId` identifies a Task being cascaded, trusted code resets the affected timer to `idle` and clears the affected Course/Task references. It uses the existing trusted reset and generation-fence semantics: the accepted reset increments `generation` exactly once and leaves the previous `writeGeneration` unchanged as the invalidation marker. Timer preferences are not changed, unrelated timers are not reset, and repeating cleanup after the references are cleared must not increment the generation again. A stale client write using the old generation remains invalid under the existing Rules fence.

For an affected timer, the trusted reset uses these field values:

| Field | Reset value/behavior |
|---|---|
| `status` | `idle` |
| `mode` | Preserve existing value |
| `durationSeconds` | Preserve existing value |
| `remainingSeconds` | Set to `durationSeconds` |
| `elapsedSeconds` | Set to `0` |
| `generation` | Increment exactly once |
| `writeGeneration` | Preserve previous value |
| `startedAt` | `null` |
| `segmentStartedAt` | `null` |
| `endsAt` | `null` |
| `courseId` | `null` |
| `taskId` | `null` |
| `runId` | `null` |

This reset occurs before deleting corresponding Tasks and also applies when the timer references the Course but there are no remaining Tasks. Preserve timer preferences. Repeated cleanup after references are cleared must not increment `generation` again. Malformed or inconsistent timer documents fail closed and require trusted recovery; do not silently repair them or reset an unrelated timer.

### Deletion concurrency, idempotency, and recovery

- Duplicate requests for a valid deleting target reuse the matching existing job. A missing or mismatched job relationship fails closed and requires trusted recovery; it does not create a competing job.
- Completed deletion jobs retain a minimal idempotency record; a target without a verifiable completed-job record is not assumed to have completed successfully. Completed Course deletion jobs and their task-ID manifests remain retained indefinitely. Retain all required job-schema fields, including `courseId` and `completedAt`; successful completed records have `phase: complete`, null lease fields and cursor, and may omit `sanitizedError`. A repeated request for a missing Course may return a completed result only when the matching completed job is fully validated: authenticated UID ownership, job path and document ID, `jobSchemaVersion`, `courseId`, `status: completed`, `completedAt`, and consistency with the original deletion target. A missing Course alone never means success. If matching completed-job evidence is absent, ambiguous, or inconsistent, fail closed.
- A task deletion request whose parent Course is already deleting returns the valid Course deletion operation rather than creating a task job.
- If independent task deletion is queued, running, or retryable when the Course worker reaches that Task, the Course worker does not overwrite the Task's `deletionJobId` or start a competing Task deletion. In one lease-token-checked transition, it changes its own job from `running` to `retryable`, preserves the current `phase` and `cursor`, sets `leaseId`, `leaseExpiresAt`, and `heartbeatAt` to `null`, and updates `updatedAt`. The transition is accepted only if the stored job is still `running` with the worker's expected lease token. A stale worker whose token no longer matches cannot checkpoint or release a newer worker's lease. Scheduled reconciliation retries after the configured backoff; before continuing, the worker re-reads the Task and its deletion job. If the Task job is failed, malformed, missing, or mismatched, the Course job becomes `failed`, the Course remains locked, and trusted recovery is required. The Course job must not be marked completed.
- If independent task deletion wins a race with course deletion, the Course worker waits for the Task workflow to finish, then re-scans and verifies remaining tasks.
- A successful worker claim or reclaim increments `attempts`. Running jobs have a lease ID, expiry, and heartbeat. Reclaiming an expired lease issues a new lease ID. Every checkpoint validates the current lease ID so a stale worker cannot commit after reclamation. Persisted `phase` and `cursor` support resumption.
- Transient failures become `retryable`; terminal failures become `failed`. A failed or partially completed deletion does not automatically unlock its target. Retry limits, backoff, terminal-error classification, and operator recovery must be configurable and documented rather than assumed.

### Version-1 Course and Task compatibility

Course and Task canonical documents use schema version 2. Existing version-1 Course and Task documents require trusted compatibility backfill before client access under the new Rules. Backfill inspects matching deletion jobs before adding lifecycle fields. Only documents confirmed to have no active or unresolved deletion job may receive `active/null/null`. Matching active jobs are reconciled with their target documents. Ambiguous or inconsistent records remain unavailable to clients pending trusted recovery. Clients cannot perform lifecycle backfill. Other product document types remain at schema version 1.

## Server-only job schemas

All job records are inaccessible to clients. Their UID ownership comes from the `users/{uid}` path; do not add a redundant `uid` authorization field.

Every job requires:

| Field | Type and constraints |
|---|---|
| `jobSchemaVersion` | Integer, exactly `1` |
| `status` | `queued`, `running`, `retryable`, `failed`, or `completed` |
| `phase` | Job-specific enum listed below |
| `attempts` | Non-negative integer |
| `leaseId` | String or `null` |
| `leaseExpiresAt` | Firestore `Timestamp` or `null` |
| `heartbeatAt` | Firestore `Timestamp` or `null` |
| `cursor` | Opaque string or `null` |
| `createdAt` | Firestore `Timestamp` |
| `updatedAt` | Firestore `Timestamp` |
| `completedAt` | Optional Firestore `Timestamp`; present only when `status` is `completed` |
| `sanitizedError` | Optional map with string `code` and string `message`; never include stacks, credentials, or raw sensitive payloads |

A job with `status: running` must have non-null `leaseId`, `leaseExpiresAt`, and `heartbeatAt`.

Deletion jobs additionally require a non-empty `courseId` for a Course target or a non-empty `taskId` for a Task target. The target's `deletionJobId` matches the corresponding job document ID.

Course deletion phases are `deleteLessons`, `deleteMaterials`, `deleteTasks`, `deleteEvents`, `deletePlannerBlocks`, `clearFocusSessionReferences`, `verify`, and `complete`.

Task deletion phases are `clearPlannerBlockReferences`, `clearFocusSessionReferences`, `verify`, and `complete`.

Migration jobs additionally require `sourceTimeZoneId`, an IANA timezone identifier. Migration phases are `validate`, `import`, `verify`, and `complete`.

### Course deletion dispatch, retries, and recovery

Firestore job triggers provide initial dispatch and bounded continuation, but dispatch only on relevant transitions: initial job creation; a successful bounded-work checkpoint that advances `phase` or `cursor`; an explicit eligible transition that requires work dispatch, such as a queued/retryable claim or expired-lease reclaim with a new lease token. Heartbeat-only updates and maintenance updates to the current lease do not independently dispatch another worker continuation. Trigger delivery may be duplicated; workers must be idempotent, validate the current lease token at every checkpoint, and use the persisted phase/cursor to reject stale continuation events. A continuation of the current lease does not acquire a new lease or increment `attempts`. New claims and expired-lease reclaims issue a new lease token and increment `attempts`.

A scheduled reconciliation Function recovers queued jobs that have not started, retryable jobs whose backoff has elapsed, and running jobs whose `leaseExpiresAt` has expired. It safely claims eligible work with a new lease token. Scheduled reconciliation requires the corresponding Firebase/Google Cloud scheduling infrastructure to be available in the deployed environment. Cloud Tasks is not required for this initial design.

No scheduling-only job fields are added. When a job enters `retryable`, set `updatedAt`; do not change it while the job remains in that retryable state. Clear `leaseId`, `leaseExpiresAt`, and `heartbeatAt` while retryable. The retry delay uses full jitter:

```text
delaySeconds = random(0, min(5 * 2^(attempts - 1), 3600))
```

`attempts` is the count after the successful claim or reclaim that began the failed attempt. Full jitter uniformly selects a delay from zero through the calculated maximum, giving an initial maximum of 5 seconds and a cap of 3600 seconds (1 hour). Reconciliation computes eligibility from `updatedAt`, `attempts`, and this configured policy (`now >= updatedAt + delaySeconds`). Do not add `nextAttemptAt`. Derive a stable pseudorandom sample from the job ID and attempt count, with unbiased mapping to the configured range, so repeated reconciliation scans do not move the eligibility point and no schema field is needed. Use trusted server time for comparisons. Rounding fractional seconds and any clock-skew tolerance are implementation considerations; resolve them without adding schema fields.

Maximum attempts remains 10. A failure after the tenth claimed attempt is terminal and transitions the job to `failed`; do not schedule an eleventh automatic attempt. Reconciliation must not modify malformed jobs speculatively: leave the target locked and require operator recovery.

For a running job, the 60-second heartbeat refreshes `heartbeatAt` and extends `leaseExpiresAt` by the configured five-minute lease duration, subject to the current lease-token check. After a successful bounded write, the worker checkpoints progress under that lease; the job update triggers the next bounded continuation. Continuations reuse the current lease and do not increment `attempts`. The scheduled reconciler issues a new token only when acquiring queued/retryable work or reclaiming an expired lease.

The initial operational settings are:

| Setting | Initial value |
|---|---:|
| Maximum writes per batch | 200 |
| Maximum worker execution time | 90 seconds |
| Cloud Function timeout configuration | 120 seconds |
| Heartbeat interval | 60 seconds |
| Lease duration | 5 minutes |
| Maximum attempts | 10 |
| Retry strategy | Exponential backoff with full jitter |
| Maximum backoff delay | 1 hour |
| Maximum Task IDs per `in` query | 30 |
| Reconciliation interval | 5 minutes |

These settings must be configurable in one centralized operational configuration, not scattered hardcoded constants. Each worker invocation processes at most one bounded write batch, checkpoints successful progress after validating the current lease token, and exits. Trigger continuation or scheduled reconciliation resumes the work using the existing phase, cursor, and lease design. The 90-second worker limit leaves time to checkpoint and exit gracefully before the configured 120-second Cloud Function timeout. No worker may exceed the configured write or execution limit.

Retryable failures include temporary infrastructure failures, Firestore contention, temporarily unavailable services, transient rate limits, and transient resource exhaustion. Terminal failures include invalid schemas, ownership violations, mismatched job/target relationships, malformed references, and violations of frozen data invariants. Retry classification is centralized and documented; invalid records must never be silently skipped. Unclassified or ambiguous failures fail closed for trusted recovery rather than being silently ignored.

#### Operator alerting and recovery

Alert operators when a deletion job enters `failed`; a job is malformed or has an invalid target/job relationship; a queued, retryable, or running job remains unresolved beyond its configured operational alert threshold; or a running job has an expired lease and cannot be safely reclaimed. Alert thresholds and delivery mechanisms are configurable operational settings and do not require job fields.

Failed and malformed jobs remain locked; Course and Task documents are never automatically unlocked. An authorized operator inspects the target, job, manifest, current lease state, and remaining references. The underlying issue is repaired through trusted backend code. Recovery may resume the same existing job only after validating that its target and remaining work are consistent; resumption uses a new lease token, consumes an attempt under the normal claim rule, and preserves the existing job ID and phase/cursor where safe. A resumed job must not exceed the 10-attempt limit; if it is already at that limit, leave it locked and require further intervention rather than resetting `attempts`. Recovery must not create a competing deletion job or overwrite an independent Task deletion lifecycle. If safe recovery cannot be established, leave the target locked and require further intervention. Do not add a job status, phase, or client-accessible recovery mechanism.

The `complete` phase can be committed only after final reference verification. In the final lease-checked transaction, delete the Course and mark its job `completed` with `phase: complete`, `completedAt`, and `updatedAt`; the Course deletion and completed-job update commit atomically. This is the only point at which the status callable may report completion.

### Course deletion status callable

The separate authenticated callable `getCourseDeletionStatus` accepts only `{ jobId }` as input. It requires verified Firebase Authentication context, rejects missing authentication, and derives UID exclusively from `request.auth.uid`. It never accepts an arbitrary UID or client-supplied Firestore path.

The callable validates that the job exists at `users/{request.auth.uid}/courseDeletionJobs/{jobId}`, that the document ID matches the input, `jobSchemaVersion` is exactly `1`, and `courseId` is non-empty. For a non-completed job, the Course must exist at `users/{request.auth.uid}/courses/{courseId}`, use `schemaVersion: 2`, have `deletionStatus: deleting`, and have `deletionJobId` equal to this job ID. For a completed job, validate the retained completed-job record, including its Course ID, `status: completed`, `phase: complete`, and a Firestore `completedAt`; the Course is absent only because its deletion and job completion committed atomically after final reference verification.

The successful response contains only `jobId`, `courseId`, `status`, `phase`, and `completed` (boolean). `completed: true` is returned only for the fully validated completed job; a valid non-completed job returns `false`. Return a sanitized not-found or invalid-operation result for missing or inconsistent records without exposing another user's data. Never return lease tokens, lease expiry, heartbeat, cursor, raw errors, stack traces, or manifest records. This callable does not change the existing server-only Rules policy.

App Check enforcement for new callable and worker operations is deferred until supported clients have the required App Check initialization and configuration. Authentication and ownership validation remain mandatory. App Check is defense in depth, never a substitute for authorization; this amendment does not change existing App Check configuration or enforcement.

### Remaining Course deletion operational details

The Course ID reuse rule, manifest retention, backoff formula and bounds, separate status callable contract, timer reset fields, worker invocation limits, retry classification, and operator recovery policy are specified above. Remaining deployment-specific settings are the alert thresholds and alert delivery mechanisms. The implementation must also settle fractional-second rounding and clock-skew handling for retry eligibility without adding job fields or changing status/phase values.

## Active focus timer generation fence

New timer initialization uses `generation: 0` and `writeGeneration: 0`. Timer duration comes from `settings/timerPreferences`; no hard-coded fallback is permitted.

Every client update preserves `generation` equal to the existing document's generation and sets `writeGeneration` equal to the existing document's generation. A trusted Function reset increments `generation` exactly once and leaves the old `writeGeneration` unchanged as an invalidation marker. A subsequent fresh client write supplies the new generation guard. Trusted Functions independently validate transitions because Admin SDK writes bypass Rules.

## Preferences and timer documents

`aiWorkspaceContextConsent` is represented as a required boolean and defaults to `false` for future account setup (`DEFAULT_AI_WORKSPACE_CONTEXT_CONSENT`). Assistant conversations and messages are saved independently of workspace context consent; consent gates attaching workspace context to prompts, not saving conversation history.

Timer durations live in `settings/timerPreferences`, independent from the active timer. All configured durations must be explicitly supplied as positive integers; no timer-preference defaults are created here. A missing active timer must eventually be initialized from those preferences, never from an implicit hardcoded duration.

The active timer preserves `generation` and `writeGeneration` as non-negative integer fields. The generation fence and reset behavior are defined in the Active focus timer generation fence section above.

## Assistant and focus-session history

Clients may create and read assistant messages but cannot update or individually delete them. Conversation deletion is a trusted, cascading, resumable, and idempotent workflow. Nested messages are deleted before the parent conversation.

Focus sessions are append-only for clients; clients cannot update or delete historical sessions. Trusted deletion workers may clear only references to deleted Course or Task documents. Historical session content, `startedAt`, and `endedAt` remain unchanged. Reference cleanup updates the common `updatedAt` metadata field.

## Migration timestamps and approximation reporting

Trusted migration preserves valid source `createdAt` timestamps as Firestore `Timestamp` values. Missing or invalid source timestamps use migration time, and every such approximation is disclosed. Client Rules do not permit arbitrary historical `createdAt` values. Trusted migration independently validates source values because Admin SDK writes bypass Rules.

Per-record approximation warnings are stored in a server-only results/issues subcollection of the migration job, and the migration job maintains summary counts. The exact subcollection path and warning-record schema must be specified before implementation; do not add migration-only warning fields to product documents.
