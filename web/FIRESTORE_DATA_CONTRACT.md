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

When `deletionStatus` is `active`, both `deletionJobId` and `deletionStartedAt` are `null`. When it is `deleting`, `deletionJobId` is non-empty and `deletionStartedAt` is a Firestore `Timestamp`.

The trusted workflow marks the target as deleting in a transaction and creates or reuses its server-only job. The authenticated request UID must match the `users/{uid}` path. A worker validates that the target and job share that UID path, that the job's target ID identifies the target document, and that the target's `deletionJobId` equals the job document ID. Background workers derive the UID from the trusted job path and never trust a client-supplied UID.

While a target is deleting, client edits to it and new references to it are denied. Missing lifecycle fields are never interpreted as `active`; Rules fail closed until trusted compatibility processing resolves the document.

Course deletion removes lessons, materials, tasks, events, and planner blocks, verifies that no references remain, and only then deletes the Course. Task deletion clears `plannerBlocks.taskId` and `focusSessions.taskId` references while preserving valid course associations and planner-block scheduling information. Course deletion clears `focusSessions.courseId` references. Focus sessions remain as historical records. Workers are trusted, bounded, checkpointed, idempotent, retryable, and resumable.

### Deletion concurrency, idempotency, and recovery

- Duplicate requests for a valid deleting target reuse the matching existing job. A missing or mismatched job relationship fails closed and requires trusted recovery; it does not create a competing job.
- Completed jobs retain a minimal idempotency record. A target without a verifiable completed-job record is not assumed to have completed successfully.
- A task deletion request whose parent Course is already deleting returns the valid Course deletion operation rather than creating a task job.
- If independent task deletion wins a race with course deletion, the Course worker does not overwrite that Task's `deletionJobId`. It waits for the task workflow to finish, then re-scans and verifies remaining tasks.
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
