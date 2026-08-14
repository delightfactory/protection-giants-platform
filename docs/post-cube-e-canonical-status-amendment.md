# Protection Giants — Post-Cube-E Canonical Status Amendment

**Date:** 2026-08-14  
**Status:** Approved status/context reconciliation before Cube F design  
**Applies to:** `delightfactory/protection-giants-platform`  
**Baseline reviewed:** `main` at `59c3dad636680316bd6963088ce276ab241a23d7`

## 1. Purpose and authority

This document reconciles project status and Transfer-related context after Cube E was merged.

It does not redesign the platform and does not create Cube F implementation details. Its purpose is to prevent future development from inheriting stale status or superseded wording from older documents.

Under the repository precedence policy, this is a later normative status/context amendment. Where an older document conflicts specifically on the post-Cube-E status or the clarified Cube E boundary, this amendment controls until the older document is updated.

The main sources re-reviewed before this amendment were:

- `docs/canonical-project-context.md`;
- `docs/product-decisions.md`, including PD-014 and PD-021 through PD-032;
- `docs/distribution-network-flow-spec.md`;
- `docs/development-governance.md`;
- `docs/gap-closure-roadmap.md`;
- `docs/outer-roll-label-print-foundation-amendment.md`;
- `docs/cube-e-outer-roll-label-print-foundation-spec.md`;
- `docs/cube-e-pending-physical-print-validation.md`;
- merged Cube D custody migrations/contracts;
- merged PR #47 and its independent local validation/retest evidence;
- confirmed project discussions retained as business context;
- the legacy repository only as historical functional evidence, never as architecture authority.

---

## 2. Current implementation status

The following foundations are complete/merged:

- Product Foundation;
- Production Order / Lot / physical Roll Foundation;
- Supabase production-readiness and trusted operational Auth/profile foundation;
- Agent & Network Foundation;
- Center Location Foundation — Cube A;
- Center Network Approval Foundation — Cube B;
- Public Center Directory & Map — Cube C;
- Roll Custody Foundation — Cube D;
- Outer Roll Label & Print Foundation — Cube E.

Cube E was merged through PR #47 with merge commit:

`59c3dad636680316bd6963088ce276ab241a23d7`

Cube E is **software-complete and merged** after:

- PR Quality passing;
- Database Quality passing;
- typecheck/build passing;
- GTIN/QR/planning/request/imposition/vector-renderer contracts passing;
- independent local-laptop validation;
- correction and local end-to-end retest of the public Roll resolver.

The physical print/cut/scan gate remains **mandatory but deferred because suitable equipment is not currently available**. It is tracked by `docs/cube-e-pending-physical-print-validation.md` and does not block later software cubes.

Until that real-world test is completed, `150 × 100 mm` and printer/cutter/RIP parameters remain provisional and must not be described as production-frozen.

---

## 3. Cube E boundary after the 2026-08-14 change

Older canonical wording described Cube E as a narrow operational scan label. That description is superseded by PD-030 through PD-032 and the Cube E normative amendment.

Current Cube E owns:

- optional official Product GTIN and its lifecycle/validation rules;
- one contextual Roll QR derived from the existing canonical Roll serial;
- public exact Roll resolver that exposes only the eligible public Product experience;
- the real V1 outer Roll label as two identical front/back copies;
- deterministic vector-first PDF rendering;
- bounded large-order planning/imposition/reprint primitives;
- Admin label preflight/export;
- voided-order protection.

Cube E does **not** own:

- Transfer state, reservation or receipt;
- Activation/Warranty identity;
- customer Warranty QR copies;
- bag/case, inner-Roll or separate ERP label package;
- a generic label/template engine.

The same Roll QR can later be parsed by authenticated workflows to identify the exact Roll, but possession of the QR never authorizes a Transfer, receipt, Roll Opening or Warranty action.

---

## 4. Current next development cube

The immediate next software cube is:

**Cube F — Roll Transfer State & Reservation Engine**

Cube F starts only after a fresh re-review of the current `main` implementation and an explicit Cube F specification. No implementation branch should be opened from an older pre-Cube-E base.

Cube F depends on:

- Cube D confirmed custody;
- Operational Party identity;
- the existing exact Transfer ID recipient resolver/privacy boundary;
- current Product/Production/Roll eligibility rules.

Cube F does **not** depend on completing the deferred physical printer validation from Cube E, and its database/service state machine does not depend on camera scanning.

The scan-based sender experience belongs to Cube G and can reuse Cube E only after Cube F exists.

---

## 5. Transfer context that is already approved and must be preserved

### 5.1 Custody identity

Custody and Transfers reference `operational_parties.id`, never Auth User ID or Profile ID as the holder identity.

The current Cube D implementation uses:

- `roll_custody_current` as the authoritative one-row-per-Roll confirmed custody projection;
- `roll_custody_events` as immutable confirmed-custody history.

Pending Transfer state must not redefine confirmed custody.

### 5.2 Reservation is not custody movement

Creating a Transfer must:

- verify the sender is the confirmed current custodian;
- reserve the selected eligible Rolls against conflicting Transfer use;
- leave confirmed custody with the sender.

Confirmed custody changes only after receipt in the later receipt flow.

This distinction is a core business invariant, not a UI convention.

### 5.3 Recipient identity and privacy

The recipient is selected through its stable exact-match Transfer ID, not by exposing a global operational-party directory.

Transfer ID is:

- stable and shareable;
- not secret;
- not OTP;
- not proof of custody;
- not Roll identity;
- not Activation/Warranty identity.

The existing exact resolver returns only minimal recipient-verification data and only for a valid active recipient.

### 5.4 Active entity, not account existence

An operational entity is distinct from its users.

A Center can exist, have an Operational Party and Transfer ID, and be selected as a pending Transfer recipient even before its first user account exists. This is why Center Onboarding was moved earlier into the Network Foundation.

Therefore Cube F must not make “recipient already has a user account” a requirement for Transfer creation.

Receipt/acceptance later requires an authenticated authorized user representing the recipient entity.

### 5.5 Management hierarchy is not a Transfer route matrix

The normal management hierarchy remains:

```text
Protection Giants / Company
└── Country Agent
    ├── Dealer
    │   └── Installation Center
    └── Installation Center (direct to Agent)
```

This hierarchy controls management scope and ordinary visibility. It does not force physical Roll movement to follow parent-child order.

The Transfer model must remain capable of legitimate direct, return and peer movements such as:

- Company → Agent;
- Company → Center;
- Agent → Dealer;
- Agent → Center;
- Dealer → Dealer;
- Dealer → Center;
- Center → Center;
- Center → Dealer return;
- Dealer → Company return;

subject to current custody, recipient active state and Transfer rules.

Do not add an ancestry-only route matrix merely because the organizational hierarchy exists.

### 5.6 Center network approval is unrelated to Transfer authority

Center operational status, geographic location and Protection Giants network approval are separate concepts.

Network approval is a trust/public designation. It is not:

- proof of custody;
- permission to receive/send a Roll;
- a Transfer acceptance bypass;
- a Roll Opening/Warranty Activation gate.

An active operational Center may participate in custody/Transfer flows regardless of its approved/unapproved public trust badge state.

### 5.7 Production eligibility

A Roll whose parent Production Order is voided remains historically present but is not eligible for Transfer or later operational execution.

Transfer creation must fail closed for voided Production Orders.

### 5.8 Idempotency and concurrency are required

Transfer creation must be safe against:

- browser double-submit;
- network retry;
- two concurrent attempts to reserve the same Roll;
- stale custody reads;
- conflicting Transfer creation.

The state change must be enforced atomically at the database/domain boundary rather than relying on UI checks.

### 5.9 No automatic expiry in first release

The approved Transfer foundation does not require an automatic pending-Transfer expiry timer in the first release.

Do not introduce background expiry, cron cleanup or timeout semantics unless a later explicit business decision requires them.

### 5.10 Partial receipt belongs to the later receipt cube

Partial receipt is approved for the overall Transfer lifecycle:

- received Rolls move custody individually;
- unresolved Rolls do not move custody;
- unresolved Rolls remain reserved while their physical status is unresolved.

