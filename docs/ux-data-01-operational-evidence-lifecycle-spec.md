# UX-DATA-01 — Operational Evidence Lifecycle

Status: implementation-frozen technical spec

## Purpose

Close the pre-launch orphan-evidence gap for the three authenticated operational evidence flows without changing their business workflows:

1. Center Claim Inspection evidence.
2. Assigned-Center Resolution completion evidence.
3. Admin Recovery completion evidence.

Customer Claim draft evidence is explicitly out of scope and keeps the existing Cube P draft registry/lifecycle unchanged.

## Non-goals

UX-DATA-01 does not introduce:

- a generic media/file manager;
- a new Storage bucket;
- customer evidence migration;
- new Claim/Inspection/Resolution states;
- a new audit subsystem;
- background Cron scheduling;
- changes to adjudication, assignment, material allocation, fulfillment, or recovery policy.

## Existing problem

The three operational server actions currently upload directly to `warranty-claim-evidence`, return Storage paths to browser state, and allow later deletion based on those browser-held paths. The final authoritative Q/R RPCs independently validate Storage objects and persist immutable evidence metadata.

This leaves an orphan window when an upload succeeds but the final business mutation is abandoned, becomes unauthorized, or never executes.

## Frozen invariant

Every new operational evidence object must have one server-owned staging row before its Storage upload is accepted as part of the flow.

A staged object may become durable business truth only when the authoritative business transaction inserts its canonical evidence metadata. That same transaction atomically consumes the stage.

Cleanup may delete only unconsumed operational stages. A Storage path already linked to canonical Inspection or Resolution evidence must never be returned as a cleanup candidate, even if staging metadata is inconsistent.

## Data model

Add one private, narrow registry: `private.operational_evidence_stages`.

Each row records:

- immutable `storage_path`;
- `flow_kind`: `inspection`, `center_completion`, or `admin_recovery`;
- exactly one owner: `inspection_id` or `resolution_id`;
- authenticated `actor_profile_id` that registered the stage;
- slot `1..5`;
- detected MIME and byte size;
- lifecycle state: `staged`, `delete_pending`, or `consumed`;
- created / delete-reserved / consumed timestamps.

The table is server-only: all direct privileges are revoked from `public`, `anon`, `authenticated`, and `service_role`.

No polymorphic public data model is introduced. The registry exists only for transient operational orchestration.

## Registration boundaries

Expose three bounded `security definer` registration RPCs rather than one generic uploader API:

- `register_warranty_claim_inspection_evidence_stage(...)`
- `register_warranty_claim_resolution_completion_evidence_stage(...)`
- `register_warranty_claim_admin_recovery_evidence_stage(...)`

Each RPC:

1. derives the actor from `auth.uid()`;
2. validates current flow authority and owner state;
3. validates exact path shape, slot, MIME, extension, and `1..8 MiB` size;
4. rejects cross-owner/cross-actor conflicts;
5. is idempotent for the exact same registration;
6. enforces the existing maximum of five retained stage rows for the owner/flow;
7. never grants Storage access itself.

The server action computes the content hash/path, registers it, then performs the admin Storage upload. Browser state is therefore a UI projection, not authority.

## Explicit deletion

Browser-requested removal becomes a two-phase server operation:

1. `reserve_operational_evidence_stage_delete(storage_path)` locks the staging row, revalidates the original actor's current flow authority, and changes `staged -> delete_pending`.
2. Only after that DB commit does the server action call Storage remove.
3. `finalize_operational_evidence_stage_delete(storage_path)` removes the private registry row only when it remains `delete_pending` and is still not linked to canonical business evidence.

A `consumed` stage cannot be reserved or finalized for deletion.

If Storage deletion fails, the row remains `delete_pending` and is eligible for bounded server cleanup/retry.

If authority is lost before explicit removal, the request fails safely and later stale cleanup owns reclamation.

## Atomic consume

Do not replace or duplicate the large Cube Q/R business RPCs.

