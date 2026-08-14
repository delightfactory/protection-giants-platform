# Cube F — Roll Transfer State & Reservation Engine Specification

**Date:** 2026-08-14  
**Status:** Proposed implementation specification for approval/merge before coding  
**Repository:** `delightfactory/protection-giants-platform`  
**Baseline:** `main` at `5d9d8dfcdd3c30748c6df4da3522a4435068f4d5`

## 1. Purpose

Cube F introduces the first real Roll Transfer state engine.

Its responsibility is deliberately narrow:

> create a pending Transfer between two Operational Parties, reserve the selected physical Rolls without changing confirmed custody, and safely release that reservation when the pending Transfer is cancelled or rejected before receipt.

Cube F is a database/service foundation. It does not implement camera scanning, sender selection UI, recipient inbox/receipt, partial receipt, or confirmed custody movement.

Those later responsibilities remain:

- Cube G — sender Transfer UX and Scan/Select/Lot selection;
- Cube H — recipient receipt, partial receipt, discrepancy resolution and confirmed custody transition.

The specification follows the current project governance: smallest complete state engine that satisfies the approved lifecycle without creating a generic workflow subsystem.

---

## 2. Authoritative dependencies

Cube F depends on the already-merged:

- Product Foundation;
- Production Order / Lot / Roll Foundation;
- Agent & Network Foundation;
- Operational Party + stable Transfer ID foundation;
- exact recipient resolver/privacy boundary;
- Cube D Roll Custody Foundation;
- current Auth/Profile operational access model.

It is designed from the actual merged schema, especially:

- `public.operational_parties`;
- `public.roll_custody_current`;
- `public.roll_custody_events`;
- `public.rolls`;
- `public.production_orders`.

Cube F does not depend on Cube E at database/service level. Cube E becomes a dependency only when Cube G uses the contextual Roll QR for physical scanning.

The deferred real printer/cutter validation from Cube E does not block Cube F.

---

## 3. Governing business invariants

### F-01 — confirmed custody remains authoritative

`roll_custody_current` remains the only authoritative current confirmed physical custodian projection.

Cube F does not add reservation state to that table and does not change its meaning.

### F-02 — creating a Transfer does not move custody

When a Transfer is created:

- sender remains the confirmed current custodian;
- selected Rolls become reserved against conflicting Transfers;
- no new `roll_custody_events` event is appended because confirmed custody has not changed.

### F-03 — sender must actually hold every selected Roll

At Transfer creation time every selected Roll must have:

`roll_custody_current.custodian_party_id = sender_party_id`

The check is repeated inside the same atomic database transaction that creates the reservation.

### F-04 — one active reservation per physical Roll

A Roll can belong to at most one active pending Transfer reservation at a time.

This is a database-enforced invariant, not an application/UI convention.

### F-05 — recipient must be a different active Operational Party

Recipient:

- is resolved by exact stable Transfer ID;
- must currently be operationally active when a new Transfer is created;
- may be Company, Agent, Dealer or Center;
- must not equal sender.

Management ancestry is not a Transfer route rule.

### F-06 — Center user existence is not recipient existence

An active Center may be a Transfer recipient even if it has not yet onboarded its first user.

Receipt later requires an authenticated authorized Center user, but Transfer creation does not.

### F-07 — network approval/location do not gate Transfers

Center geographic location, public-directory publication and Protection Giants network approval are not Transfer eligibility requirements.

### F-08 — voided production is not transferable

Every selected Roll must belong to a Production Order whose status is `generated`.

A Roll under a voided Production Order is never eligible for a new Transfer.

### F-09 — pending reservation blocks Production Order void

A Production Order cannot transition to `voided` while any of its Rolls has an active Transfer reservation.

The operator must first cancel/reject/otherwise resolve the pending Transfer reservation.

Cube F enforces this with a narrow database guard; it does not redesign the Production Foundation or automatically cancel Transfers.

If a later Cube H confirms custody movement, that later cube must re-review and strengthen the Production-void guard for already-received/transferred Rolls.

### F-10 — no automatic expiry

