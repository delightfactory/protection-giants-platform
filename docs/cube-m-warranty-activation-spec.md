# Cube M — Warranty Activation

**Status:** Specification candidate for Product Owner approval — 2026-08-24  
**Baseline:** `main` at `31b8f6321c5d0a9b51aab29147345d96410eaf81`  
**Depends on:** Product Foundation, Production Order/Lot/Roll Foundation, confirmed Roll Custody, completed Transfer stage, Cube J Roll Opening / Claiming, Cube K Pre-install Roll Issue Reporting, and the existing authentication/operational-party foundation.  
**Consumes but does not redefine:** Cube L Notifications/PWA infrastructure.

---

## 1. Purpose

Cube M creates the first real customer Warranty from one legitimately opened physical PPF Roll.

It records one durable business fact:

> an authenticated active Installation Center that currently holds an eligible opened Roll has activated the customer Warranty for that Roll using the customer, vehicle and Product warranty-policy data valid at the atomic activation transition.

Warranty Activation is the transition from the pre-install operational Roll lifecycle into the customer Warranty lifecycle.

It is **not** Roll Opening, custody movement, Pre-install Issue resolution, public Warranty access, QR printing, Claims, replacement/reinstall, customer-account management, accounting, invoicing, or a generic CRM/customer database.

The cube must close the activation lifecycle completely enough that the Center and Protection Giants Admin can activate, find, inspect and safely correct a genuine data-entry mistake without creating an unauditable or unrecoverable state.

---

## 2. Approved project rules inherited by Cube M

Cube M must preserve these already-approved rules without reopening their owning cubes:

1. one physical PPF Roll can create at most one **effective customer Warranty**;
2. Roll Opening and Warranty Activation are separate events;
3. normal activation requires customer and vehicle data including VIN/chassis identity;
4. customer account, OTP, photos, videos and invoice upload are not mandatory in V1;
5. Protection Giants network approval is **not** an Activation gate;
6. the activating Center must be operationally active and the confirmed current custodian of the Roll;
7. the parent Production Order must remain operationally generated/non-voided;
8. a valid immutable Cube J Opening must already exist;
9. Cube K `submitted` Pre-install Issue state immediately blocks Activation;
10. any historical Cube K `return_required` outcome blocks Activation;
11. `cleared_for_use` and `reported_in_error` do not themselves block later Activation;
12. the Product warranty policy must be snapshotted at Warranty creation so later Product edits never rewrite historical Warranty terms;
13. customer public access and Warranty QR strategy remain a later cube;
14. an Activation/Warranty identifier must not reuse Product SKU, Roll serial, ERP serial or Transfer ID.

---

## 3. Cube M product decisions

### M-D1 — Activation creates the Warranty; no second Activation workflow object in V1

V1 does not create a generic activation-workflow engine or a separate mutable activation record.

The successful atomic Activation mutation creates one `warranties` business record. That record is the durable result of Activation.

The Warranty receives a stable human-readable **Activation Code** at creation time. The code is owned by the Warranty record and is an operational/customer reference only.

The Activation Code:

- is generated only after all activation eligibility checks pass inside the transaction;
- is globally unique and never reused, including after an administrative `voided_in_error` correction;
- is not a password, OTP or authorization secret;
- must not be used later as the public Warranty security credential;
- must not be substituted with Roll serial, ERP serial, SKU or Transfer ID.

Recommended V1 format:

`PG-A-YYYYMMDD-########`

using a database sequence with a permanently reserved value once allocated.

The later Public Warranty cube owns the separate anti-enumeration public token/URL.

### M-D2 — One Roll has at most one effective issued Warranty

The ordinary rule is one PPF Roll -> one customer Warranty.

Database uniqueness must guarantee that a Roll cannot have two simultaneously effective `issued` Warranty records.

A narrow Admin-only `voided_in_error` correction exists only for a demonstrably mistaken activation. A voided-in-error record is preserved as historical evidence and is not treated as an effective customer Warranty.

After such a correction, the Roll may be activated again **only** if every current Activation eligibility rule is revalidated and no effective issued Warranty exists.

This exception is an audit correction, not a second-Warranty entitlement and not a replacement/reinstall workflow.

### M-D3 — Warranty term starts at successful Activation time in V1