Add private consume guards as `BEFORE INSERT` triggers on the existing canonical evidence tables:

- `public.warranty_claim_inspection_evidence` consumes only an `inspection` stage matching `inspection_id`, actor, path, MIME, and size.
- `public.warranty_claim_resolution_evidence` consumes either:
  - `center_completion` when the inserting actor is a Center profile; or
  - `admin_recovery` when the inserting actor is an Admin profile;
  and requires matching `resolution_id`, actor, path, MIME, and size.

The trigger changes `staged -> consumed` inside the same transaction that creates durable evidence metadata. Any later failure in the authoritative business RPC rolls the consume back automatically.

Canonical evidence remains append-only/immutable exactly as before.

## Cleanup protocol

Add service-role-only, bounded cleanup RPCs:

- claim a small batch of stale candidates with row locking / `SKIP LOCKED` and mark them `delete_pending`;
- finalize a candidate only after Storage removal succeeds.

Candidate selection rules:

- `delete_pending` stages may be retried;
- `staged` rows are eligible only when older than the caller-supplied stale cutoff;
- `consumed` rows are never candidates;
- rows whose `storage_path` already exists in either canonical evidence table are never candidates regardless of stage state;
- batch size is strictly bounded.

UX-DATA-01 supplies the command/protocol but does not schedule Cron. Launch operations may invoke cleanup deliberately; scheduling is a separate operational decision.

## Upload failure / retry behavior

- Registration happens before Storage upload.
- Exact same registration is idempotent.
- If Storage already contains the exact object and metadata, the server may return the registered stage as ready.
- An unambiguous upload failure may attempt the same safe reserve/remove/finalize protocol; if that cannot complete, the stage is left for stale cleanup.
- An ambiguous upload result keeps the registered stage so the object can be safely retried or removed later; no browser path can bypass the registry.

## Security boundaries

- Existing private bucket remains private.
- No public read or public delete surface is added.
- Registration paths must contain the exact authorized owner id and slot.
- MIME is verified from bytes in the server action and revalidated against Storage metadata by the existing final Q/R RPCs.
- Cleanup functions are `service_role` only.
- Authenticated delete functions require the registering actor and current flow authority.
- Canonical linked evidence is protected twice: consumed state plus anti-join against durable evidence metadata during cleanup/finalize.

## Required code changes

Bounded application changes only in:

- `app/operations/claim-inspections/actions.ts`
- `app/operations/claim-resolutions/actions.ts`
- `app/operations/claim-resolutions/recovery-actions.ts`

plus the migration, generated database types, focused verifier(s), and permanent CI path coverage if required.

Client components and business workflows should not need semantic changes.

## Acceptance contract

UX-DATA-01 is complete only when the same candidate HEAD proves:

1. upload registration precedes accepted Storage upload;
2. exact retries are idempotent;
3. explicit removal reserves before Storage deletion and finalizes after it;
4. abandoned staged evidence becomes a bounded cleanup candidate;
5. delete-pending failures can be retried by cleanup;
6. final Inspection submission atomically consumes its stages;
7. normal Center Resolution completion atomically consumes its stages;
8. Admin Recovery completion atomically consumes its stages;
9. a business-linked Storage path is never returned by cleanup and cannot be explicitly deleted;
10. wrong owner, wrong actor, wrong flow, wrong slot/path, MIME/extension mismatch, oversized/empty data, and sixth retained object are rejected;
11. selected Cube P/Q/R regressions remain green;
12. generated DB types match the final schema;
13. PR Quality and Database Quality are green;
14. TypeScript and production build are green;
15. tracked configuration remains clean.

## Rollback

If cleanup behavior is suspect, disable/inhibit cleanup invocation first. Do not remove the staging/consume invariant while new uploads are using it.

A code rollback must preserve the rule that already-consumed/business-linked evidence is never deleted. Registry removal is safe only after no active application path depends on it and no unconsumed stages require reclamation.
