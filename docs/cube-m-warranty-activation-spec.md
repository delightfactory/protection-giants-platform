# Cube M — Warranty Activation

**Status:** APPROVED / FROZEN — Product Owner approval completed 2026-08-25  
**Version:** 1.0  
**Baseline:** `main` at `31b8f6321c5d0a9b51aab29147345d96410eaf81`  
**Depends on:** Product Foundation, Production Order/Lot/Roll Foundation, confirmed Roll Custody, completed Transfer stage, Cube J Roll Opening / Claiming, Cube K Pre-install Roll Issue Reporting, and the existing Auth/Operational Party foundation.  
**Consumes but does not redefine:** Cube L Notifications/PWA infrastructure.

---

## 1. Purpose

Cube M creates the first real customer Warranty from one legitimately opened physical PPF Roll.

It records one durable business fact:

> an authenticated active Installation Center that currently holds an eligible opened Roll has activated the customer Warranty for that Roll using validated customer/vehicle data, the physical Product identity belonging to that Roll, and the Warranty policy valid at the atomic activation transition.

Warranty Activation is the transition from the pre-install operational Roll lifecycle into the customer Warranty lifecycle.

It is **not** Roll Opening, custody movement, Pre-install Issue resolution, public Warranty access, QR printing, Claims, replacement/reinstall, customer-account management, accounting, invoicing, or a generic CRM/customer database.

The cube must be operationally complete inside its boundary: Center and Admin can activate, find, inspect and safely correct genuine mistakes without deleting history or leaving a Roll permanently stranded by an accidental activation.

---

## 2. Inherited approved rules

Cube M preserves these existing project decisions:

1. one physical PPF Roll can create at most one **effective** customer Warranty;
2. Roll Opening and Warranty Activation are separate events;
3. normal Activation uses customer + vehicle data including VIN/chassis identity;
4. customer account, OTP, photos, videos and invoice upload are not mandatory in V1;
5. Protection Giants network approval is **not** an Activation gate;
6. activating Center must be operationally active and current confirmed custodian;
7. parent Production Order must remain `generated` / non-voided;
8. immutable Cube J Opening must already exist;
9. Cube K `submitted` issue blocks Activation immediately;
10. any historical Cube K `return_required` blocks Activation;
11. `cleared_for_use` and `reported_in_error` do not themselves block Activation;
12. Warranty policy is snapshotted at Warranty creation;
13. public Warranty access/token/QR remains later scope;
14. Warranty identity must not reuse SKU, Roll serial, ERP serial or Transfer ID;
15. direct client mutation is not an acceptable substitute for authoritative lifecycle RPCs.

---

## 3. Approved Cube M product decisions

### M-D1 — Successful Activation creates the Warranty; no separate Activation workflow object

V1 does not create a second mutable Activation workflow/table.

The successful atomic mutation creates one `warranties` row. That row is the durable result of Activation.

At the same transition the Warranty receives one stable human-readable **Warranty Number**.

The Warranty Number:

- is allocated by the database only after ordinary eligibility validation has passed far enough to attempt issuance;
- is globally unique;
- is never reused, including after `voided_in_error`;
- may have gaps because database sequence values can be consumed by failed/rolled-back transactions; gaps are acceptable and are not an error;
- is an operational/customer reference, not a password, OTP or public-access secret;
- must never be replaced by SKU, Roll serial, ERP serial or Transfer ID;
- must never become the future public Warranty authorization token.

Frozen V1 format:

`PG-W-NNNNNNNN`

where `NNNNNNNN` is a zero-padded global monotonic sequence with a minimum display width of eight digits.

The later Public Warranty cube owns the separate cryptographically strong/non-enumerable public token/URL.

### M-D2 — One Roll has at most one effective issued Warranty

A Roll cannot have two simultaneously effective `issued` Warranty rows.

A narrow Admin-only `voided_in_error` state exists only for a demonstrably mistaken activation. The historical row and its Warranty Number remain permanently retained but are no longer an effective customer Warranty.

After void-in-error, a new Activation is possible only through a **new request** and only if every current Activation eligibility rule passes again.

