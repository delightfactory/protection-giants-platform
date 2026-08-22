# Cube J — Roll Opening / Claiming

**Status:** Specification candidate for product-owner approval — 2026-08-22  
**Baseline:** `main` at `9c8bbf855eebfebdb985a666a1adbd760f6b6bf8`  
**Depends on:** Product Foundation, Production Order/Lot/Roll Foundation, Center Foundation, Cube D Roll Custody, Cube E contextual Roll QR, Cubes F/G/H Roll Transfer & Receipt.

## 1. Purpose

Cube J closes the operational gap between a Center receiving confirmed custody of a physical Roll and the later installation/warranty lifecycle.

It records one durable business fact:

> an authenticated active installation Center that currently holds an eligible Roll has physically opened/claimed that Roll for installation operations.

Opening is not Warranty Activation and does not imply that installation has completed.

Cube J also prevents a real operational dead end: an opened Roll cannot return to ordinary circulation, but an explicitly authorized Admin or enabled Country Agent can recover physical custody through a narrow audited **Opened Roll Recovery** path without erasing the historical opening.

## 2. Approved product decisions captured by this specification

The following decisions were explicitly approved by the product owner on 2026-08-22 and are normative for Cube J.

### J-D1 — Opening is an irreversible physical fact

A Center cannot undo or delete Roll Opening. The system must never rewrite an opened Roll back into a never-opened state.

An administrative or agent recovery changes confirmed custody only; it does not remove or alter the original Opening record.

### J-D2 — Opened Rolls are excluded from ordinary Transfer

Once a Roll is opened, it cannot be selected or submitted through the ordinary Roll Transfer workflow.

This rule must be enforced by the database mutation path, not only by UI filtering.

### J-D3 — Active Transfer reservation blocks Opening

A Roll with an active row in `roll_transfer_reservations` cannot be opened. The pending physical movement must first be resolved through the existing Transfer lifecycle.

### J-D4 — Opened Roll Recovery is a narrow exception

Opened Roll Recovery exists only to avoid an operational dead end when an opened Roll must be physically returned because of a problem or operational correction.

- Active Protection Giants Admin is always authorized.
- A Country Agent is authorized only when Admin has explicitly enabled the dedicated recovery capability for that Agent and the Roll is within that Agent's permitted network scope.
- Dealer and Center roles never receive this recovery authority.
- Recovery requires a reason and explicit confirmation that the recovering party has physically received the Roll.
- Recovery must reuse the existing Transfer/Custody invariants and audit history; it must not create a second custody engine.

### J-D5 — Recovery is not Opening undo

A recovered Roll remains historically opened. The original Center, opening timestamp and opening actor remain immutable audit evidence.

### J-D6 — Warranty Activation remains separate

Cube J collects no customer, vehicle, VIN, warranty, claim or installation-completion data.

Once a later Warranty Activation exists for a Roll, Opened Roll Recovery must no longer be available; any later return/replacement path belongs to Claims/Replacement. The future Warranty cube must enforce the same invariant when that schema is introduced.

### J-D7 — Pre-install Roll Issue Reporting remains the next separate cube

Cube J intentionally does not build defect/issue reporting. The next lifecycle cube may use an existing Roll Opening as its eligibility gate.

## 3. Existing implementation facts this cube must preserve

### 3.1 Confirmed custody

`roll_custody_current` is the authoritative one-row-per-Roll projection of confirmed physical custody.

`roll_custody_events` is immutable append-only custody history.

Opening must not create a custody event because opening does not itself change physical custody.

### 3.2 Transfer reservations

`roll_transfer_reservations` is the authoritative active Transfer reservation projection.

Pending or partially unresolved Transfer state must remain separate from confirmed custody.

### 3.3 Transfer receipt

Confirmed custody changes are already performed through the Transfer receipt/resolution invariants. Opened Roll Recovery must reuse those locking, reservation release, current-custody update and append-only custody-history semantics rather than mutate custody ad hoc.

### 3.4 QR identity

The existing contextual Roll QR identifies the exact physical Roll from the canonical Roll serial. Cube J reuses this QR in an authenticated workflow; QR possession does not grant authority.

## 4. Bounded scope

Cube J owns:

1. Roll Opening persistence and immutability;
2. Center Opening eligibility and atomic mutation;
3. exact Roll identification through the existing contextual QR/manual serial fallback;
4. opened-state read projection needed by Center/Admin and recovery flows;
5. exclusion of opened Rolls from ordinary Transfer;
6. a dedicated narrow Country-Agent recovery capability controlled by Admin;
7. Opened Roll Recovery using the existing Transfer/Custody foundation;
8. mobile-first Opening and Recovery UX;
9. audit, idempotency, concurrency and regression tests;
10. documentation and future-cube handoff.

Cube J does **not** own:

- Pre-install Roll Issue Reporting;
- defect review or evidence upload;
- customer or vehicle records;
- VIN;
- Warranty Activation;
- warranty public URL/token/QR;
- customer claims;
- replacement/reinstall lifecycle;
- metre/area consumption tracking;
- accounting or inventory valuation;
- remaining Production label package (Cube I);
- generic RBAC/permission engine.

## 5. Roll lifecycle model introduced by Cube J

Cube J introduces a deliberately small usage lifecycle independent from custody.

For first-release Opening semantics a physical Roll has only two relevant usage facts:

- **unopened** — no Opening record exists;
- **opened** — one immutable Opening record exists.

There is no `closed_again`, `unopened_again`, `cancelled_opening`, or editable Opening state.

Custody remains a separate axis. Therefore valid examples include:

- unopened + Center custody;
- opened + same Center custody;
- opened + Country Agent custody after authorized recovery;
- opened + Company custody after authorized recovery.

The last two states do not make the Roll unopened again.

## 6. Persistence contract

### 6.1 `roll_openings`

Implementation should introduce one narrow table rather than a generic workflow/event subsystem.

Required business shape:

```text
roll_openings
- roll_id                  UUID PRIMARY KEY -> rolls.id
- request_id               UUID NOT NULL UNIQUE
- opened_by_profile_id     UUID NOT NULL -> profiles.id
- opened_by_center_party_id UUID NOT NULL -> operational_parties.id
- opened_at                TIMESTAMPTZ NOT NULL
- created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
```

Rules:

- exactly zero or one Opening row per Roll;
- `opened_by_center_party_id` must represent the Center that held confirmed custody at the atomic Opening transition;
- rows are immutable after insertion, including under service-role Data API access or accidental privileged update/delete;
- direct client insert/update/delete is denied;
- Opening is created only through the controlled RPC/service mutation;
- `request_id` provides retry/idempotency protection.

No editable `status` column is required because Opening has no reversal transition.

### 6.2 Dedicated Agent recovery capability

Do **not** build a generic permission system for this cube.

Add one narrow Admin-managed capability to the Country Agent operational entity, logically:

```text
country_agents.opened_roll_recovery_enabled BOOLEAN NOT NULL DEFAULT false
```

Semantics:

- Admin does not depend on this flag;
- an Agent-role caller must be active, bound to the active Country Agent, and the flag must be true;
- Admin alone may change the flag;
- the flag grants only Opened Roll Recovery and no other administrative power;
- suspension of the Agent or Agent user immediately makes the capability unusable.

### 6.3 Recovery representation inside the existing Transfer domain

Opened Roll Recovery must be distinguishable from ordinary sender-created Transfer while reusing the same transfer/custody evidence.

Extend `roll_transfers` with a narrow immutable kind discriminator:

```text
transfer_kind TEXT NOT NULL DEFAULT 'standard'
allowed: 'standard', 'opened_roll_recovery'
```

All historical/existing Transfers become `standard` with no behavior change.

Ordinary Transfer APIs continue to create only `standard` Transfers.

A dedicated recovery mutation creates `opened_roll_recovery` only.

Recovery is first-release **single-Roll** to keep the exception explicit and auditable. Batch recovery is not required.

## 7. Center Opening eligibility

The Opening mutation must fail closed unless all conditions are true in one transaction:

1. caller is authenticated;
2. caller Profile is `active`;
3. caller role is `center`;
4. caller is bound to an existing active Installation Center;
5. the corresponding current Operational Party is the same Center;
6. the Roll exists;
7. the Roll's parent Production Order remains operationally generated/non-voided;
8. `roll_custody_current.custodian_party_id` equals the caller's Center party;
9. no active `roll_transfer_reservations` row exists for the Roll;
10. no `roll_openings` row already exists for the Roll.

Protection Giants network approval is deliberately **not** an Opening gate.