However the recipient receipt/inbox/partial-receipt UX and actual confirmed custody transition belong to Cube H, not Cube F.

Cube F must create a state/data contract that can support that later behavior without implementing Cube H prematurely.

### 5.11 Sender cancellation and whole-transfer rejection before receipt

The approved lifecycle allows:

- sender cancellation before any receipt;
- whole-transfer rejection before any receipt;
- release of reservation when such a pre-receipt terminal action succeeds.

Cube F owns the state-machine rules and race protection for these pre-receipt transitions. Cube H later owns the recipient-facing receipt workflow and partial-receipt resolution experience.

---

## 6. Important implementation reality inherited from Cube D

The current custody projection intentionally has **no `reserved_transfer_id` column**. Earlier specs used that only as a conceptual example.

Therefore Cube F must not assume reservation storage already exists or mutate Cube D's schema casually to match an old conceptual sketch.

Reservation representation must be designed from the actual current schema and Cube F invariants, while preserving Cube D's meaning:

- `roll_custody_current` = confirmed custody only;
- `roll_custody_events` = immutable confirmed-custody events only.

Likewise, Cube D intentionally did not implement later custody-transition mutations. When Cube H later becomes the first confirmed custody-changing path, current-custody update and new immutable custody event must occur atomically with locking/concurrency protection.

Cube F should prepare a compatible Transfer contract but must not move confirmed custody early merely to simplify its implementation.

---

## 7. Approved sender selection modes — later Cube G

The overall Transfer experience already approves these sender input modes:

- exact recipient Transfer ID;
- Scan Rolls for small/mixed movements;
- Select Rolls for known subsets;
- Select Lot for trusted bulk movements.

Trusted whole-Lot transfer does not require scanning every Roll individually. The system still expands the Lot into individual Roll items.

If only part of a Lot is held/eligible, the later UI must explicitly show total/available/elsewhere and must not represent the operation as a complete-Lot move.

These are Cube G UX responsibilities. Cube F should expose a bounded service contract that can accept an explicit set of Roll IDs/items after selection, rather than implementing camera/Lot-selection UI itself.

---

## 8. Superseded or stale wording to ignore during Cube F preparation

The following older wording must not drive Cube F design:

- “Approved Center” as a prerequisite for Transfer, Roll Opening or Warranty Activation;
- hierarchy-only physical Transfer routing;
- Cube E as merely a temporary scan sticker;
- the broader Production Label Package as a prerequisite for Transfer state;
- conceptual `reserved_transfer_id` as if it were already implemented in Cube D;
- any legacy-repository schema/state machine as current architecture authority.

The legacy repository remains useful only to identify historical functional expectations that may need to be checked against current approved rules.

---

## 9. Deliberately unresolved before Cube F specification

This status amendment does **not** silently decide:

- final Transfer table names/column layout;
- exact Transfer status vocabulary;
- whether reservation is represented by Transfer-item uniqueness, a dedicated projection, or another minimal database constraint model;
- exact idempotency-key shape;
- exact event table shape and event vocabulary;
- UI layout for sending/receiving Transfers;
- camera scanner details;
- recipient inbox/detail design;
- partial-receipt resolution states beyond the already approved business behavior;
- claims, Activation or Warranty interactions beyond existing eligibility boundaries.

Those choices must be made in the Cube F specification from the actual current schema, with the smallest design that fully satisfies the approved lifecycle.

---

## 10. Gate before opening Cube F implementation branch

Before Cube F implementation begins:

1. inspect latest `main` and verify no newer merge supersedes this baseline;
2. re-read this amendment, Product Decisions, Distribution Network spec and current Custody implementation;
3. inspect the actual Operational Party/Transfer ID resolver implementation and active-state semantics;
4. inspect existing database grants/RLS/default-function-grant contracts;
5. define Cube F schema/state invariants and explicit exclusions;
6. define concurrency/idempotency failure cases before coding;
7. document the Cube F implementation specification;
8. only then create a clean Cube F feature branch from latest `main`.

No Transfer implementation is authorized by this document alone; it authorizes only the next **design/specification** step after this reconciliation is merged.
