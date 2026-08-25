# Protection Giants — Claims P/Q/R Master Architecture

**Status:** APPROVED architecture baseline / implementation Specs require final review  
**Date:** 2026-08-25  
**Baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Product decisions:** `docs/claims-product-decisions-amendment.md` (PD-063 through PD-075)  
**Depends on:** Cube M Warranty Activation, Cube N Public Warranty Access, Cube L Notifications/PWA, existing Operational Party / Center foundation, Roll Custody & Transfers, Cube J Roll Opening, and Cube K Pre-install Issue  
**Purpose:** freeze one coherent end-to-end Claims architecture before P, Q and R are implemented separately.

---

## 1. Why this document exists

Claims are one customer journey but not one implementation cube.

If Intake, adjudication and replacement/reinstall were designed independently, the project would risk:

- adding Claim states that later need to be repurposed as fulfillment states;
- changing Claim ownership or customer verification after public launch;
- leaving approved Claims without an authoritative fulfillment handoff or mistake-correction boundary;
- making a replacement Roll accidentally eligible for a second Warranty or using the wrong SKU;
- bypassing physical Roll Opening / pre-install quality history when replacement material is used;
- letting Warranty `voided_in_error`, Transfer, Roll Opening or Activation race with Claim state;
- adding an unnecessary accounting/ticketing subsystem to solve an operational lifecycle problem.

The architecture therefore freezes shared contracts now, while implementation still follows:

> implement and qualify P, then Q, then R — one cube at a time, each from updated `main`.

The **Claims macro-capability is not Production-ready until P + Q + R are all complete**. Intermediate cube completion is a software milestone only.

---

# 2. Domain decomposition

## 2.1 Warranty — Cube M truth

Warranty remains the customer coverage record and owns:

- Warranty Number;
- source Roll;
- Product identity snapshot;
- Warranty policy snapshot;
- activating Center snapshot;
- customer/vehicle snapshot;
- coverage start/end;
- `issued | voided_in_error` issuance truth.

Claims never rewrite these facts.

## 2.2 Claim — P + Q

Claim owns:

> what the customer reported, what evidence belongs to it, and what Protection Giants decided.

It owns Claim Number, source Warranty, submit-time eligibility, category/area/description, required images, adjudication, optional inspection, final Company decision, immutable events and end-to-end `closed_at`.

Claim does not own physical Roll movement or replacement execution.

## 2.3 Resolution/Entitlement — R

Resolution owns:

> what physical remedy was authorized for an approved Claim and whether it was completed.

It owns one-to-one entitlement, performing Center, remedy kind, optional replacement Roll allocation, allocation reservation/release/consumption, completion evidence/events and final end-to-end closure.

Resolution owns no money, invoices or reimbursement.

---

# 3. Shared identity

- Warranty: existing `PG-W-NNNNNNNN`, reference only.
- Claim: new `PG-C-NNNNNNNN`, database-generated, unique, permanent, non-secret.
- Customer access: existing permanent `/w/<PUBLIC-CODE>` owned by original physical Roll.

No second Claim token or new customer QR is introduced.

---

# 4. State architecture

## 4.1 Claim adjudication

Frozen values:

```text
submitted
under_review
awaiting_inspection
approved
rejected
cancelled
```

Rules:

- P creates `submitted` only;
- Q owns later adjudication;
- approval/rejection occur from `under_review`;
- bounded cancellation may occur from `under_review` or `awaiting_inspection`;
- one narrow approval-in-error correction may transition `approved → cancelled` **only while its one-to-one Resolution remains untouched `authorized`**;
- the original approval event and Resolution row remain historical; cancellation closes the Claim and makes the untouched Resolution non-actionable;
- once R assigns the Resolution to a performing Center, approved-Claim cancellation/undo is no longer available;
- R never rewrites approved Claim into a fulfillment status.

If Claim is cancelled while inspection is still `requested`, the inspection row remains historical but loses actionability because parent Claim is closed.

## 4.2 End-to-end `closed_at`

- new Claim → null;
- rejected → set in Q;
- cancelled → set in Q;
- approved → remains null;
- R successful completion → set atomically.

Database enforces at most one Claim per Warranty where `closed_at is null`.

## 4.3 Resolution

Frozen V1 states exactly:

```text
authorized
assigned
completed
```

No Resolution `cancelled`, generic `in_progress`, waiting-stock, scheduling or payment state.

Q approval creates one `authorized` header. R owns `authorized → assigned → completed` and bounded reassignment while assigned.

An untouched `authorized` row whose parent approved Claim is later corrected to `cancelled` stays immutable historical evidence and is excluded from R actionable reads/mutations.

---

# 5. Customer flow

Primary surface remains `app/(public)/w/[publicCode]`, with recommended nested:

`/w/<PUBLIC-CODE>/claim`

No public Claim/Warranty Number lookup.

## Active Warranty

- verify registered phone;
- if no open Claim → submit;
- if open Claim → verified status instead of duplicate form.

## Expired Warranty