Pending Transfers do not expire automatically in the first release.

No cron, timeout, background release or expiry timestamp is introduced in Cube F.

### F-11 — pre-receipt cancellation/rejection releases reservation only

Before any receipt exists:

- sender may cancel its pending Transfer;
- recipient may reject the pending Transfer;
- active reservations are released;
- confirmed custody remains unchanged.

### F-12 — Transfer ID is identity, not authority

Knowing a Transfer ID does not authorize movement.

Authorization still requires a valid active acting profile/party and confirmed sender custody.

### F-13 — lifecycle suspension must not create an unrecoverable reservation

Entity/profile suspension must not silently release a pending Transfer because that would rewrite physical movement intent without an explicit Transfer action.

However, because pending Transfers do not auto-expire, the platform also must not allow a reservation to become permanently unrecoverable when an operational party is suspended.

Cube F therefore includes one narrow audited Admin recovery action described in section 11. It is not party impersonation and never moves custody.

### F-14 — lifecycle authorization is transactionally revalidated

A state-changing RPC must not rely only on an earlier application-layer `requireOperationalProfile()` check.

The database mutation must lock/revalidate the caller Profile and, for Agent/Dealer/Center actors, the bound operational entity before committing the action. This serializes the Transfer action against concurrent profile/entity suspension/reactivation.

Result:

- if the Transfer mutation establishes its lifecycle lock first, it completes while the actor is still active and the later suspension waits;
- if suspension establishes its update lock first, the Transfer mutation later observes the inactive state and fails.

No Transfer mutation may commit from a stale active-state read.

---

## 4. Acting-party rule

### 4.1 Ordinary operational users

For an active Agent, Dealer or Center user, the acting sender/recipient party is the unique Operational Party bound to that user's active operational entity.

The existing role/entity invariant remains authoritative.

### 4.2 Protection Giants Admin

An active `admin` profile acts as the singleton **Company Operational Party** for ordinary Transfer party actions.

This rule exists because:

- all newly produced Rolls begin in Company custody;
- approved physical routes include Company → Agent/Center and returns to Company;
- Admin profiles intentionally have no Agent/Dealer/Center binding.

### 4.3 Explicit limitation

Admin acting as Company is **not** a generic impersonation mechanism.

Cube F must not allow Admin to choose an arbitrary Agent, Dealer or Center as sender/recipient actor on behalf of that party.

The separate administrative recovery action in section 11 is an audited support action, not an acting-party substitution.

### 4.4 Mutation lifecycle lock

Every ordinary Transfer mutation must obtain an appropriate row lock on the caller's Profile and, where applicable, the bound Agent/Dealer/Center row before final authorization.

Admin ordinary Transfer actions lock/revalidate the Admin Profile; the singleton Company has no invented lifecycle-status row.

The implementation may encapsulate this in a narrow private helper, but the helper must return only the caller's own acting party and must not become a party-browsing or impersonation API.

---

## 5. Proposed data model

The model uses four narrow structures:

1. Transfer header;
2. immutable Transfer membership items;
3. active reservation projection;
4. immutable Transfer event history.

No generic workflow/state-machine tables are introduced.

### 5.1 `public.roll_transfers`

Purpose: one business Transfer request/header.

Target fields:

- `id uuid primary key default gen_random_uuid()`
- `transfer_number text not null unique`
- `request_id uuid not null unique`
- `sender_party_id uuid not null references operational_parties(id) on delete restrict`
- `recipient_party_id uuid not null references operational_parties(id) on delete restrict`
- `status text not null`
- `roll_count integer not null`
- `created_by_profile_id uuid not null references profiles(id) on delete restrict`
- `created_at timestamptz not null default now()`
- `closed_at timestamptz null`

Constraints:

- `sender_party_id <> recipient_party_id`;
- `roll_count between 1 and 10000`;
- status in the Cube F vocabulary;
- `closed_at is null` only while pending;
- terminal states require `closed_at`.

### 5.2 Transfer number

Use a human-readable immutable business identifier:

`PG-T-YYYYMMDD-NNNNNNNN`

Rules:

- date component uses Cairo business date;
- numeric sequence is database-generated and platform-wide monotonic;
- Transfer number is not secret and is not used for authorization;
- UUID remains the internal relational primary key;
- `request_id` remains the idempotency identity and is not displayed as the business Transfer number.

### 5.3 Cube F status vocabulary

Cube F introduces only:

- `pending`
- `cancelled`
- `rejected`

Meaning:

- `pending` — reservation is active and confirmed custody remains with sender;
- `cancelled` — Transfer was terminated before receipt by the sender or by the explicit audited Admin recovery path; reservation released;
- `rejected` — recipient terminated the Transfer before receipt; reservation released.

The event type records whether a cancellation was ordinary sender cancellation or administrative recovery.

Cube H may later extend the vocabulary for receipt/partial-receipt states. Cube F must not invent those future states now.

### 5.4 `public.roll_transfer_items`

Purpose: immutable membership — which physical Rolls were selected when the Transfer was created.

Target fields:

- `transfer_id uuid not null references roll_transfers(id) on delete restrict`
- `roll_id uuid not null references rolls(id) on delete restrict`
- `created_at timestamptz not null default now()`

Primary key:

`(transfer_id, roll_id)`

Transfer membership is immutable after creation.

Cube F does not add per-item receipt state. Cube H owns that later extension because partial receipt has not happened yet.

### 5.5 `public.roll_transfer_reservations`

Purpose: fast authoritative projection of **active Transfer reservation only**.

Target fields:

- `roll_id uuid primary key references rolls(id) on delete restrict`
- `transfer_id uuid not null`
- `reserved_at timestamptz not null default now()`

Use a composite foreign key so `(transfer_id, roll_id)` must exist in `roll_transfer_items`.

The primary key on `roll_id` is the final database collision guard: one physical Roll cannot have two active reservations.

Lifecycle:

- inserted atomically when Transfer is created;
- remains while Transfer is `pending`;
- deleted atomically on valid sender cancellation, recipient rejection, or audited Admin recovery cancellation;
- later Cube H will consume/release reservation item-by-item during receipt/resolution.

This table is a current-state projection, not audit history.

### 5.6 `public.roll_transfer_events`

Purpose: immutable audit history of Transfer state transitions.

Target fields:

- `id uuid primary key default gen_random_uuid()`
- `transfer_id uuid not null references roll_transfers(id) on delete restrict`
- `event_sequence integer not null check (event_sequence > 0)`
- `event_type text not null`
- `actor_profile_id uuid not null references profiles(id) on delete restrict`
- `actor_party_id uuid null references operational_parties(id) on delete restrict`
- `reason text null`
- `occurred_at timestamptz not null default now()`

Unique:

`(transfer_id, event_sequence)`

Cube F event types:

- `created`
- `cancelled`
- `rejected`
- `administrative_cancelled`

Rules:

- `created`, `cancelled`, `rejected` record the actual acting Operational Party in `actor_party_id` and do not require a reason;
- `administrative_cancelled` records the Admin profile, keeps `actor_party_id = null` to avoid pretending the Admin acted as either business party, and requires a trimmed reason of 5–500 characters.

No generic JSON payload is introduced.

Transfer events are append-only and reject UPDATE/DELETE.

---

## 6. Why reservation is a separate projection

Reservation is intentionally not a column on `roll_custody_current`.

Reasons:

1. confirmed custody and pending movement are different business facts;
2. Cube D's current-custody meaning remains stable;
3. one-row-per-Roll reservation naturally provides the concurrency invariant;
4. release is a simple projection deletion while Transfer history remains preserved;
5. Cube H can later consume reservations without rewriting custody semantics.

This is the smallest model that satisfies the approved behavior.

---

## 7. Transfer creation RPC

Introduce one controlled mutation, conceptually:

`public.create_roll_transfer(p_request_id uuid, p_recipient_transfer_code text, p_roll_ids uuid[]) returns uuid`

Exact function name may follow repository naming conventions, but its contract is fixed by this specification.

### 7.1 Input boundaries