Possession of the Roll QR is deliberately **not** an Opening gate by itself.

## 8. Atomic Opening mutation

Public contract, naming may be adjusted only for repository consistency:

```text
open_roll(p_request_id UUID, p_roll_serial TEXT) -> Opening result
```

The mutation must:

1. normalize/resolve the canonical Roll serial using the existing exact Roll identity rules;
2. lock the actor Profile and Center lifecycle against concurrent suspension/binding changes;
3. lock the physical Roll / relevant Production Order row as needed;
4. lock current custody and reservation eligibility deterministically;
5. reject active reservation;
6. reject non-current-custodian Center;
7. reject voided/ineligible Production state;
8. reject already-opened Roll unless this is the exact same idempotent request;
9. insert one immutable Opening record;
10. return a safe minimal result for the UI.

### 8.1 Idempotency

The same `request_id` retried by the same actor for the same Roll must return the existing successful Opening result.

Reusing the same `request_id` for a different Roll or incompatible actor/payload must fail with a deterministic request-conflict error.

A different request against an already-opened Roll must return an explicit `already_opened` business result/error and must not create a second record.

## 9. Ordinary Transfer hardening

Cube J must update **database-side** ordinary Transfer eligibility.

`create_roll_transfer` must reject any selected Roll that already has a `roll_openings` record.

The Transfer Send inventory/read projections should also exclude opened Rolls from selectable inventory and, where useful, report why an exact scanned opened Roll is not eligible.

This hardening must not change historical Transfers already completed before the Opening feature exists.

The Opening/Transfer race must be serialized so two concurrent requests cannot produce both:

- a successful Opening; and
- a new active standard Transfer reservation

for the same Roll.

Exactly one must win; the other must fail with a deterministic eligibility conflict.

## 10. Opened Roll Recovery

### 10.1 Purpose

Recovery is used only after the physical Roll has actually been handed back to the authorized recovering authority.

It is not a remote administrative reassignment button.

The confirmation UI must communicate that confirmed custody will move immediately because the operator is confirming physical receipt.

### 10.2 Authorized destination

For first release:

- Admin recovery moves the Roll to the singleton Company Operational Party;
- enabled Country Agent recovery moves the Roll to that caller's own Country Agent Operational Party.

No arbitrary destination chooser is required.

This keeps the exception bounded while covering the operational return path:

`Center -> responsible Agent -> Company`

Admin may also recover directly:

`Center -> Company`

An Admin may recover an opened Roll currently held by an Agent to Company.

### 10.3 Agent network scope

An enabled Agent may recover only an opened Roll whose current custody is a Center belonging to that Agent's network.

A Center belongs to an Agent's network when either:

- `installation_centers.country_agent_id` equals the Agent; or
- the Center belongs to a Dealer whose `dealers.country_agent_id` equals the Agent.

The Agent cannot recover another Agent's Center Roll.

The Agent cannot use this capability as cross-network custody reassignment.

### 10.4 Recovery preconditions

Recovery must fail unless:

1. caller is an active Admin or an active enabled Agent;
2. Roll exists and has an immutable Opening record;
3. Roll's parent Production Order remains non-voided/eligible;
4. current custody exists and is not already the recovery destination;
5. no active standard/recovery reservation exists for the Roll;
6. Agent scope is valid when actor is Agent;
7. non-empty recovery reason is supplied, trimmed length 5–500 characters;
8. caller explicitly confirms physical possession/receipt;
9. no Warranty Activation exists for the Roll once that later domain is available.

### 10.5 Recovery mutation semantics

Logical public contract:

```text
recover_opened_roll(
  p_request_id UUID,
  p_roll_serial TEXT,
  p_reason TEXT,
  p_confirm_physical_receipt BOOLEAN
) -> recovery result
```

The implementation must reuse the Transfer/Custody foundation in one atomic transaction:

1. resolve and lock actor context;
2. resolve/lock the exact Roll and current custody;
3. validate immutable Opening;
4. validate authorization/scope/capability;
5. validate no active reservation;
6. create one `opened_roll_recovery` Transfer with current custodian as sender and the authorized recovery party as recipient;
7. create the one immutable Transfer item and its normal item state;
8. use the existing reservation/receipt/custody invariants internally so confirmed custody changes exactly once;
9. finish the recovery Transfer terminally as received in the same successful transaction;
10. append the normal immutable confirmed custody event linked to the recovery Transfer;
11. preserve the original `roll_openings` row unchanged;
12. record the recovery reason and actor in immutable Transfer audit evidence;
13. leave no active Transfer reservation after commit.