V1 deliberately avoids backdating, editable installation-time arithmetic and timezone-dependent calendar ambiguity.

The Warranty term starts at the authoritative database `activated_at` timestamp produced by the successful Activation transaction.

`coverage_expires_at` is derived atomically from:

- `activated_at`; and
- the snapshotted `default_warranty_months` Product policy value.

No maximum delay between Roll Opening and Warranty Activation is introduced in V1.

A late Activation therefore begins its contractual term when the platform successfully creates the Warranty. If the business later requires installation-date backdating, it must be a new explicit Product Decision rather than an implicit UI field.

### M-D4 — Warranty policy is snapshotted from Product at Activation time

The Warranty must snapshot, at minimum:

- warranty duration in months;
- customer-facing warranty coverage text;
- customer-facing care instructions.

The Product row must be read consistently while the Activation transaction is being finalized so a concurrent Product edit cannot produce a mixed snapshot.

The Product does **not** need to remain currently published or active merely because an already-produced legitimate Roll is being activated. Archiving a Product must not strand historical physical Rolls.

However, Activation must fail closed when the applicable warranty policy is incomplete, for example missing/blank coverage or care terms. Product warranty content remains administratively editable even after production, so this is a recoverable configuration condition rather than a dead end.

### M-D5 — Customer data is a Warranty snapshot, not a Customer-account subsystem

V1 stores the customer data required to administer the Warranty directly on the Warranty record.

Required:

- customer full name;
- customer phone.

Optional:

- customer email.

Do not create a generic `customers` table, deduplication engine, login identity, customer CRM profile or account merely for this cube.

One person may legitimately own multiple separate Warranties on different Rolls/vehicles.

### M-D6 — Vehicle data is a Warranty snapshot

Required:

- vehicle make;
- vehicle model;
- VIN/chassis identifier.

Optional:

- model year;
- plate number;
- vehicle color.

Do not impose VIN uniqueness across Warranties: one vehicle may legitimately have more than one independently warranted Roll/product installation if later approved physical use requires it.

For V1 the VIN/chassis field should be normalized to uppercase and validated conservatively rather than enforcing only the modern 17-character VIN form. The platform serves imported and regional vehicles and must not create an avoidable operational dead end for a legitimate chassis identifier.

Recommended persisted contract:

- 6–40 uppercase ASCII letters/digits;
- no whitespace;
- no use as an authentication secret.

### M-D7 — No evidence/OTP/invoice requirement for normal Activation

Normal Activation must not require:

- photo evidence;
- video;
- invoice upload;
- customer OTP;
- customer login/account;
- payment/accounting record.

Pre-install evidence remains owned by Cube K.

### M-D8 — Core issuance identity is immutable; support corrections are narrow and audited

After successful Activation, the Center cannot edit or delete the Warranty.

Immutable core fields include:

- Roll identity;
- Activation Code;
- activating Center party;
- activation actor;
- activation timestamp;
- Product identity snapshot;
- warranty-policy snapshot;
- coverage start/expiry timestamps.

Protection Giants Admin receives two narrow support paths:

1. **correct customer/vehicle details** — for genuine data-entry correction only, with mandatory reason and immutable event evidence;
2. **void activation recorded in error** — for a wrong-Roll/false activation, with mandatory reason and immutable event evidence.

Direct browser table update/delete remains denied.

### M-D9 — Later lifecycle changes do not silently rewrite customer coverage

After a Warranty is issued:

- Center network approval change does not invalidate it;
- Center location change does not invalidate it;
- later Center suspension does not silently cancel the customer's Warranty;
- Product archive/edit does not rewrite the snapshotted policy;
- custody state is not changed by Activation;
- Roll Opening remains immutable;
- the Warranty remains the historical customer entitlement record until a later explicitly approved Claims/Replacement lifecycle says otherwise.

### M-D10 — Normal self-success does not create notification noise

Successful Activation is immediately visible to the acting Center and does not require a Push notification back to the same actor.

Cube M may use the existing Cube L infrastructure only for materially useful asynchronous events, specifically:

- Admin customer/vehicle correction -> informational Inbox notification to active Profiles of the activating Center;
- Admin `voided_in_error` -> warning/action-relevant Inbox notification to active Profiles of the activating Center.