- `p_request_id` required UUID;
- recipient Transfer ID required and normalized exactly like the existing resolver;
- Roll array must contain between 1 and 10,000 IDs;
- null Roll IDs rejected;
- duplicate Roll IDs rejected rather than silently deduplicated.

The 10,000 ceiling matches the existing maximum physical Rolls in one Production Order and allows a trusted full-Lot movement without artificial chunking at the state-engine layer.

Cube G may still use smaller UX batches where appropriate.

### 7.2 Idempotency

Use a caller-supplied UUID request key and transaction-scoped advisory lock for that key.

`roll_transfers.request_id` is globally unique.

A retry may return the already-created Transfer only when all are true:

- same authenticated Profile owns the existing request;
- normalized recipient Transfer ID resolves to the same immutable recipient party used by the original Transfer;
- supplied Roll set exactly matches the original immutable Transfer membership, order-insensitively.

If the request ID exists but recipient or Roll membership differs, reject it as an idempotency-key reuse conflict.

This prevents an old/stale browser request key from silently returning an unrelated Transfer.

For a matching retry of an already-created Transfer, current recipient/custody/reservation state is not reinterpreted as a new creation attempt; the RPC returns the existing Transfer identity after the payload-equivalence check.

Idempotency protects retry/double-submit.

It does **not** replace per-Roll reservation concurrency protection.

### 7.3 Atomic creation sequence

Inside one database transaction/RPC:

1. validate basic input shape and normalize recipient Transfer ID;
2. authenticate caller;
3. lock/revalidate caller Profile and bound operational entity, then derive acting sender party;
4. acquire the request-id advisory transaction lock;
5. if `request_id` already exists, enforce the exact actor + recipient + Roll-set equivalence contract from section 7.2 and return/reject without creating new state;
6. resolve the exact recipient party, lock/revalidate its current entity lifecycle state, and require active recipient;
7. reject recipient = sender;
8. validate all Roll IDs exist and are unique;
9. identify all affected Production Orders;
10. lock affected Production Order rows in deterministic order and verify each remains `generated`;
11. lock selected `roll_custody_current` rows in deterministic Roll-ID order;
12. verify every selected Roll is currently held by sender;
13. verify no selected Roll already has an active reservation;
14. allocate Transfer number;
15. insert Transfer header;
16. insert immutable Transfer items;
17. insert one reservation row per item;
18. append `created` Transfer event as sequence 1;
19. commit.

Any failure rolls back the entire new Transfer.

There is no partially created Transfer.

### 7.4 Deterministic locking

When multiple Rolls/Production Orders are involved, lock rows in stable ID order.

Purpose:

- reduce deadlock risk;
- make concurrent reservation attempts deterministic;
- coordinate safely with Production Order voiding.

### 7.5 Reservation race

Two different creation requests may both target the same Roll.

The database must guarantee only one succeeds.

Required protection is layered:

- lock current-custody rows;
- check active reservation state;
- final `roll_transfer_reservations.roll_id` primary-key uniqueness.

A unique-violation race must be surfaced as a clear Transfer conflict, not as a generic internal error.

---

## 8. Production Order void coordination

The existing `void_production_order` path locks its target Production Order `FOR UPDATE`.

Cube F adds a narrow database-level guard on a `generated → voided` transition:

- if any Roll under the order exists in `roll_transfer_reservations`, reject the void;
- do not delete or cancel the Transfer automatically.

Transfer creation locks affected Production Order rows before reservation creation.

Therefore concurrency behaves correctly:

### Transfer wins lock first

- Transfer validates `generated`;
- reservations commit;
- waiting void attempt resumes;
- void guard sees active reservation and rejects.

### Void wins lock first

- void completes;
- waiting Transfer resumes;
- Transfer re-reads locked Production Order and sees `voided`;
- Transfer creation rejects.

This closes the otherwise dangerous race without redesigning Production.

---

## 9. Sender cancellation RPC

Introduce controlled mutation, conceptually:

`public.cancel_roll_transfer(p_transfer_id uuid) returns uuid`

Rules:

1. authenticate caller;
2. lock/revalidate caller Profile/entity and derive acting party;
3. lock Transfer header `FOR UPDATE`;
4. actor party must equal `sender_party_id`;
5. Transfer must be `pending`;
6. repeated cancellation of the same already-cancelled Transfer by its sender may return success idempotently only when the terminal event is the sender cancellation path;
7. rejected/administratively-cancelled/other future non-cancellable states fail;
8. update header to `cancelled` and set `closed_at`;
9. delete all active reservation rows belonging to that Transfer;
10. append immutable `cancelled` event;
11. leave `roll_custody_current` and `roll_custody_events` unchanged.

No cancellation reason is required for normal sender cancellation.

---

## 10. Recipient rejection RPC

Introduce controlled mutation, conceptually:

`public.reject_roll_transfer(p_transfer_id uuid) returns uuid`

Rules:

1. authenticate caller;
2. lock/revalidate caller Profile/entity and derive acting party;
3. lock Transfer header `FOR UPDATE`;
4. actor party must equal `recipient_party_id`;
5. Transfer must be `pending`;
6. repeated rejection of the same already-rejected Transfer by its recipient may return success idempotently;
7. cancelled/other future non-rejectable states fail;
8. update header to `rejected` and set `closed_at`;
9. delete all active reservations belonging to that Transfer;
10. append immutable `rejected` event;
11. confirmed custody remains sender.

A Center with no user cannot perform this action until onboarding creates an authorized Center user; this does not invalidate the pending Transfer itself.

---

## 11. Administrative recovery cancellation

Introduce one narrow support mutation, conceptually:

`public.admin_cancel_pending_roll_transfer(p_transfer_id uuid, p_reason text) returns uuid`

Purpose: prevent a pending reservation from becoming operationally unrecoverable after lifecycle suspension, without introducing automatic expiry or Admin impersonation.

Rules:

1. authenticate caller and lock/revalidate active Admin Profile;
2. require trimmed reason between 5 and 500 characters;
3. lock Transfer header `FOR UPDATE`;
4. Transfer must still be `pending`;
5. lock/revalidate the relevant sender/recipient entity lifecycle rows;
6. at least one non-Company sender/recipient Operational Party must currently be operationally inactive/suspended;
7. if both business parties are active, Admin recovery is rejected and the normal sender/recipient lifecycle must be used;
8. update header to `cancelled` and set `closed_at`;
9. delete all active reservations for the Transfer;
10. append `administrative_cancelled` event with Admin profile, `actor_party_id = null`, and mandatory reason;
11. do not modify confirmed custody or custody history.

This path is deliberately not available as a normal Transfer convenience and must not be exposed as “send/reject as another party”.

If future operational evidence proves a broader dispute-resolution authority is needed, that belongs to a later explicit Product Decision rather than silently broadening this recovery RPC.

Cube H must re-review this administrative recovery function together with ordinary cancellation/rejection once any receipt state exists, so no pre-receipt terminal action can invalidate already-confirmed receipt.

---

## 12. State transition table

Cube F permits only:

| From | Action | Actor | To | Reservation | Custody |
|---|---|---|---|---|---|
| none | create | sender | pending | create | unchanged |
| pending | cancel | sender | cancelled | release | unchanged |
| pending | reject | recipient | rejected | release | unchanged |
| pending | administrative recovery cancel | Admin, only under recovery condition | cancelled | release | unchanged |

No other transition is part of Cube F.

Cube H later extends this table for receipt and partial receipt and must harden these pre-receipt functions against any received state.

---

## 13. Authorization and RLS contract

### 13.1 Mutations

Critical state mutation is RPC-only.

Do not grant ordinary browser/client roles direct INSERT/UPDATE/DELETE on:

- `roll_transfers`;
- `roll_transfer_items`;
- `roll_transfer_reservations`;
- `roll_transfer_events`.

`service_role` Data API must not receive blanket mutation grants merely for convenience.

New public RPCs receive only the explicit `EXECUTE` grants required by the existing Database Quality default-function-grant policy.

### 13.2 Transfer header read visibility

Authenticated read visibility:

- active Admin: all Transfers for administrative/support audit;
- active Agent/Dealer/Center: Transfers where its own Operational Party is sender or recipient.

Admin global read does not mean Admin may act as arbitrary parties; ordinary mutation acting-party rule remains Company-only and administrative recovery is separately constrained/audited.

### 13.3 Transfer item read visibility

A caller may read Transfer items only when it can read the parent Transfer.

### 13.4 Transfer event read visibility

Same as parent Transfer:

- Admin all;
- sender/recipient parties their own Transfer timeline.

### 13.5 Reservation projection visibility

`roll_transfer_reservations` is an internal current-state projection and is not exposed as a general client table.

Later Cube G may use a narrow eligibility/query RPC to exclude reserved Rolls while selecting from sender custody.

Do not expose global reservation browsing.

---

## 14. Active-state semantics

Cube F preserves current non-cascading operational lifecycle.

Eligibility checks the party's own entity state:

- Agent party → its Agent must be active;
- Dealer party → its Dealer must be active;
- Center party → its Center must be active;
- Company party → singleton Company identity, no invented status field.

Do not add a rule that a Dealer/Center becomes Transfer-inactive only because an ancestor Agent/Dealer is suspended.

That would contradict the current lifecycle model and requires a separate Product Decision if ever desired.

A party suspension does not automatically cancel an already-pending Transfer. Normal or administrative recovery must explicitly resolve it.

---

## 15. Exact recipient privacy boundary

Cube F reuses the stable Transfer ID model.

Normal send flow remains:

`exact Transfer ID → minimal verification → create Transfer`

The creation RPC must revalidate recipient identity and active state inside its transaction even if Cube G previously displayed a verification card.

A client-supplied internal `party_id` alone is not trusted as recipient authority.

No fuzzy search or global party directory is added.

---

## 16. Error/failure taxonomy

Database/service errors should be stable enough for later Arabic mobile UX to map them to clear messages.

Cube F must distinguish at minimum:

- unauthenticated/inactive actor;
- actor lifecycle changed during mutation attempt;
- invalid recipient Transfer ID;
- recipient suspended/inactive;
- sender = recipient;
- empty/too-large Roll selection;
- duplicate Roll IDs in request;
- Roll not found;
- voided Production Order;
- Roll not currently held by sender;
- Roll already reserved by another Transfer;
- request ID belongs to another actor;
- request ID was reused with a different recipient or Roll set;
- Transfer not found;
- actor is not sender for cancellation;
- actor is not recipient for rejection;
- invalid current Transfer state;
- Production Order cannot be voided while active Transfer reservation exists;
- invalid/too-short administrative recovery reason;
- Admin recovery not allowed while both business parties are operationally active.

The implementation may use PostgreSQL SQLSTATE plus stable message/code conventions, but must not force the future UI to parse arbitrary internal exception text.

---

## 17. Performance and bounded scale

Cube F is designed for the already-approved production ceiling of 10,000 Rolls per order.

Required indexes should support:

- Transfer number lookup;
- sender recent Transfers;
- recipient pending/recent Transfers;
- Transfer item listing by Transfer;
- active reservation lookup by Roll;
- reservation lookup by Transfer;
- event timeline by Transfer/sequence.

Do not add speculative analytics/index families beyond demonstrated query paths.

The creation RPC must remain set-based for Roll validation/insertion. Do not loop through thousands of Rolls one network/database round trip at a time.

The idempotent Roll-set equivalence check must also be set-based/order-insensitive; do not compare 10,000 items through application-side per-row requests.

---

## 18. Audit and immutability

### Transfer header

Identity fields are immutable after creation:

- Transfer number;
- request ID;
- sender;
- recipient;
- created-by;
- Roll count.

Only controlled state transition functions may change `status`/`closed_at`.

### Transfer items

Membership is immutable after creation.

### Transfer events

Append-only; UPDATE/DELETE rejected.

Administrative recovery reason is part of immutable audit evidence.

### Reservation projection

Mutable only through controlled Transfer lifecycle functions because it represents current pending state, not history.