There is no user-visible pending Recovery queue in Cube J. If the transaction fails, custody does not move.

### 10.6 Recovery idempotency

Retry with the same request ID and same payload returns the same completed recovery.

Request-ID reuse with a different Roll/reason/actor must fail deterministically.

A repeated new recovery request after custody has already moved to the same destination is not silently treated as a new custody event.

## 11. Read and privacy model

### Center

An active Center can:

- resolve a Roll it is currently allowed to attempt to open;
- view the Opening result/fact for Rolls it opened when needed for its operational flow;
- never browse other parties' custody or Opening history.

### Admin

An active Admin can read all Roll Openings and recover eligible opened Rolls.

### Agent

An active Agent may resolve an exact scanned/entered opened Roll for recovery only within its network scope. Recovery detail exposure must be the minimum needed to confirm the correct Roll/Center/Product.

Do not introduce a global opened-Roll directory for ordinary operational users.

## 12. Service/application layer

Cube J must expose named business functions rather than scatter eligibility checks through pages/components.

Expected service responsibilities:

- parse/normalize contextual QR or manual Roll serial;
- load Opening candidate summary;
- map deterministic database business errors to Arabic UX messages;
- execute idempotent Opening;
- load Recovery candidate summary for authorized Admin/Agent;
- execute idempotent Recovery;
- manage Admin toggle for Agent recovery capability;
- revalidate affected Roll/Transfer inventory surfaces after success.

Business authorization remains database-enforced even if the server layer performs earlier UX validation.

## 13. UX contract — Center Roll Opening

Phone-first is mandatory.

### Entry

Center operations must have a clear action such as **فتح رول**.

Primary identification:

- scan existing Roll QR with device camera.

Fallback:

- exact canonical Roll serial entry/paste.

No free-text fuzzy Roll search is required.

### Pre-confirmation card

After successful identification show only useful confirmation data:

- Product name / SKU;
- Roll serial;
- Lot where useful;
- current Center identity;
- concise statement that Opening is permanent and separate from Warranty Activation.

If ineligible, show the real reason before allowing confirmation.

### Confirmation

Use an explicit action such as **تأكيد فتح الرول**.

The UI must not present an Undo action after success.

### Success

Show:

- Roll opened successfully;
- Roll serial/Product;
- Opening time;
- next operational guidance: if a physical/manufacturing problem is found, use the future Pre-install Issue flow; Warranty Activation remains a later step.

Do not present unimplemented issue/activation buttons as if they currently work.

## 14. UX contract — Opened Roll Recovery

### Admin

Admin can access Recovery from exact Roll detail/scan context.

### Agent

The Recovery action is absent/disabled unless the Agent entity's dedicated capability is enabled.

### Confirmation content

Show:

- Roll serial/Product;
- original Opening Center;
- current custodian;
- recovery destination (Company or this Country Agent);
- permanent note that Opening history remains;
- required reason field;
- explicit physical-receipt confirmation.

Primary action should communicate actual effect, e.g. **تأكيد استلام الرول واسترجاع الحيازة**.

No generic "change owner" control is permitted.

## 15. Admin capability management UX

The existing Admin Agent-management surface should expose one narrow setting:

**السماح باسترجاع الرولات المفتوحة**

Default: off.

The UI must explain that this grants the Agent authority only to recover physically returned opened Rolls inside its network and does not grant general Admin/Transfer impersonation.

Changing the flag must follow existing Admin authorization and lifecycle patterns.

## 16. Deterministic business error families

Exact database identifiers may follow repository naming style, but the implementation must distinguish at least:

- unauthenticated;
- inactive actor;
- role not allowed;
- Center binding/entity missing;
- Roll not found;
- Production Order ineligible/voided;
- not current custodian;
- Roll reserved in active Transfer;
- Roll already opened;
- request id conflict;
- Recovery permission disabled;
- Recovery out of Agent network scope;
- Recovery destination already owns custody;
- Recovery reason invalid;
- physical receipt not confirmed;
- Recovery blocked by later Warranty Activation.

UI must not reduce all failures to a generic unknown error.

## 17. Concurrency requirements