The new Warranty receives a **new Warranty Number**. The old number is never reused or redirected to the new Warranty.

This exception is an audit correction, not a second-Warranty entitlement, replacement or reinstall workflow.

### M-D3 — Warranty term starts at successful Activation time in V1

V1 uses the authoritative database `activated_at` timestamp as the coverage start.

`coverage_expires_at` is computed atomically from:

- `activated_at`; and
- snapshotted Product `default_warranty_months`.

Use calendar-month arithmetic, not a fixed `30 × months` day approximation.

No mandatory maximum gap between Opening and Activation is introduced.

V1 deliberately avoids editable/backdated installation-date arithmetic and cross-country timezone ambiguity. If the business later needs backdating from physical installation date, that requires an explicit new Product Decision.

### M-D4 — Product identity source and Warranty policy source are deliberately different

The Warranty must preserve the physical Product identity that actually belongs to the Roll **and** the Warranty policy valid at Activation.

**Product identity snapshot comes from the immutable Production Order snapshot associated with the Roll**, at minimum:

- Product code/SKU snapshot;
- Product name snapshot;
- Product version snapshot where present.

This keeps the Warranty aligned with the physical produced Roll even if current Product marketing/name data later changes.

**Warranty policy snapshot comes from the current Product row at Activation time**, at minimum:

- default warranty duration months;
- warranty coverage text;
- care instructions.

The Product row must be read/locked consistently so concurrent Product editing cannot produce a mixed policy snapshot.

An already-produced legitimate Roll must not become stranded merely because its Product is later archived or unpublished. Product active/publication state is therefore not independently an Activation gate for an existing operational Roll.

However, duration/coverage/care must be complete. Missing policy content blocks Activation with recoverable `policy_incomplete`; Admin can complete the Product Warranty policy and the Center can retry.

### M-D5 — Customer data is a minimal Warranty snapshot, not a customer subsystem

Required:

- customer full name;
- customer phone.

Optional:

- customer email.

The legacy reference system also collected address lines, country, state and postal code. Review found no current V1 lifecycle need that justifies carrying those fields forward. They are therefore deliberately excluded from normal Cube M Activation.

Do not create a generic `customers` table, CRM, deduplication engine or customer login identity in this cube.

The same customer may legitimately own multiple Warranties on different Rolls/vehicles.

### M-D6 — Vehicle data is a minimal Warranty snapshot

Required:

- vehicle make;
- vehicle model;
- VIN/chassis identifier.

Optional:

- model year;
- plate number;
- vehicle color.

VIN/chassis is not globally unique: one vehicle may legitimately receive more than one independently warranted installation if later lifecycle/product rules permit it.

V1 validates conservatively rather than rejecting legitimate regional/imported chassis identifiers merely because they are not a modern 17-character VIN.

Frozen persisted contract:

- normalized uppercase;
- 6–40 ASCII letters/digits;
- no whitespace;
- never used as an authentication secret.

### M-D7 — Installer identity comes from authenticated Center truth, not free text

The legacy system asked the operator to type `installer_name`. Cube M must not repeat that trust weakness.

The activating installer is derived from the authenticated active Center that owns current confirmed custody.

Warranty persistence stores both:

- stable `activating_center_party_id`; and
- immutable `activating_center_name_snapshot` captured at issuance.

The party id preserves durable relational identity. The name snapshot preserves what the installing Center was called at the time of issuance if its current name later changes.

The user does not type or choose an arbitrary installer business name during Activation.

### M-D8 — No evidence/OTP/invoice requirement for normal Activation

Normal Activation does not require:

- photo/video evidence;
- invoice upload;
- customer OTP;
- customer account;
- payment/accounting data.

Cube K continues to own Pre-install Issue evidence.

### M-D9 — Core issuance identity is immutable; only two bounded Admin support corrections exist

Center cannot edit, delete or undo a successful Warranty.

Immutable core fields include:

- Roll;
- Warranty Number;
- activating Center party and Center-name snapshot;
- activation actor/time;
- Product identity snapshot;
- Warranty-policy snapshot;
- coverage timestamps.

Admin receives only:

1. **customer/vehicle detail correction** with mandatory reason + immutable event;
2. **void activation recorded in error** with mandatory reason + immutable event.

Wrong Roll/false Activation is corrected by void-in-error, never by silently changing `roll_id`.

### M-D10 — Later operational metadata changes do not silently cancel customer coverage

After issuance:

- network-approval change does not invalidate Warranty;
- Center location change does not invalidate Warranty;
- later Center suspension does not silently cancel customer coverage;
- later Product edits/archive do not rewrite snapshots;
- Activation does not move custody;
- Opening remains immutable.

Any future cancellation/replacement/reinstall consequence belongs to an explicitly approved later lifecycle.

### M-D11 — Notifications remain low-noise and never business state

Normal self-success does not Push-notify the actor who just activated the Warranty.

Cube M may materialize only useful asynchronous Admin-support events through existing Cube L infrastructure:

- customer/vehicle details corrected → informational Inbox notification to active Profiles of the activating Center;
- `voided_in_error` → warning/action-relevant Inbox notification to active Profiles of the activating Center.

Notification/Push content must remain privacy-safe and must not put customer phone, VIN or other sensitive Warranty detail on a lock screen.

Push failure can never affect Warranty state.

---

## 4. Bounded scope

Cube M owns:

- Warranty persistence;
- Warranty Number allocation;
- one-effective-Warranty-per-Roll invariant;
- customer/vehicle snapshots;
- activating Center identity/name snapshot;
- Product identity + Warranty-policy snapshots;
- Center candidate resolver;
- atomic Activation mutation;
- J/K reverse guards after Warranty exists;
- Center/Admin Warranty list/detail reads;
- Admin customer/vehicle correction;
- Admin void-in-error correction;
- mobile-first Activation UX;
- Admin support UX;
- deterministic errors;
- RLS/privacy/security;
- idempotency/concurrency/regression coverage;
- bounded Cube L support notifications;
- clean handoff to Public Warranty.

Cube M does **not** own:

- public Warranty URL/token/verification;
- customer Warranty QR generation/printing;
- vehicle/Warranty-card/invoice labels;
- Cube I Production-owned labels;
- customer accounts;
- Claims;
- replacement/reinstall;
- post-install defect adjudication;
- refunds/accounting;
- generic customer/vehicle master data;
- generic workflow/permission engine;
- SMS/email/WhatsApp channels.

---

## 5. Warranty lifecycle

### 5.1 Persisted record state

Only:

- `issued`;
- `voided_in_error`.

There is no Center cancellation/revocation/undo.

### 5.2 Derived temporal state

For `issued`:

- `active` while current time < `coverage_expires_at`;
- `expired` after term elapses.

Do not create cron jobs merely to rewrite active → expired.

`voided_in_error` always presents as voided regardless of time.

Future Claims may introduce other service states later; Cube M must not pre-build them.

---

## 6. Persistence contract

### 6.1 `warranties`

Conceptual shape:

```text
warranties
- id                              UUID PRIMARY KEY
- request_id                      UUID NOT NULL UNIQUE
- roll_id                         UUID NOT NULL -> rolls.id
- warranty_number                 TEXT NOT NULL UNIQUE
- record_state                    TEXT NOT NULL DEFAULT 'issued'

- activated_by_profile_id         UUID NOT NULL -> profiles.id
- activating_center_party_id      UUID NOT NULL -> operational_parties.id
- activating_center_name_snapshot TEXT NOT NULL
- activated_at                    TIMESTAMPTZ NOT NULL
- coverage_expires_at             TIMESTAMPTZ NOT NULL

- product_id                      UUID NOT NULL -> products.id
- product_code_snapshot           TEXT NOT NULL
- product_name_snapshot           TEXT NOT NULL
- product_version_snapshot        TEXT NULL
- warranty_months_snapshot        SMALLINT NOT NULL
- warranty_coverage_snapshot      TEXT NOT NULL
- care_instructions_snapshot      TEXT NOT NULL

- customer_name                   TEXT NOT NULL
- customer_phone                  TEXT NOT NULL
- customer_email                  TEXT NULL

- vehicle_make                    TEXT NOT NULL
- vehicle_model                   TEXT NOT NULL
- vehicle_year                    SMALLINT NULL
- vehicle_plate                   TEXT NULL
- vehicle_color                   TEXT NULL
- vehicle_vin                     TEXT NOT NULL

- voided_by_profile_id            UUID NULL -> profiles.id
- void_reason                     TEXT NULL
- voided_at                       TIMESTAMPTZ NULL

- created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints must enforce:

- `record_state in ('issued', 'voided_in_error')`;
- void metadata all-null for `issued`, complete for `voided_in_error`;
- `coverage_expires_at > activated_at`;
- warranty duration within existing Product policy limits;
- nonblank bounded Product/policy/Center snapshots;
- bounded normalized customer/vehicle fields;
- VIN/chassis contract from M-D6;
- canonical Warranty Number format;
- no direct client mutation.

One-effective-Warranty rule:

```text
UNIQUE (roll_id) WHERE record_state = 'issued'
```

Historical voided rows and Warranty Numbers stay permanently retained.

### 6.2 Warranty Number sequence

Use a dedicated database sequence owned by the Warranty domain.

Formatting occurs inside authoritative issuance logic. Sequence values are never manually entered and never recycled.

A sequence gap caused by a failed transaction is acceptable. Correctness requires uniqueness/traceability, not gap-free numbering.

### 6.3 `warranty_events`

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

Allowed V1 kinds:

- `activated`;
- `details_corrected`;
- `voided_in_error`.

Rules:

- append-only;
- activation event in the same transaction as Warranty creation;
- correction/void reasons required and bounded;
- correction event stores only before/after fields needed to prove the change;
- Admin can inspect full support audit;
- Center-facing detail may show sanitized correction history without internal support notes.

This is a bounded audit contract, not a generic event framework.

---

## 7. Activation candidate resolver

Center-only read contract, conceptually:

```text
resolve_warranty_activation_candidate(p_roll_serial TEXT)
```

Return minimum safe preflight data:

- Roll serial;
- Product identity from Production snapshot;
- Lot where useful;
- Opening timestamp;
- authenticated acting Center identity;
- current warranty-duration summary;
- blocking issue state;
- existing visible Warranty reference where appropriate;
- deterministic eligibility state.

Suggested states:

- `eligible`;
- `not_opened`;
- `not_current_custodian`;
- `production_invalid`;
- `transfer_reserved`;
- `issue_pending`;
- `return_required`;
- `policy_incomplete`;
- `already_activated`.

Preflight never replaces final mutation revalidation.

---

## 8. Final Center Activation eligibility

All must hold in one authoritative transaction:

1. authenticated caller;
2. active Profile;
3. role = `center`;
4. bound Installation Center exists and remains active;
5. acting Operational Party is that Center;
6. Roll exists;
7. parent Production Order is `generated`;
8. current confirmed custody belongs to acting Center;
9. no active Transfer reservation;
10. immutable Cube J Opening exists;
11. no Cube K issue currently `submitted`;
12. no historical Cube K `return_required`;
13. no effective `issued` Warranty exists;
14. current Product warranty duration is valid;
15. current Product warranty coverage is nonblank;
16. current Product care instructions are nonblank;
17. Center name snapshot source is nonblank;
18. customer/vehicle payload is valid.

Network approval, public listing/location badge, QR possession, serial knowledge, Transfer ID and Product publication state are not independent authorization predicates.

---

## 9. Atomic Activation mutation

Conceptual public RPC:

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

It must:

1. normalize/validate payload;
2. lock/revalidate actor Profile + bound Center lifecycle;
3. serialize request ID;
4. resolve exact Roll;
5. return matching successful retry when applicable;
6. lock parent Production Order;
7. lock current Roll custody;
8. revalidate Production/current Center custody;
9. reject active reservation;
10. verify Opening;
11. inspect Cube K issue state;
12. reject `submitted` / any historical `return_required`;
13. reject existing effective Warranty;
14. read physical Product identity from the Roll's immutable Production Order snapshot;
15. read/lock current Product Warranty policy consistently;
16. capture stable Center party + Center-name snapshot;
17. allocate Warranty Number;
18. insert one `issued` Warranty with all snapshots;
19. compute expiry using authoritative activation time + calendar-month policy duration;
20. append `activated` event;
21. return safe minimal result.

### 9.1 Lock-order compatibility

Cube K established the physical-Roll order:

`Production Order -> current Roll custody`

Cube M preserves it.

This lock order must remain compatible with Cube J/K mutation paths and serialize the physical Roll before Warranty issuance decisions.

Product-policy locking occurs after the physical-Roll lifecycle locks and must not introduce a reverse Product-edit dependency.

### 9.2 Required race outcomes

#### Activation vs Pre-install Issue submission

From the same valid pre-state:

- Issue commits first → Activation observes the hold and fails;
- Activation commits first → later Issue creation observes effective Warranty and fails.

Both cannot succeed.

#### Activation vs Opened Roll Recovery

From the same valid pre-state:

- Recovery commits first → custody no longer satisfies activating Center and Activation fails;
- Activation commits first → Recovery observes effective Warranty and fails.

Both cannot succeed.

#### Activation vs another Activation

At most one effective `issued` Warranty may result.

Matching idempotent retry returns the same Warranty. Different requests race to one winner; loser gets deterministic `already_activated`.

#### Activation vs Center/Profile suspension

Mutation revalidates actor/Center lifecycle under the established lock discipline. A stale page cannot authorize Activation after suspension wins.

#### Activation vs Product-policy edit

The policy snapshot must be one coherent Product state. It must never combine duration from one edit with coverage/care from another.

---

## 10. Idempotency

Same `request_id` + same actor + same Roll + same normalized customer/vehicle payload returns the existing Warranty result.

Same request ID with changed actor/Roll/payload → deterministic request conflict.

Different request against an already-issued Roll → `already_activated`.

If the original Warranty is later `voided_in_error`, retrying the **old** request must return/reference that historical result and must never recreate/reactivate it.

Legitimate reactivation requires:

- a new request id;
- all current eligibility checks;
- a new Warranty row;
- a new Warranty Number.

---

## 11. Reverse hardening of Cube K

Once Warranty schema exists, `create_roll_preinstall_issue(...)` must add its previously deferred Warranty guard.

After taking the established Production Order → current custody locks, issue creation rejects if an effective `issued` Warranty exists.

Required outcome:

- Issue commits first → Activation fails on hold;
- Activation commits first → Issue creation fails on Warranty.

`voided_in_error` removes only the Warranty-specific block. Any later Issue still requires every ordinary Cube K rule, including no historical `return_required`.

---

## 12. Reverse hardening of Cube J Recovery

Effective Warranty blocks Opened Roll Recovery.

Recovery candidate must expose `warranty_activated`.

Recovery mutation/reservation boundary must reject effective issued Warranty under the established Roll locks.

Reason: after customer Warranty Activation, any physical return/replacement/reinstall belongs to future Claims/Replacement, not the pre-Warranty Recovery exception.

`voided_in_error` removes only this Warranty-specific block; all ordinary J/K eligibility still applies.

---

## 13. Admin support corrections

### 13.1 Customer/vehicle details correction

Conceptual RPC:

```text
correct_warranty_details(
  p_request_id UUID,
  p_warranty_id UUID,
  ...allowed customer/vehicle fields...,
  p_reason TEXT
)
```

Admin-only and idempotent.

May change only:

- customer name/phone/email;
- vehicle make/model/year/plate/color/VIN.

Must never change:

- Roll;
- Warranty Number;
- activating Center party/name snapshot;
- activation actor/time;
- Product identity snapshot;
- Warranty-policy snapshot;
- coverage dates;
- record state.

The RPC locks the Warranty row, validates replacement payload and appends one `details_corrected` event atomically.

### 13.2 Void activation recorded in error

Conceptual RPC:

```text
void_warranty_in_error(
  p_request_id UUID,
  p_warranty_id UUID,
  p_reason TEXT
)
```

Must:

- require active Admin;
- require current state `issued`;
- require bounded explicit reason;
- transition only to `voided_in_error`;
- store actor/time/reason;
- append matching event;
- never delete/reuse Warranty Number;
- never alter Opening, custody or Issue history;
- never automatically create a replacement Warranty;
- never automatically start Transfer/Recovery.

There is no restore-to-issued action.

Future Claims implementation must harden this support action once Claim records exist. Cube M does not invent placeholder Claim state today.

---

## 14. Read/privacy model

### Center

Active Center may:

- resolve candidates only within its current custody eligibility;
- activate eligible Rolls;
- list/read Warranties activated by its Center party;
- retain historical access to its own Center Warranty records while the Center remains active;
- not edit/void.

### Admin

Active Admin may:

- list/read all Warranties;
- use bounded exact/controlled search such as Warranty Number, Roll, VIN/chassis or phone;
- perform the two bounded support corrections;
- inspect full audit.

### Agent / Dealer

Cube M grants no customer-Warranty PII read authority to Agent or Dealer in V1.

Hierarchy membership is not a reason to expose customer name, phone, VIN or Warranty details.

### Public / anon

No Warranty-table read and no public lookup in Cube M.

Public access later goes only through a separate secure public projection/token contract.

### Data API

Critical writes are RPC-only. Direct INSERT/UPDATE/DELETE is denied. Service-role exposure follows the repository's explicit-grant discipline.

---

## 15. Internal Warranty surfaces

Frozen routes:

- `/operations/warranties`;
- `/operations/warranties/activate`;
- `/operations/warranties/[id]`.

### Registry

Mobile-first, newest-first, paginated.

Useful fields:

- Warranty Number;
- customer name;
- vehicle make/model;
- VIN/chassis;
- Product;
- Roll serial;
- activating Center where role permits;
- activation time;
- derived active/expired/voided state.

Admin receives broader bounded search/filter. Do not create an unbounded customer directory or phone-unfriendly wide table.

---

## 16. Center Activation UX

### Stage 1 — Identify Roll

Reuse the existing contextual Roll QR scanner/parser and manual serial fallback. No second scanner framework and no new Roll QR identity.

### Stage 2 — Eligibility

Show:

- acting Center;
- Product;
- Roll serial;
- Opening time;
- warranty duration;
- blocking state where present.

Blocked states must explain the real next action:

- issue pending → wait for Protection Giants decision; link to visible issue detail;
- policy incomplete → Protection Giants/Admin must complete Product Warranty terms;
- already activated → open existing visible Warranty;
- return required → follow the existing return/recovery handling applicable to that Roll;
- no fake disabled workflow controls.

### Stage 3 — Customer/vehicle form

Collect only M-D5/M-D6 data.

Do not ask for:

- customer postal address;
- country/state merely because the legacy form did;
- installer business name;
- Product selection independent from the Roll;
- installation date;
- evidence/OTP/invoice.

Use suitable mobile input modes and clear validation.

### Stage 4 — Review + irreversible confirmation

Show acting Center, Product/Roll, customer, vehicle/VIN and Warranty duration.

State clearly that this creates the customer Warranty for this Roll and ordinary Center Undo is unavailable.

Primary CTA example:

`تأكيد تفعيل ضمان العميل`

### Stage 5 — Success

Show:

- Warranty Number;
- customer/vehicle summary;
- Product/Roll;
- installing Center;
- activation time;
- expiry;
- internal Warranty detail access.

Do not show placeholder customer QR/print controls before Public Warranty/QR scope exists.

---

## 17. Admin support UX

Warranty detail separates normal read from exceptional support actions.

### Correct details

- Admin-only;
- only customer/vehicle fields editable;
- reason required;
- explicit confirmation;
- resulting audit marker visible.

### Void in error

Destructive confirmation must state:

- history is retained;
- effective Warranty ends because Activation was recorded in error;
- Warranty Number remains permanently reserved;
- no automatic Transfer/Recovery/reactivation occurs;
- any later Activation must pass full current eligibility and receives a different Warranty Number.

No Center Undo button.

---

## 18. Deterministic errors

Stable service codes should include at least:

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

UI maps these to concise Arabic operational messages and never exposes raw PostgreSQL text.

---

## 19. Permanent Database Quality / concurrency contract

Must cover at least:

### Issuance

1. valid active current-custodian Center succeeds;
2. unapproved Center succeeds when operational rules pass;
3. wrong Center/custody fails;
4. inactive Profile/Center fails;
5. unopened Roll fails;
6. voided Production fails;
7. active reservation fails;
8. archived/unpublished Product does not itself strand a legitimate produced Roll;
9. incomplete policy fails recoverably;
10. user cannot supply an arbitrary installer Center name;
11. Center party + Center-name snapshot come from authenticated Center truth.

### Cube K

12. `submitted` blocks;
13. historical `return_required` blocks;
14. `cleared_for_use` allows when all other rules pass;
15. `reported_in_error` allows when all other rules pass;
16. Activation vs Issue submission serializes to one winner;
17. effective Warranty blocks new Issue;
18. after void-in-error, Issue still requires all ordinary K rules.

### Cube J

19. effective Warranty blocks Recovery;
20. Activation vs Recovery serializes to one winner;
21. void-in-error removes only the Warranty-specific Recovery block.

### One-Warranty / idempotency / Warranty Number

22. one Roll cannot have two issued Warranties;
23. matching retry returns same Warranty;
24. changed request payload conflicts;
25. two concurrent requests produce one issued Warranty;
26. old request retry after void never resurrects;
27. reactivation after void requires new request + full revalidation;
28. reactivation receives a new Warranty Number;
29. Warranty Number is globally unique and never reused;
30. sequence gaps are accepted and do not break lookup/idempotency.

### Snapshot integrity

31. Product code/name/version snapshot matches the Roll's Production Order snapshot;
32. duration/coverage/care are one consistent current Product-policy snapshot;
33. concurrent Product-policy edit cannot create mixed terms;
34. later Product edit/archive does not mutate Warranty snapshot;
35. activating Center name is snapshotted at issuance;
36. later Center rename does not rewrite historical Center-name snapshot;
37. calendar-month expiry arithmetic uses authoritative activation time.

### Customer/vehicle boundary

38. customer name + phone required;
39. email optional;
40. postal address/country/state/ZIP are not Activation requirements;
41. make/model/VIN required;
42. year/plate/color optional;
43. VIN/chassis normalization and 6–40 character contract enforced;
44. VIN is not globally unique.

### Support/audit

45. Admin correction only changes allowed customer/vehicle fields;
46. Center/Agent/Dealer correction denied;
47. immutable core cannot change;
48. correction is idempotent and event-backed;
49. void is one-way/audited/idempotent;
50. direct update/delete denied.

### Privacy

51. activating Center reads its Center history;
52. unrelated Center cannot read it;
53. Agent/Dealer receive no customer-Warranty PII access;
54. Admin reads all;
55. anon/public cannot read Warranty;
56. service-role/Data API boundaries remain explicit;
57. generated Supabase types match rebuilt schema.

### Regression

58. all Cube J Opening/Recovery contracts pass;
59. all Cube K Issue contracts pass;
60. Transfer/Custody one-holder invariants pass;
61. Notification/Push failure cannot roll back Warranty/support state.

---

## 20. Application quality gates

Before Cube M closure:

- fresh Supabase migration rebuild;
- DB lint;
- regenerated exact database types;
- TypeScript checks;
- production build;
- PR Quality + Database Quality on exact final head;
- permanent Cube M database verification script;
- mobile rendered identify → form → review → activate → detail flow;
- QR/manual fallback reuse;
- lost-response/idempotent retry check;
- Admin correction/void rendered verification;
- real role/privacy verification;
- independent domain/concurrency review;
- fresh scope review confirming no Public Warranty/QR/Claims/customer-account leakage.

---

## 21. Implementation sequence — small increments

After this frozen specification is merged, implementation starts from a **fresh implementation branch from then-current `main`**, never from the specification branch.

1. **Warranty schema foundation**
   - `warranties`;
   - Warranty Number sequence/constraints;
   - `warranty_events`;
   - RLS/direct-mutation denial.

2. **Atomic Activation engine**
   - candidate resolver;
   - Center mutation;
   - Center identity/name snapshot;
   - Product identity/policy snapshots;
   - idempotency;
   - one-effective-Warranty rule;
   - race coverage.

3. **J/K reverse guards**
   - Issue-after-Activation block;
   - Recovery-after-Activation block;
   - concurrency regressions.

4. **Warranty reads**
   - Center/Admin bounded registry;
   - detail/search/privacy;
   - generated types.

5. **Center UX**
   - QR/manual identify;
   - eligibility;
   - customer/vehicle data;
   - review/success/detail.

6. **Admin support**
   - correction;
   - void-in-error;
   - audit;
   - bounded Cube L notifications.

7. **Integrated J/K/M closure**
   - database/security/concurrency;
   - mobile UX;
   - scope/dependency review;
   - exact-head CI.

Do not collapse these into one giant implementation commit.

---

## 22. Definition of Done

Cube M is Done only when:

- active Center can create exactly one effective Warranty for an eligible opened Roll it currently holds;
- network approval is not required;
- customer/vehicle/VIN data are captured without customer-account subsystem;
- legacy address/country/state/ZIP fields are not carried forward without a demonstrated need;
- installer identity is derived from authenticated Center truth and Center name is snapshotted;
- physical Product identity comes from Production snapshot;
- Product Warranty policy is atomically snapshotted from current policy;
- Warranty Number is unique/stable/non-secret and separate from future public security token;
- Warranty Number is never reused after void-in-error;
- reactivation after a false activation uses a new request and new Warranty Number;
- Warranty term begins at authoritative successful Activation time;
- Cube K hold/return rules are enforced atomically;
- effective Warranty blocks later Pre-install Issue creation;
- effective Warranty blocks Cube J Recovery;
- races are deterministic/regression-tested;
- Center cannot Undo/edit;
- genuine customer/vehicle mistakes have audited Admin correction;
- false/wrong-Roll activation has audited void-in-error without deleting history or permanently stranding the Roll;
- Center/Admin can find and inspect internal Warranty records;
- Agent/Dealer/public do not receive customer PII access;
- later Product/Center approval/location/name changes do not silently rewrite/cancel issued coverage;
- no public token, QR print, Claims, replacement or customer-account scope leaked in;
- exact-head quality gates and integrated J/K/M review are green.

---

## 23. Handoff after Cube M

Next customer-facing lifecycle cube:

**Public Warranty Access / Verification**

It owns:

- cryptographically strong/non-enumerable public token;
- stable public Warranty URL;
- customer-safe public projection;
- active/expired/voided public behavior;
- anti-enumeration/security;
- later Claims entry handoff without customer account.

Only after that public identity is frozen should the Warranty QR/print slice implement the approved three customer copies:

- vehicle;
- Warranty card;
- invoice.

Those QR copies point to the approved public Warranty identity, never to SKU, Roll serial, ERP serial, Transfer ID or the non-secret Warranty Number as an authorization credential.

Cube I remaining Production-owned labels remain separate and can proceed independently when its physical label matrix is ready.

---

## 24. Legacy-reference review result

The legacy repository was reviewed only as historical functional evidence.

Useful legacy clues retained in the new design:

- customer name/phone/email existed;
- VIN and vehicle identity existed;
- installer identity was customer-facing;
- Warranty had an installation/coverage start concept.

Legacy behaviors deliberately **not** copied:

- free-text installer business name → replaced by authenticated Center identity + name snapshot;
- free Product selection during Activation → Product derives from exact Roll lineage;
- editable/implicit installation-date model → authoritative Activation timestamp starts coverage in V1;
- address/country/state/postal fields → excluded because no current V1 lifecycle requirement justifies them;
- 17-character-only VIN assumption → replaced by approved conservative chassis contract;
- verification using VIN + Roll serial → Public Warranty later receives a separate secure token;
- generic Product `activation_count` → not carried forward for PPF because approved rule is one effective Warranty per physical Roll.

The legacy repository remains non-authoritative for schema, security, concurrency and architecture.