### Custody history

Cube F never mutates or appends confirmed custody history because no receipt has happened.

---

## 19. Relationship with Cube G

Cube G consumes Cube F; it does not redesign it.

Cube G will own:

- enter/scan recipient Transfer ID;
- recipient verification card;
- Scan Rolls;
- Select Rolls;
- Select Lot;
- partial-held Lot clarity;
- review/count confirmation;
- sender mobile flow;
- interrupted-submit retry UX.

Cube F exposes a clean create contract accepting an explicit final set of Roll IDs after Cube G has performed its selection UX.

The state engine does not care whether those IDs came from camera, manual subset selection or Lot expansion.

---

## 20. Relationship with Cube H

Cube H owns the first real confirmed custody transition.

At receipt time, Cube H must atomically coordinate:

- Transfer/item reservation state;
- current custody row lock/revalidation;
- `roll_custody_current` update;
- next immutable `roll_custody_events` sequence;
- receipt/partial-receipt state.

Cube F deliberately does not prebuild those receipt tables/states.

Cube H may extend the Transfer status vocabulary and item state while preserving Cube F Transfer identity/membership/history.

Cube H must also revisit sender cancellation, recipient rejection and Admin recovery so they remain strictly pre-receipt transitions under the new receipt state.

---

## 21. Explicit non-goals

Cube F does not implement:

- camera/QR scanner UI;
- Roll QR changes;
- sender page/form;
- recipient inbox;
- receipt confirmation;
- partial receipt;
- discrepancy resolution;
- custody movement;
- automatic expiry;
- Transfer shipping documents;
- pricing/accounting/invoices;
- carrier/logistics tracking;
- hierarchy route matrix;
- notification engine;
- generic workflow engine;
- Activation/Warranty state;
- claims;
- changes to Product/Roll identifiers;
- broad Admin impersonation or general dispute-resolution workflow.

---

## 22. Database Quality contract

Cube F is incomplete until Database Quality permanently verifies the new contracts.

### Creation happy paths

Test at minimum:

- Company/Admin → Agent;
- Company/Admin → Center;
- Agent → Dealer;
- Agent → Center;
- Dealer → Dealer;
- Dealer → Center;
- Center → Center;
- Center → Dealer;
- Dealer → Company.

The matrix proves hierarchy is not used as a route matrix.

### Identity/authorization/lifecycle locking

- Admin acts only as Company for ordinary party mutations;
- ordinary users act only as their bound party;
- cross-party sender spoofing fails;
- exact active recipient required;
- suspended recipient fails at new creation;
- active child remains governed by its own active state despite suspended parent;
- concurrent actor/entity suspension versus create/cancel/reject produces a serialized valid outcome and never commits from a stale active-state read.

### Custody/reservation

- sender must currently hold every Roll;
- creating Transfer leaves custody unchanged;
- created event exists;
- one reservation per Roll;
- second Transfer for same Roll fails;
- concurrent different requests for same Roll result in exactly one reservation winner;
- duplicate Roll IDs in one request fail;
- mixed Rolls from multiple generated Production Orders are supported;
- voided-order Roll fails.

### Idempotency

- same actor + same request ID + same recipient + same Roll set returns same Transfer;
- reordered but identical Roll set is accepted as the same retry;
- request retry creates no duplicate items/reservations/events;
- different actor cannot reuse request ID;
- same actor cannot reuse request ID for different recipient;
- same actor cannot reuse request ID for a different Roll set.

### Cancellation/rejection

- sender can cancel pending Transfer;
- non-sender cannot cancel;
- recipient can reject pending Transfer;
- non-recipient cannot reject;
- reservations release;
- custody remains unchanged;
- terminal event appended;
- invalid terminal transition fails;
- same valid terminal action safely retries idempotently.

### Administrative recovery

- suspending a party does not silently release reservation;
- active Admin can recovery-cancel a pending Transfer only when the recovery condition is met;
- reason is mandatory and audited;
- both-active-party Transfer cannot be recovery-cancelled by Admin;
- recovery records `administrative_cancelled`, no acting party impersonation, releases reservation and leaves custody unchanged;
- recovery lifecycle-state check is serialized against concurrent reactivation.