Database mutations must be safe under at least these races:

1. Opening vs standard Transfer creation for the same Roll;
2. duplicate Opening from two tabs/devices;
3. Center suspension while Opening is running;
4. custody change vs Opening;
5. Recovery vs standard Transfer/other Recovery;
6. Agent capability disable/suspension while Recovery is running;
7. Admin and Agent simultaneous Recovery attempt;
8. retry after client/network interruption.

No successful transaction may leave contradictory current custody, duplicate Opening, duplicate custody event, or active reservation for a terminal Recovery.

## 18. Database security requirements

- RLS enabled on all new public tables;
- no direct authenticated mutation grants for Opening/Recovery state;
- no direct service-role Data API mutation bypass for immutable audit rows;
- Security Definer functions use `set search_path = ''` and fully qualified references;
- public RPC grants are explicit;
- helper functions remain private unless a public contract is genuinely required;
- immutable identity/history triggers cover accidental privileged update/delete;
- exact Agent scope is revalidated inside mutation transaction;
- ordinary Transfer APIs cannot set `transfer_kind = 'opened_roll_recovery'`.

## 19. Test contract

### Database regression

Must prove:

- eligible Center can open its own unreserved Roll;
- other Center cannot open it;
- Dealer/Agent/Admin cannot use the Center Opening RPC;
- unapproved-but-active Center can open when all other conditions pass;
- suspended Center/profile cannot open;
- voided/ineligible Production Roll cannot open;
- reserved Roll cannot open;
- duplicate retry is idempotent;
- second independent Opening fails;
- Opening rows cannot be updated/deleted;
- standard Transfer creation rejects opened Roll;
- Opening-vs-Transfer race never succeeds both ways;
- Admin can recover an eligible opened Roll to Company;
- Agent recovery fails by default;
- enabled responsible Agent can recover an eligible network Roll;
- enabled wrong Agent cannot recover it;
- recovery requires reason + physical-receipt confirmation;
- recovery creates exactly one additional custody event;
- recovery leaves original Opening unchanged;
- recovery leaves no active reservation;
- recovery retry is idempotent;
- ordinary Transfer behavior for unopened Rolls remains green;
- existing receipt/partial-receipt/resolution tests remain green.

### Application/component

Must cover:

- QR/manual Roll identification;
- eligibility/error rendering;
- permanent-opening warning;
- success state;
- no Undo control;
- Agent capability-gated recovery surface;
- recovery reason/confirmation validation;
- mobile camera interruption/fallback behavior;
- safe retry after request interruption.

### Build/quality

Before Cube J implementation is considered complete:

- TypeScript passes;
- lint/quality checks pass;
- production Next build passes;
- Database Quality passes from reset/migrations;
- relevant F/G/H Transfer regression suite passes;
- phone viewport smoke passes;
- real phone camera scan of the existing Roll QR reaches the Opening identification flow successfully.

## 20. Definition of Done

Cube J is Done only when:

1. `roll_openings` is real, immutable and secure;
2. Center Opening is atomic, idempotent and concurrency-safe;
3. active Transfer reservation blocks Opening;
4. opened Roll is excluded from ordinary Transfer at DB and UX levels;
5. Admin recovery works and preserves Opening history;
6. Agent recovery is explicit, default-off, Admin-controlled and network-scoped;
7. Recovery reuses Transfer/Custody invariants and leaves truthful immutable audit evidence;
8. Recovery cannot create a duplicate/current-custody contradiction;
9. Center/Admin/Agent UX is phone-usable with real failure states;
10. tests and existing Transfer regressions are green;
11. documentation is reconciled to mark Cube J implemented;
12. Pre-install Issue Reporting remains clearly deferred to the next cube.

## 21. Implementation sequence after this spec is approved

Implement in small increments from fresh `main`:

1. Opening schema + immutability + read security;
2. Opening RPC + concurrency/idempotency tests;
3. standard Transfer opened-Roll guard + regression tests;
4. Center Opening service/UI + QR/manual identification;
5. Agent recovery capability + Admin management control;
6. Recovery Transfer subtype + atomic recovery mutation;
7. Recovery Admin/Agent UI;
8. integrated Database/Transfer/build/mobile tests;
9. canonical documentation closure.

Do not begin Cube K Pre-install Roll Issue Reporting inside the Cube J implementation branch.