Push remains best-effort transport and can never affect Warranty state.

---

## 4. Bounded scope

Cube M owns:

1. Warranty persistence and Activation Code allocation;
2. one-effective-Warranty-per-Roll invariant;
3. customer and vehicle snapshot data;
4. Product warranty-policy snapshot;
5. Center Activation candidate resolver;
6. atomic Center Activation mutation;
7. Cube J/Cube K reverse guards needed once Warranty state exists;
8. Admin-only customer/vehicle correction;
9. Admin-only `voided_in_error` correction;
10. Center/Admin Warranty list/detail reads;
11. mobile-first Center Activation UX;
12. Admin correction/void support UX;
13. deterministic domain errors;
14. RLS/privacy/security;
15. idempotency/concurrency tests;
16. bounded Cube L notification materialization for Admin corrections;
17. documentation and handoff to Public Warranty.

Cube M does **not** own:

- public Warranty URL/token/verification;
- vehicle/Warranty-card/invoice QR generation;
- printing of customer Warranty labels;
- Cube I remaining Production labels;
- customer account/login;
- Claims;
- replacement/reinstall;
- post-install defect adjudication;
- refund/payment/accounting;
- editable Warranty policy/version engine;
- generic customer/vehicle master-data system;
- SMS/email/WhatsApp delivery;
- generic workflow or permission engine.

---

## 5. Warranty lifecycle model

Separate **record state** from time-derived coverage state.

### 5.1 Record state

V1 persisted record state:

- `issued` — effective customer Warranty record;
- `voided_in_error` — Admin correction proving this activation was recorded in error.

There is no ordinary Center cancel/revoke/undo.

### 5.2 Time-derived presentation state

For an `issued` record:

- `active` while the authoritative current time is before `coverage_expires_at`;
- `expired` once the term has elapsed.

Do not run cron jobs merely to rewrite `active -> expired`. Expiry is derived from immutable term timestamps.

A `voided_in_error` record always presents as voided regardless of time.

Future Claims may introduce additional customer-service states, but Cube M must not invent them now.

---

## 6. Persistence contract

### 6.1 `warranties`

Use one narrow customer-Warranty table.

Conceptual shape:

```text
warranties
- id                         UUID PRIMARY KEY
- request_id                 UUID NOT NULL UNIQUE
- roll_id                    UUID NOT NULL -> rolls.id
- activation_code            TEXT NOT NULL UNIQUE
- record_state               TEXT NOT NULL DEFAULT 'issued'

- activated_by_profile_id    UUID NOT NULL -> profiles.id
- activating_center_party_id UUID NOT NULL -> operational_parties.id
- activated_at               TIMESTAMPTZ NOT NULL
- coverage_expires_at        TIMESTAMPTZ NOT NULL

- product_id                 UUID NOT NULL -> products.id
- product_code_snapshot      TEXT NOT NULL
- product_name_snapshot      TEXT NOT NULL
- product_version_snapshot   TEXT NULL
- warranty_months_snapshot   SMALLINT NOT NULL
- warranty_coverage_snapshot TEXT NOT NULL
- care_instructions_snapshot TEXT NOT NULL

- customer_name              TEXT NOT NULL
- customer_phone             TEXT NOT NULL
- customer_email             TEXT NULL

- vehicle_make               TEXT NOT NULL
- vehicle_model              TEXT NOT NULL
- vehicle_year               SMALLINT NULL
- vehicle_plate              TEXT NULL
- vehicle_color              TEXT NULL
- vehicle_vin                TEXT NOT NULL

- voided_by_profile_id       UUID NULL -> profiles.id
- void_reason                TEXT NULL
- voided_at                  TIMESTAMPTZ NULL

- created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
```

Required constraints:

- `record_state in ('issued', 'voided_in_error')`;
- void metadata is all-null for `issued` and complete for `voided_in_error`;
- duration snapshot remains inside the existing Product warranty-duration boundary;
- policy snapshot text is nonblank and bounded;
- customer/vehicle text fields are normalized/bounded;
- vehicle year, when present, is within a conservative supported range;
- VIN/chassis contract from M-D6;
- `coverage_expires_at > activated_at`;
- Activation Code canonical format;
- no update/delete through direct client paths.

