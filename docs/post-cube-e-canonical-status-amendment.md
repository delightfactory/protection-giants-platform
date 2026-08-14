# Protection Giants — Post-Cube-E Canonical Status Amendment

**Date:** 2026-08-14  
**Status:** Approved status/context reconciliation after Cube E and before Cube F implementation  
**Applies to:** `delightfactory/protection-giants-platform`  
**Current merged baseline before this documentation change:** `main` at `5d9d8dfcdd3c30748c6df4da3522a4435068f4d5`

## 1. Purpose and authority

This document preserves the current project status after Cube E and the authoritative context required for Cube F.

It prevents future development from inheriting stale status or superseded wording from older documents.

Under the repository precedence policy, later Product Decisions, the current dependency roadmap and the current cube specification control where older wording conflicts.

The current Cube F implementation contract is:

`docs/cube-f-roll-transfer-state-reservation-spec.md`

The implementation-aware context review that preceded it is:

`docs/cube-f-pre-design-context-review.md`

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
- Outer Roll Label & Print Foundation — Cube E software implementation.

Cube E was merged through PR #47 with merge commit:

`59c3dad636680316bd6963088ce276ab241a23d7`

Cube E is software-complete and merged after PR/Database Quality, typecheck/build, GTIN/QR/planning/request/imposition/vector-renderer contracts and independent local validation/retest.

The physical print/cut/scan gate remains **mandatory but deferred because suitable equipment is not currently available**. It is tracked by:

`docs/cube-e-pending-physical-print-validation.md`

That deferred physical gate does not block Cube F software development.

Until the real-world test is completed, `150 × 100 mm` and printer/cutter/RIP parameters remain provisional and must not be described as production-frozen.

---

## 3. Current Cube E boundary

Older wording that described Cube E as a narrow temporary scan label is superseded by PD-030 through PD-032 and the Cube E normative amendment.

Cube E now owns:

- optional official Product GTIN and lifecycle/validation rules;
- one contextual Roll QR derived from the canonical Roll serial;
- public exact Roll resolver exposing only eligible public Product content;
- the V1 outer Roll label as two identical front/back copies;
- deterministic vector-first PDF rendering;
- bounded large-order planning/imposition/reprint primitives;
- Admin label preflight/export;
- voided-order protection.

Cube E does not own Transfer state/receipt or Activation/Warranty identities/labels.

The same Roll QR may later identify the exact Roll inside authenticated operational workflows, but possession of the QR never grants Transfer, receipt, Roll Opening or Warranty authority.

---

## 4. Current next software cube

The immediate next software cube is:

**Cube F — Roll Transfer State & Reservation Engine**

Its specification is now defined in:

`docs/cube-f-roll-transfer-state-reservation-spec.md`

The specification freezes the bounded F design before any implementation branch is opened.

Cube F depends on:

- Cube D confirmed custody;
- Operational Party identity;
- exact Transfer ID recipient identity/privacy boundary;
- current Product/Production/Roll eligibility rules;
- existing Auth/Profile lifecycle model.

Cube F does **not** depend on completing Cube E's deferred physical printer validation and does not depend on camera scanning.

The scan-based sender experience remains Cube G.

Recipient receipt/partial receipt and the first confirmed custody transition remain Cube H.

---

## 5. Transfer context that must remain preserved

### 5.1 Custody identity

Custody and Transfers reference `operational_parties.id`, never Auth User ID or Profile ID as the holder identity.

Current Cube D implementation uses:

- `roll_custody_current` as the authoritative one-row-per-Roll confirmed custody projection;
- `roll_custody_events` as immutable confirmed-custody history.

Pending Transfer reservation must not redefine confirmed custody.

### 5.2 Reservation is not custody movement

Creating a Transfer:

- verifies sender is confirmed current custodian;
- reserves selected eligible Rolls against conflicting Transfer use;
- leaves confirmed custody with sender;
- does not append a custody event.

Confirmed custody changes only later after receipt.

### 5.3 Recipient identity/privacy

Recipient selection uses exact stable Transfer ID, not a global operational-party directory.

Transfer ID is stable/shareable but is not secret, OTP, proof of custody, Roll identity, or Activation/Warranty identity.

### 5.4 Entity identity is independent from user existence

A Center can exist, have an Operational Party and Transfer ID, and be selected as a pending Transfer recipient before its first user account exists.

Transfer creation therefore must not require the recipient Center to already have a user.

Receipt later requires an authenticated authorized user representing the recipient entity.

### 5.5 Management hierarchy is not a Transfer route matrix

The management hierarchy remains:

```text
Protection Giants / Company
└── Country Agent
    ├── Dealer
    │   └── Installation Center
    └── Installation Center (direct to Agent)
```

It controls management scope/ordinary visibility, not every physical movement path.

Approved model remains capable of direct/return/peer flows such as:

- Company → Agent;
- Company → Center;
- Agent → Dealer;
- Agent → Center;
- Dealer → Dealer;
- Dealer → Center;
- Center → Center;
- Center → Dealer return;
- Dealer → Company return.

### 5.6 Center approval/location are unrelated to Transfer authority

Protection Giants network approval and Center location/public-directory state do not grant or block Transfer authority.

An otherwise active Center participates according to custody and Transfer rules regardless of its public trust-badge state.

### 5.7 Production eligibility

A Roll under a voided Production Order remains historical but is not operationally eligible for Transfer.

Cube F additionally blocks Production Order void while an active Transfer reservation exists; it does not auto-cancel that Transfer.

### 5.8 Idempotency/concurrency/lifecycle races are database responsibilities

Transfer creation must be safe against:

- browser double-submit;
- network retry;
- stale request-key reuse with changed payload;
- two concurrent attempts to reserve one Roll;
- stale custody reads;
- concurrent Production void;
- concurrent actor/recipient suspension.

Critical validation is repeated atomically under appropriate database locks. UI checks are never the final guard.

### 5.9 No automatic expiry

No first-release cron/timer silently expires pending Transfers or releases reservations.

### 5.10 Pre-receipt termination

Before receipt:

- sender may cancel;
- recipient may reject;
- reservation is released;
- custody remains unchanged.

A narrow audited Admin recovery cancellation exists only for the suspended-party recovery condition defined by PD-036 and the Cube F spec. It is not party impersonation.

### 5.11 Partial receipt remains Cube H

Partial receipt is approved for the overall lifecycle, but recipient inbox/receipt, per-item receipt state, discrepancy resolution and actual custody transitions remain Cube H.

Cube H must atomically update `roll_custody_current` and append the next immutable `roll_custody_events` entry for each confirmed received Roll.

---

## 6. Important implementation reality inherited from Cube D

The current custody projection intentionally has **no `reserved_transfer_id` column**.

Earlier specs used that only as a conceptual example.

Cube F therefore keeps:

- `roll_custody_current` = confirmed custody only;
- `roll_custody_events` = immutable confirmed-custody events only;
- pending reservation = separate Cube F current-state projection.

Cube F must not move confirmed custody early merely to simplify Transfer implementation.

---

## 7. Current F/G/H boundary

### Cube F

Owns backend Transfer identity/state, immutable membership, active reservation, idempotency, concurrency, pre-receipt cancellation/rejection, narrow suspended-party Admin recovery, RLS/read boundaries and Production-void coordination.

### Cube G

Owns sender user experience:

- exact recipient Transfer ID entry/scan;
- recipient verification card;
- Scan Rolls;
- Select Rolls;
- Select Lot;
- partial-held Lot clarity;
- review/count confirmation;
- mobile camera flow;
- interrupted-submit recovery.

### Cube H

Owns:

- recipient pending-transfer inbox/detail;
- receipt/partial receipt;
- discrepancy resolution;
- first confirmed custody-changing transaction;
- receipt-time scan verification where required;
- hardening of all pre-receipt terminal actions once receipt state exists.

---

## 8. Superseded wording to ignore

Do not allow these older ideas to re-enter implementation:

- Approved Center as Transfer/Activation permission;
- hierarchy-only Transfer routes;
- Cube E as merely a temporary scan sticker;
- full Production Label Package as prerequisite for Transfer state;
- conceptual `reserved_transfer_id` as if already implemented in Cube D;
- direct custody movement at Send time;
- global recipient directory;
- mandatory individual scan for every Roll in trusted whole-Lot movement;
- any legacy-repository schema/state machine as current architecture authority.

---

## 9. Product Decisions added for Cube F

Current Cube F-specific decisions are recorded in `docs/product-decisions.md`:

- PD-033 — Admin represents only singleton Company for ordinary Transfer party actions; no generic party impersonation;
- PD-034 — active Transfer reservation blocks Production Order void;
- PD-035 — pending Transfers do not auto-expire in first release;
- PD-036 — suspended-party pending Transfers have a narrow audited Admin recovery cancellation path.

These complement the earlier Transfer decisions PD-022 through PD-025.

---

## 10. Gate before Cube F implementation branch

After this specification documentation is merged:

1. fetch latest `main` again;
2. re-read this status amendment, Product Decisions, current roadmap and `docs/cube-f-roll-transfer-state-reservation-spec.md`;
3. verify no newer merge changes relevant schema/contracts;
4. create a fresh Cube F implementation branch from that exact `main`;
5. implement only the frozen F boundary;
6. add permanent Database Quality coverage, including concurrency and 10,000-Roll boundaries;
7. perform implementation-integrity review;
8. perform fresh dependency/scope review;
9. merge only after CI and both reviews pass.

No Cube G/H/Activation/Warranty functionality should be pulled into the Cube F implementation for convenience.