- no new Claim;
- existing Claim submitted while active remains followable and continues operationally.

Other non-effective Cube N states do not allow new Claim.

Phone verification happens server-side against current effective Warranty; stored phone is never returned for comparison.

Customer labels are derived only, e.g. received, under review, inspection required, approved/processing, rejected, cancelled, completed. They are not another state machine.

---

# 6. Evidence

Private bucket responsibility:

`warranty-claim-evidence`

Consistent V1 evidence rules across Claims operations:

- images only;
- max 5 when evidence required;
- max 8 MiB/image;
- JPEG/PNG/WebP;
- no video;
- no public object listing.

Use staged private upload + authoritative final mutation + metadata/event commit + compensation for failed final mutation. A successful business record never references missing required evidence.

---

# 7. Review / inspection

Q supplies Company/Admin queue/detail inside `/operations` with Claim, Warranty snapshot/policy, customer/vehicle, submission evidence, prior closed Claims/service history and timeline.

One formal inspection max:

```text
requested
submitted
```

Admin may reassign the same requested inspection with reason. Center provides technical evidence only. Submission returns Claim to `under_review`.

Cancellation while inspection pending closes parent Claim and removes Center authority without fabricating another inspection status.

---

# 8. Decision / correction boundary

## Approved

Atomically:

- Claim → approved;
- decision/event persisted;
- `closed_at` remains null;
- exactly one Resolution → authorized.

No Roll, Center execution, Warranty mutation or Transfer side effect.

## Rejected

Claim rejected + decision/event + `closed_at`; no Resolution.

## Cancelled

Bounded Company closure for duplicate, submitted-in-error or customer withdrawal after review begins.

### Approval-in-error correction

If approval itself was erroneous, Company may use the same audited `cancelled` outcome only while:

- Claim is still open and `approved`;
- exactly one Resolution exists;
- Resolution status remains `authorized`;
- R has not assigned a Center or started fulfillment.

The approval event and authorized Resolution are retained as history. No row is deleted. Once Resolution becomes `assigned`, there is no generic undo path.

---

# 9. Resolution / fulfillment

## 9.1 Remedy kinds

Exactly:

- `service_reinstall`;
- `replacement_roll_reinstall`.

No financial remedy types.

## 9.2 Performing Center

Admin assigns one active Center. Original installer may be used but is not required. Reassignment requires explicit reason and no active reserved Roll; release material first if needed.

## 9.3 Replacement material movement

Existing Custody/Transfer remains authoritative:

1. if Roll elsewhere, move via ordinary Transfer;
2. Center confirms receipt;
3. then R may allocate.

No auto-Transfer.

## 9.4 Replacement Roll eligibility / same SKU

At allocation the Roll must be:

- otherwise operationally eligible;
- **unopened**;
- in confirmed custody of assigned Center;
- without effective Warranty/transfer conflict/previous Claim consumption;
- **same Product/SKU as the original Warranty**.

V1 never silently substitutes another Product/SKU. Cross-product substitution needs a later explicit Product Decision.

Allocation states:

```text
reserved
released
consumed
```

Only one active reserved/consumed Claim owner per Roll.

## 9.5 Reserved Roll physical opening and quality

While reserved:

- ordinary Transfer blocked;
- Warranty Activation blocked;
- another Claim allocation blocked.

But real physical lifecycle continues:

1. exact assigned performing Center may create existing immutable Cube J Opening for the reserved Roll;
2. if defect discovered before use, existing Cube K Pre-install Issue remains available;
3. pending issue blocks R completion;
4. `cleared_for_use` / `reported_in_error` allows continuation;
5. `return_required` blocks consumption; Admin releases unused allocation, then existing Opened Roll Recovery may handle physical return.

No second Opening/quality subsystem.

## 9.6 Release

Before use only.

- unopened release may restore ordinary eligibility subject to all other rules;
- opened release never undoes Cube J Opening and remains governed by opened-Roll/Issue/Recovery rules.

## 9.7 Consumed

Terminal Claim Fulfillment material. Block future Warranty Activation, allocation, ordinary Transfer/reuse, new Opening and new pre-use issue/recovery paths.

Its own Cube N resolver becomes `unavailable_for_warranty` if no effective Warranty.

---

# 10. Completion

## Service/reinstall

Assigned active Center + note + private images.

## Replacement

Additionally requires:

- one reserved allocation;
- same-SKU Roll still in assigned Center custody;
- existing Cube J Opening by that Center after reservation;
- no pending Cube K issue;
- no historical `return_required`;
- exact allocated Roll verified/scanned;
- no second Warranty.

Completion transaction:

- replacement allocation reserved→consumed where applicable;
- Resolution→completed;
- completion evidence/event;
- Claim `closed_at`;
- original Warranty remains issued with unchanged coverage timestamps.

---

# 11. Warranty compatibility