One-effective-Warranty rule:

```text
UNIQUE (roll_id) WHERE record_state = 'issued'
```

A historical `voided_in_error` row remains permanently retained and does not release its Activation Code.

### 6.2 `warranty_events`

Use one bounded immutable event table for audit/support history.

Conceptual shape:

```text
warranty_events
- id                UUID PRIMARY KEY
- warranty_id       UUID NOT NULL -> warranties.id
- action_request_id UUID NOT NULL UNIQUE
- event_kind        TEXT NOT NULL
- actor_profile_id  UUID NOT NULL -> profiles.id
- reason            TEXT NULL
- change_snapshot   JSONB NULL
- created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

Allowed V1 events:

- `activated`;
- `details_corrected`;
- `voided_in_error`.

Rules:

- append-only;
- `activated` event created in the same transaction as the Warranty row;
- correction/void reason required and bounded;
- correction event records only the before/after fields needed to prove the change;
- raw support audit is Admin-visible; Center-facing detail may expose a sanitized timeline without leaking internal support notes.

Do not generalize this into a workflow/event framework.

---

## 7. Activation candidate resolver

Provide one Center-only read contract, conceptually:

```text
resolve_warranty_activation_candidate(p_roll_serial TEXT)
```

It must identify the exact canonical Roll and return only the minimum information needed before the customer form is shown:

- Roll serial;
- Product code/name/version;
- Lot where useful;
- immutable Opening timestamp;
- authenticated Center identity;
- Product warranty duration summary;
- issue/hold eligibility state;
- existing Warranty reference when the same Center is allowed to see it;
- one deterministic eligibility state.

Suggested eligibility states:

- `eligible`;
- `not_opened`;
- `not_current_custodian`;
- `production_invalid`;
- `transfer_reserved`;
- `issue_pending`;
- `return_required`;
- `policy_incomplete`;
- `already_activated`.

The resolver is a preflight convenience only. The mutation revalidates every critical condition atomically.

---

## 8. Center Activation eligibility

The final Activation mutation must fail closed unless, in one transaction:

1. caller is authenticated;
2. caller Profile remains `active`;
3. caller role is `center`;
4. caller is bound to an existing active Installation Center;
5. the corresponding Operational Party is that Center;
6. Roll exists and exact serial identity resolves;
7. parent Production Order remains `generated`;
8. confirmed current custody belongs to that Center party;
9. no active Transfer reservation exists for the Roll;
10. one immutable Cube J Opening exists;
11. no Cube K issue is currently `submitted`;
12. no historical Cube K issue is `return_required`;
13. no effective `issued` Warranty already exists for the Roll;
14. Product warranty duration exists and is valid;
15. Product warranty coverage text is nonblank;
16. Product care instructions are nonblank;
17. customer/vehicle payload passes V1 validation.

Protection Giants network approval, Center public listing, Center location approval badge, Roll QR possession, Roll serial knowledge, Transfer ID or Product publication state are not independent authorization predicates.

---

## 9. Atomic Activation mutation

Public contract, exact name may be adjusted only for repository consistency:

```text
activate_roll_warranty(
  p_request_id UUID,
  p_roll_serial TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT,
  p_vehicle_make TEXT,
  p_vehicle_model TEXT,
  p_vehicle_year SMALLINT,
  p_vehicle_plate TEXT,
  p_vehicle_color TEXT,
  p_vehicle_vin TEXT
) -> warranty result
```

The mutation must:

1. normalize/validate payload;
2. lock/revalidate actor Profile and bound Center lifecycle;
3. obtain request-id idempotency serialization;
4. resolve exact canonical Roll;
5. return the existing result for a matching successful retry;
6. lock the parent Production Order;
7. lock current Roll custody using the same order established by Cubes J/K;
8. revalidate current Center custody and Production state;
9. reject any active Transfer reservation;
10. verify immutable Opening;
11. inspect Cube K issue state under the serialized Roll transition;
12. reject `submitted` and any historical `return_required`;
13. reject an existing effective Warranty;
14. read/lock Product policy consistently so the snapshot cannot mix concurrent Product edits;
15. allocate one Activation Code;
16. insert one `issued` Warranty row with customer/vehicle/policy snapshots;
17. compute `coverage_expires_at` from authoritative activation time + snapshotted months;
18. append one immutable `activated` Warranty event;
19. return a safe minimal Warranty result.

### 9.1 Required lock-order compatibility

Cube K already established the cross-domain physical-Roll order:

`Production Order -> current Roll custody`

Cube M must preserve this order.

This is mandatory so these conflicts have one durable winner:

- Pre-install Issue submission vs Activation;
- opened-Roll Recovery vs Activation;
- Center/entity suspension vs Activation;
- Production invalidation attempts vs Activation;
- two concurrent Activation requests for the same Roll.

Product-policy locking occurs only after the Roll lifecycle locks needed to serialize physical state and must not introduce a reverse lock dependency in Product-edit paths.

---

## 10. Idempotency

A successful matching retry with the same `request_id`, same actor, same Roll and same normalized customer/vehicle payload returns the already-created Warranty.

Reuse of the same request ID with a different Roll, actor or normalized customer/vehicle payload must fail with a deterministic request-conflict error.

A different request against a Roll with an existing effective Warranty must return `already_activated` and never create another record.

If the original Warranty was later Admin-voided-in-error, retrying the **old** request returns/reports the historical original result and must never silently reactivate it. A legitimate reactivation requires a new request ID and complete current eligibility revalidation.

---

## 11. Reverse hardening of Cube K

Once `warranties` exists, Cube K issue creation must add the missing future guard already required by its frozen specification.

After taking the same Production Order -> current custody locks, `create_roll_preinstall_issue(...)` must reject when an effective `issued` Warranty exists for the Roll.

This creates the required serialized result:

- Issue commits first -> Activation sees the hold and fails;
- Activation commits first -> later Issue creation sees the Warranty and fails.

No UI preflight is sufficient by itself.

A `voided_in_error` Warranty does not block a later legitimate Pre-install Issue if every ordinary Cube K eligibility rule still passes.

---

## 12. Reverse hardening of Cube J Opened Roll Recovery

Once an effective Warranty exists, Opened Roll Recovery must be unavailable.

The Recovery candidate/read must expose a deterministic `warranty_activated` ineligibility state.

The Recovery mutation and/or its reservation guard must reject effective issued Warranty state under the established physical-Roll locking boundary.

Reason:

> after customer Warranty Activation, any physical return/replacement/reinstall becomes a later Claims/Replacement responsibility; Cube J Recovery must not move an already-customer-installed Roll back through a pre-Warranty exception path.

A `voided_in_error` activation does not itself block Recovery if every Cube J/K rule otherwise allows Recovery.

Cube M must not implement Claims or replacement merely to enforce this boundary.

---

## 13. Admin correction contract

### 13.1 Customer/vehicle data correction

Provide one narrow Admin-only mutation, conceptually:

```text
correct_warranty_details(
  p_request_id UUID,
  p_warranty_id UUID,
  ...allowed customer/vehicle fields...,
  p_reason TEXT
)
```

It may change only:

- customer name/phone/email;
- vehicle make/model/year/plate/color/VIN.

It must not change:

- Roll;
- Activation Code;
- activating Center;
- activation actor/time;
- Product identity;
- warranty-policy snapshot;
- coverage dates;
- record state.

The mutation is idempotent, requires an active Admin, locks the Warranty row, validates the replacement payload and appends one `details_corrected` event in the same transaction.

Center/Agent/Dealer cannot use this path.

### 13.2 Void activation recorded in error

Provide one narrow Admin-only mutation, conceptually:

```text
void_warranty_in_error(
  p_request_id UUID,
  p_warranty_id UUID,
  p_reason TEXT
)
```

It must:

- require active Admin;
- require current `record_state = 'issued'`;
- require an explicit bounded reason;
- transition only to `voided_in_error`;
- persist actor/time/reason;
- append one matching immutable event;
- never delete/reuse the Activation Code;
- never alter Opening, custody or Cube K history.

There is no generic Undo or restore-to-issued action.

If a replacement Warranty is genuinely required after this correction, the Center starts a new Activation request and the ordinary eligibility engine decides whether the Roll can be activated.

The future Claims cube must later harden this support action when Claim records exist; Cube M does not invent placeholder Claim checks before that schema exists.

---

## 14. Read/privacy model

### Center

An active Center Profile may:

- resolve Activation candidates only against its current custody boundary;
- activate eligible Rolls it currently holds;
- list/read Warranties activated by its Center party;
- keep historical read access to those Warranty records while the Center remains operationally active, even if a future approved lifecycle later changes physical custody;
- not edit/void Warranty records.

### Admin / Company

Active Admin may:

- list/read all Warranties;
- search exact Activation Code/Roll/VIN/customer phone through bounded read projections;
- perform the two explicit support corrections;
- read full audit history.

### Agent / Dealer

Cube M grants no customer-Warranty PII access to Agent or Dealer roles in V1.

Hierarchy membership alone is not a reason to expose customer name, phone, VIN or Warranty details.

### Public / anon

No direct Warranty table access and no public lookup are introduced in Cube M.

The later Public Warranty cube must expose only an approved public projection through a separate secure token/URL contract.

### Data API

Critical writes remain RPC-only. Direct INSERT/UPDATE/DELETE for ordinary browser roles are denied. Service-role Data API exposure must remain explicitly bounded under the repository's existing grant discipline.

---

## 15. Internal Warranty registry/detail UX

Routes may follow repository conventions, recommended:

- `/operations/warranties`;
- `/operations/warranties/activate`;
- `/operations/warranties/[id]`.

### Center registry

Mobile-first cards, newest first, paginated.

Show only operationally useful data:

- Activation Code;
- customer name;
- vehicle make/model;
- VIN/chassis identifier;
- Product;
- Roll serial;
- activation time;
- derived active/expired/voided state.

Search should support exact/controlled matching without loading an unbounded customer directory.

### Admin registry

Admin may use the same registry with broader search and status filter plus access to support actions from detail.

No wide-table dependency on phone.

---

## 16. Center Activation UX

The flow is a focused operational task, not a generic admin form.

### Stage 1 — Identify Roll

Reuse the existing contextual Roll QR scanner and manual serial fallback.

Do not create another scanner or QR parser.

### Stage 2 — Eligibility result

Show:

- authenticated Center name;
- Product;
- Roll serial;
- Opening timestamp;
- warranty duration summary;
- any blocking issue state.

If blocked, explain the exact recoverable next action where one exists.

Examples:

- issue pending -> wait for Protection Giants review and link to the Center's issue detail when visible;
- policy incomplete -> contact Protection Giants/Admin to complete Product warranty terms;
- already activated -> open existing Warranty when visible;
- return required -> Activation unavailable; follow the already-approved return/recovery path.

Do not offer fake controls that cannot resolve the state.

### Stage 3 — Customer and vehicle data

Collect only M-D5/M-D6 fields.

Use mobile keyboard/input modes appropriately for phone/email/year/VIN.

No evidence upload section.

### Stage 4 — Review and irreversible confirmation

Before mutation show one clear review containing:

- acting Center;
- Product + Roll identity;
- customer;
- vehicle + VIN/chassis;
- warranty duration;
- clear statement that this creates the customer Warranty for this Roll and ordinary Center Undo is not available.

The final CTA should be explicit, for example:

`تأكيد تفعيل ضمان العميل`

### Stage 5 — Success

Show:

- success state;
- Activation Code;
- customer/vehicle summary;
- Product/Roll;
- activation timestamp;
- coverage expiry;
- snapshotted coverage/care summary or link within the internal Warranty detail.

Do **not** show placeholder customer QR/print controls before the Public Warranty/QR cube exists.

The Center can immediately open the internal Warranty detail or activate another eligible Roll.

---

## 17. Admin support UX

Warranty detail must separate ordinary read from exceptional support actions.

### Correct details

- explicit Admin-only action;
- show current values;
- edit only approved customer/vehicle fields;
- reason required;
- confirmation before mutation;
- success returns to detail with audit marker.

### Void in error

Use destructive visual treatment and explicit consequence text:

- this does not delete history;
- current Warranty will cease to be effective;
- Activation Code remains reserved;
- Roll is not automatically reactivated, transferred or recovered;
- any later Activation must independently pass current eligibility.

Require reason + explicit confirmation.

No Center-facing Undo button.

---

## 18. Deterministic business errors

Provide stable service codes for at least:

- `PG_WARRANTY_REQUEST_ID_REQUIRED`;
- `PG_WARRANTY_REQUEST_CONFLICT`;
- `PG_WARRANTY_CENTER_REQUIRED`;
- `PG_WARRANTY_CENTER_INACTIVE`;
- `PG_WARRANTY_SERIAL_INVALID`;
- `PG_WARRANTY_ROLL_NOT_FOUND`;
- `PG_WARRANTY_PRODUCTION_INVALID`;
- `PG_WARRANTY_CUSTODY_MISSING`;
- `PG_WARRANTY_NOT_CURRENT_CUSTODIAN`;
- `PG_WARRANTY_TRANSFER_RESERVED`;
- `PG_WARRANTY_ROLL_NOT_OPENED`;
- `PG_WARRANTY_ISSUE_PENDING`;
- `PG_WARRANTY_RETURN_REQUIRED`;
- `PG_WARRANTY_ALREADY_ACTIVATED`;
- `PG_WARRANTY_POLICY_INCOMPLETE`;
- `PG_WARRANTY_CUSTOMER_INVALID`;
- `PG_WARRANTY_VEHICLE_INVALID`;
- `PG_WARRANTY_ADMIN_REQUIRED`;
- `PG_WARRANTY_NOT_FOUND`;
- `PG_WARRANTY_DETAILS_INVALID`;
- `PG_WARRANTY_CORRECTION_REASON_INVALID`;
- `PG_WARRANTY_ALREADY_VOIDED`.

UI maps these to concise Arabic operational messages and never exposes arbitrary PostgreSQL/internal exceptions.

---

## 19. Concurrency and permanent Database Quality contract

Permanent tests must cover at least:

### Basic issuance

1. valid active Center activates an opened Roll it currently holds;
2. unapproved Center remains eligible when all operational rules pass;
3. wrong Center/current custody is rejected;
4. inactive Profile or suspended Center is rejected;
5. unopened Roll is rejected;
6. voided/ineligible Production is rejected;
7. active reservation is rejected;
8. Product archived/unpublished after legitimate production does not itself strand activation;
9. incomplete warranty policy is rejected with recoverable error.

### Cube K integration

10. `submitted` issue blocks Activation;
11. historical `return_required` blocks Activation;
12. `cleared_for_use` permits Activation when other rules pass;
13. `reported_in_error` permits Activation when other rules pass;
14. Activation vs Issue submission race serializes to exactly one valid winner;
15. after effective Activation, new Pre-install Issue creation is rejected;
16. after Admin void-in-error, a later issue may be created only if ordinary Cube K rules pass.

### Cube J integration

17. effective Activation blocks Opened Roll Recovery;
18. Activation vs Recovery race serializes to one valid winner;
19. Admin void-in-error removes only the Warranty-specific Recovery block and does not bypass any other J/K rule.

### One-Warranty/idempotency

20. one Roll cannot have two effective issued Warranties;
21. same request + same normalized payload returns same Warranty;
22. same request + changed Roll/payload/actor conflicts;
23. two different concurrent requests for one Roll produce one issued Warranty only;
24. old request retry after void does not resurrect or create a new Warranty;
25. new request after void can succeed only after full revalidation.

### Snapshot integrity

26. duration/coverage/care snapshot equals one consistent Product policy version at the atomic transition;
27. concurrent Product policy edit cannot create a mixed snapshot;
28. later Product edits do not change historical Warranty snapshot;
29. later Product archive does not invalidate an already-issued Warranty;
30. activation/expiry arithmetic uses the snapshotted duration and authoritative activation timestamp.

### Support corrections

31. Admin may correct only customer/vehicle fields with reason;
32. Center/Agent/Dealer cannot correct;
33. immutable core fields cannot be changed through correction;
34. correction appends one event and is idempotent;
35. Admin void is one-way, audited and idempotent;
36. direct update/delete is denied;
37. Activation Code is never reused after void.

### Privacy/RLS

38. activating Center reads its own Center Warranty history;
39. unrelated Center cannot read another Center's Warranty/PII;
40. Agent/Dealer receive no new customer-Warranty read access;
41. Admin reads all;
42. anon/public has no Warranty access;
43. service-role/Data API boundaries match repository policy;
44. generated Supabase types exactly match rebuilt schema.

### Existing regressions

45. all Cube J Opening/Recovery contracts still pass;
46. all Cube K Issue contracts still pass;
47. Transfer/Custody one-holder invariants still pass;
48. Cube L notification failures cannot roll back Warranty/support business state.

---

## 20. Application quality gates

Before Cube M closure:

- fresh local Supabase migration rebuild passes;
- DB lint passes;
- generated database types are regenerated and exact;
- TypeScript passes;
- production build passes;
- PR Quality passes on exact final head;
- Database Quality passes on exact final head;
- mobile rendered tests cover identify -> data -> review -> activate -> detail;
- scanner/manual fallback reuse is verified;
- retry/lost-response behavior is verified with stable request ID;
- Admin correction/void rendered paths are verified;
- role/privacy boundaries are tested through real application surfaces;
- independent domain/concurrency review finds no J/K/Custody contradiction;
- fresh scope review confirms no Public Warranty/QR/Claims/Customer-account leakage.

---

## 21. Implementation sequence — small completed increments

Implement on a fresh feature branch from the then-current `main` after this specification is approved.

1. **Warranty schema foundation**
   - `warranties`;
   - Activation Code sequence/constraints;
   - `warranty_events`;
   - RLS/direct-mutation denial;
   - no UI.

2. **Atomic Activation engine**
   - candidate resolver;
   - Center mutation;
   - policy snapshot;
   - idempotency;
   - one-effective-Warranty invariant;
   - race tests.

3. **J/K reverse guards**
   - issue creation after Activation;
   - Recovery after Activation;
   - race regressions.

4. **Warranty read projections**
   - Center/Admin bounded list;
   - detail;
   - search/privacy;
   - generated types.

5. **Center Activation UX**
   - QR/manual identify;
   - eligibility;
   - customer/vehicle form;
   - review;
   - success/detail.

6. **Admin correction/void support**
   - bounded mutations;
   - audit;
   - detail UX;
   - Center correction notifications through existing Cube L infrastructure.

7. **Integrated closure review**
   - database/security/concurrency;
   - mobile/UX;
   - scope/dependency review;
   - exact-head CI.

Do not combine all increments into one large implementation commit.

---

## 22. Definition of Done

Cube M is Done only when:

- an active Center can activate exactly one effective Warranty for an eligible opened Roll it currently holds;
- network approval is not an Activation requirement;
- customer and vehicle/VIN data are captured without creating a customer-account subsystem;
- Product warranty policy is atomically snapshotted;
- Activation Code is stable, unique and separate from future public security token;
- Pre-install Issue hold/return rules are enforced atomically;
- effective Warranty blocks later Pre-install Issue creation;
- effective Warranty blocks Cube J Opened Roll Recovery;
- race outcomes are deterministic and regression-tested;
- normal Center Undo/edit is impossible;
- genuine data-entry mistakes have a narrow audited Admin correction path;
- mistaken activation has a narrow audited `voided_in_error` path without deleting history or permanently stranding the Roll;
- Center/Admin can find and inspect Warranty records internally;
- Agent/Dealer/public users do not receive customer PII access;
- later Product/Center approval/location edits do not silently rewrite or invalidate issued customer coverage;
- no public Warranty token, QR label, print, Claims or replacement scope leaked into the cube;
- exact-head PR/Database Quality and integrated J/K/M review are green.

---

## 23. Handoff to the next lifecycle cube

After Cube M closes, the next customer-facing lifecycle gap is:

**Public Warranty Access / Verification**

That later cube should consume the already-issued Warranty and decide/implement:

- cryptographically strong/non-enumerable public access token;
- stable public Warranty URL;
- exactly what customer-safe Warranty projection is exposed;
- behavior for active/expired/voided records;
- secure lookup/anti-enumeration;
- customer claim entry handoff without requiring a customer account.

Only after that public identity is frozen should the customer Warranty QR/print slice implement the approved physical copies for:

- vehicle;
- Warranty card;
- invoice.

Those QR copies should point to the approved public Warranty identity, not to SKU, Roll serial, ERP serial, Transfer ID or the non-secret Activation Code as an authorization credential.

Cube I remaining Production-owned labels remain separate and may proceed independently when its physical label matrix is ready.