### Production void coordination

- active reservation blocks Production Order void;
- after pending Transfer resolution releases reservation, void may proceed if no other downstream rule blocks it;
- concurrent Transfer-create vs void produces one valid outcome, never `voided + active reservation`.

### RLS/Data API

- Admin read all Transfers;
- sender/recipient read own Transfers/items/events;
- unrelated operational party cannot read them;
- suspended actor loses ordinary operational read/action access;
- reservation projection cannot be globally browsed;
- no direct client mutations;
- service-role Data API remains denied except explicit existing contracts;
- new public functions have only explicit intended EXECUTE grants.

### Scale

- 10,000 Roll creation request succeeds within the project CI/runtime limits when all Rolls are eligible;
- 10,001 is rejected before mutation;
- set-based creation produces exactly 10,000 items + reservations without partial state;
- 10,000-Roll matching idempotent retry is correctly recognized without duplicate state.

Generated public Supabase TypeScript types must match the rebuilt schema exactly.

---

## 23. Application/service integration

Cube F may add a small server-side TypeScript service wrapper for the RPC contracts if needed by tests/future callers.

It must not add a sender UI before Cube G.

The administrative recovery action also does not justify a broad Transfer-management UI in Cube F. If implementation requires an Admin-only support surface to make the recovery path genuinely operable, it must be minimal, explicit, and limited to viewing a pending Transfer and performing the audited recovery cancellation; no sender/recipient workflow should leak in.

No placeholder Transfer navigation/button should be exposed to ordinary operational users until the real sender workflow exists.

---

## 24. Definition of Done

Cube F is Done only when all are true:

- schema matches this bounded model;
- active reservation is separate from confirmed custody;
- Admin → Company acting rule is enforced without generic impersonation;
- exact active recipient rule is enforced;
- caller/recipient lifecycle state is transactionally revalidated under appropriate locking;
- Transfer creation is atomic and payload-safe idempotent;
- per-Roll reservation collision is database-enforced;
- no Transfer creation can race into a voided Production Order;
- active reservation blocks Production Order void;
- sender cancellation works atomically;
- recipient rejection works atomically;
- lifecycle suspension cannot create an unrecoverable reservation because the narrow audited Admin recovery path works;
- cancellation/rejection/recovery release reservations and never move custody;
- Transfer identity/items/events are immutable as specified;
- RLS/read privacy is correct;
- direct mutation paths remain closed;
- 10,000-Roll creation and matching-retry boundaries are verified;
- permanent Database Quality coverage passes;
- TypeScript/build/types pass;
- implementation-integrity review passes;
- fresh scope/dependency review passes;
- no Cube G/H/Activation/Warranty functionality has leaked into F;
- documentation is current.

Only after Cube F is merged should Cube G start from fresh `main`.

---

## 25. Frozen decisions for implementation

Unless a new Product Decision explicitly changes them, Cube F implementation should use these decisions:

1. separate `roll_transfers`, `roll_transfer_items`, `roll_transfer_reservations`, `roll_transfer_events` model;
2. business Transfer number `PG-T-YYYYMMDD-NNNNNNNN`;
3. Cube F statuses only `pending | cancelled | rejected`;
4. one active reservation row per Roll;
5. Admin acts only as singleton Company in ordinary Transfer party actions;
6. creation RPC accepts exact recipient Transfer ID + explicit Roll ID set;
7. one Transfer may contain 1–10,000 Rolls;
8. request UUID provides safe idempotency only when actor, recipient and complete Roll set match the original request;
9. sender cancellation and recipient rejection are pre-receipt terminal actions;
10. no automatic expiry;
11. active reservation blocks Production Order void;
12. no confirmed custody movement occurs in Cube F;
13. a separate narrow Admin recovery cancellation exists only for suspended-party recovery, requires a reason, and is never party impersonation;
14. all state-changing authorization is revalidated under transactionally compatible lifecycle locks;
15. no sender/recipient UI is introduced until its owning later cube.