- original Warranty term never restarts/extends;
- natural expiry after valid Claim submission never stops Claim/Resolution;
- Warranty `voided_in_error` is blocked while `closed_at is null`;
- no automatic Claim/Resolution cancellation from Warranty changes;
- legitimate Cube M customer/vehicle corrections may flow into authorized reads, but immutable issuance snapshots remain historical.

---

# 12. Roll compatibility matrix

| Operation | Normal Roll | Claim reserved, unopened | Claim reserved, opened | Claim consumed |
| --- | --- | --- | --- | --- |
| ordinary Transfer | existing | blocked | blocked | blocked |
| Cube J Opening | existing | exact assigned Claim Center only | duplicate blocked | blocked |
| Cube K Issue | existing | not yet eligible | allowed under K | blocked |
| Warranty Activation | existing | blocked | blocked | blocked |
| Claim allocation | eligible if R checks pass | same Resolution only | no new allocation | blocked |
| allocation release | n/a | allowed before use | allowed before use; Opening persists | impossible |
| Cube N Warranty state | existing | ordinary pre-activation | ordinary subject to current lifecycle | unavailable if no effective Warranty |

R adds only minimal guards/exceptions, not redesigns of Transfer/J/K/M/N.

---

# 13. Notifications

Reuse Cube L domain truth / Inbox / attention / Push separation.

Key events:

- Claim submitted → Admin action-required;
- inspection requested/reassigned → assigned Center;
- inspection submitted → Admin;
- Claim decision/correction → bounded internal visibility; customer via verified page;
- Resolution assigned/reassigned → performing Center;
- replacement Roll reserved → only if actionable;
- Resolution completed → bounded informational.

No customer SMS/email/WhatsApp.

---

# 14. Security / privacy

1. no anonymous direct Claims/evidence/inspection/Resolution/allocation access;
2. customer actions bound to Public Code + registered-phone verification;
3. Claim Number non-secret;
4. lifecycle writes only through controlled server/RPC boundaries;
5. evidence paths exclude PII/Public Code;
6. Admin Company-wide authority; Center only specifically assigned work;
7. Agent/Dealer no adjudication;
8. privacy-safe notification payloads;
9. immutable transition events;
10. deterministic locking/revalidation for Warranty/Claim/Roll races.

---

# 15. Permanent hard/race scenarios

Must test:

- simultaneous Claim submissions → one open case;
- expiry vs submit;
- Warranty void vs Claim submit;
- duplicate/conflicting Admin decisions;
- inspection submit vs reassignment/cancellation;
- approval retry → one Resolution;
- approval-in-error cancellation succeeds only while Resolution untouched authorized;
- same correction denied after Resolution assigned;
- same Roll allocation race → one winner;
- wrong-SKU Roll allocation rejected;
- allocation vs ordinary Transfer;
- exact Claim Center Opening succeeds; stale/unrelated Opening fails;
- replacement pre-install issue vs completion;
- return_required cannot be consumed; release+Recovery possible;
- release vs completion;
- Warranty void vs incomplete R;
- second Claim vs R completion;
- consumed Roll cannot Transfer/Open/Issue/Activate and resolves unavailable.

---

# 16. Cube boundaries

## P — Customer Warranty Claim Intake

Claim foundation/number, one-open invariant, phone verification, categories, required images, submit + status + new-Claim notification. No review/decision/Resolution.

## Q — Claim Review, Inspection & Decision

Admin queue/detail, review, one inspection/reassignment, bounded cancellation, Company decision, approval-in-error correction while Resolution untouched authorized, minimal authorized Resolution, Warranty void guard, customer decision projection, events/notifications. No remedy/Roll/finance.

## R — Approved Claim Resolution / Replacement & Reinstall

Remedy, Center assignment/reassignment, same-SKU replacement candidate, reservation/release/consumption, Claim-reserved Cube J Opening, Cube K quality reuse, completion evidence, Claim closure, service history, customer completion projection and minimal compatibility guards. No finance/new Warranty/new QR.

---

# 17. Implementation sequence / gates

Implement P from fresh latest main → qualify → independent audit → merge.

Then Q from merged P → qualify P regressions + Q → audit → merge.

Then R from merged Q → qualify Transfer/J/K/M/N/L + P/Q/R → hosted full material flow → audit → merge.

**Claims Macro GO** only after full customer Claim → optional inspection → decision → optional Transfer → same-SKU replacement allocation → Cube J Opening → optional Cube K Issue → completion → Claim closure passes with:

- no second Warranty;
- original expiry/Public Code unchanged;
- no finance;
- no dead ends from Center suspension, erroneous approval, Warranty expiry or defective replacement Roll;
- no contradictory custody/reservation/Opening/Issue state;
- no unauthorized data exposure.

---

# 18. Non-goals

No generic helpdesk/workflow builder, comments/chat, customer account/OTP, public Claim search, AI adjudication, Agent/Dealer adjudication, SLA engine, finance/invoicing/refunds, automatic Transfer, second inventory/Open/quality engine, cross-SKU substitution, renewed Warranty, new customer QR, video evidence, or unnecessary cron/background workflow.
