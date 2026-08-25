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
- leaving approved Claims without an authoritative fulfillment handoff;
- making a replacement Roll accidentally eligible for a second Warranty;
- bypassing the physical Roll Opening / pre-install quality history when replacement material is used;
- letting Warranty `voided_in_error`, Transfer, Roll Opening or Activation race with Claim state;
- adding an unnecessary accounting/ticketing subsystem to solve an operational lifecycle problem.

The architecture therefore freezes the shared contracts now, while implementation still follows the project rule:

> implement and qualify P, then Q, then R — one cube at a time, each from updated `main`.

The **Claims macro-capability is not Production-ready until P + Q + R are all complete**. Intermediate cube completion is a software milestone, not permission to expose an operationally incomplete end-to-end Claim service to real customers.

---

# 2. Domain decomposition

## 2.1 Warranty — existing Cube M truth

Warranty remains the customer coverage record. It owns:

- Warranty Number;
- source Roll;
- Product identity snapshot;
- Warranty policy snapshot;
- activating Center snapshot;
- customer/vehicle snapshot;
- coverage start/end;
- `issued | voided_in_error` issuance truth.

Claims do not rewrite these facts.

## 2.2 Claim — Cubes P + Q

Claim owns the question:

> Has the customer submitted an eligible Warranty problem, what evidence belongs to it, and what did Protection Giants decide?

Claim owns:

- Claim Number;
- source Warranty;
- submit-time eligibility truth;
- issue category / affected area / description;
- required submission images;
- adjudication status;
- optional formal inspection;
- final Company decision;
- immutable Claim events;
- end-to-end `closed_at` coordination marker.

Claim does **not** own physical Roll movement or replacement execution.

## 2.3 Resolution/Entitlement — Cube R

Resolution owns the question:

> For an approved Claim, what physical remedy was authorized and has that remedy actually been completed?

Resolution owns:

- one-to-one approved Claim entitlement;
- performing Center;
- approved remedy type;
- optional replacement Roll allocation;
- allocation reservation/release/consumption;
- completion evidence;
- completion state/events;
- final closure of the end-to-end Claim case.

Resolution does **not** own money, invoices or reimbursement.

---

# 3. Shared identity model

## Warranty identity

The existing human Warranty Number remains:

`PG-W-NNNNNNNN`

It is not the Claim identity and is not an authorization secret.

## Claim identity

Every Claim receives:

`PG-C-NNNNNNNN`

Properties:

- database generated;
- globally unique;
- permanent;
- sequence gaps acceptable;
- never reused;
- customer/operations reference only;
- never used as the public authorization credential.

## Public customer identity

The customer's stable bearer URL remains:

`/w/<PUBLIC-CODE>`

The Public Code remains owned by the original physical Roll under Cube N. Claims and replacement do not rotate or replace it.

No second Claim token is printed or added to the vehicle/card/invoice QR.

---

# 4. End-to-end state architecture

## 4.1 Claim adjudication state

Frozen V1 Claim status values:

```text
submitted
under_review
awaiting_inspection
approved
rejected
cancelled
```

Rules:

- P creates only `submitted`;
- Q owns later adjudication transitions;
- `approved`, `rejected`, `cancelled` are adjudication-terminal;
- R does not rewrite an approved Claim into a fulfillment status;
- approval/rejection occur from `under_review`;
- bounded cancellation may occur from `under_review` or `awaiting_inspection` to avoid a pending-inspection dead end.

If a Claim is cancelled while an inspection is still `requested`, the historical inspection row remains but loses actionability because the parent Claim is closed. No fake inspection-completion/cancellation state is invented.

## 4.2 End-to-end open-case marker

`status` alone cannot enforce one active customer case because an `approved` Claim remains operationally unfinished until Resolution completes.

Claim therefore carries an authoritative nullable `closed_at`:

- new Claim → `closed_at = null`;
- Q `rejected` → set `closed_at`;
- Q `cancelled` → set `closed_at`;
- Q `approved` → leave `closed_at = null`;
- R successful completion → set `closed_at` atomically with Resolution completion.

Database enforces:

> at most one Claim per Warranty where `closed_at is null`.

This is the cross-cube invariant that prevents a second Claim while the first approved remedy is still being executed, without merging Q/R state machines.

## 4.3 Resolution state

Frozen V1 Resolution states are exactly:

```text
authorized
assigned
completed
```

There is no Resolution `cancelled`, `waiting_stock`, `scheduled`, `payment_pending` or generic `in_progress` state in V1.

Boundary:

- Q approval atomically creates exactly one minimal Resolution/Entitlement row in `authorized`;
- Q does not populate performing Center, remedy kind, replacement Roll or completion data;
- R exclusively owns `authorized → assigned → completed` and bounded reassignment while still `assigned`.

This makes the Q→R handoff durable without implementing R prematurely.

---

# 5. Customer flow

## 5.1 Existing Warranty page

The existing `app/(public)/w/[publicCode]` route remains the primary public Warranty surface.

For an effective Warranty, the Claims affordance is nested under the same permanent identity. Recommended V1 route:

`/w/<PUBLIC-CODE>/claim`

The Claim route does not provide manual lookup by Claim Number or Warranty Number.

## 5.2 Eligibility presentation

For an effective **active** Warranty:

- customer may verify the registered phone;
- if no open Claim exists, customer may submit a new Claim;
- if one open Claim exists, verified customer sees its narrow status instead of a second submit form.

For an effective **expired** Warranty:

- no new Claim submission;
- verified customer may still follow a Claim submitted while coverage was active.

For non-effective/no-current/unavailable states:

- no new Claim submission;
- do not expose internal historical Claim data through anonymous public state.

## 5.3 Phone verification

Verification compares the submitted normalized phone to the phone stored on the authoritative effective Warranty.

The server must not return the stored phone to the browser for comparison.

No verification endpoint may become a phone-based Warranty lookup oracle.

## 5.4 Customer-visible Claim projection

After successful phone verification, return only the minimum customer service projection.

Derived labels may include:

- `تم استلام المطالبة`;
- `قيد المراجعة`;
- `مطلوب فحص بالمركز`;
- `تم قبول المطالبة وجارٍ ترتيب المعالجة`;
- `تم رفض المطالبة`;
- `تم إلغاء المطالبة`;
- `تم تنفيذ المعالجة`.

These labels do not create another persisted state machine.

---

# 6. Evidence architecture

Claims use a new private evidence boundary separate from Product assets and the existing Pre-install Issue evidence domain.

Recommended bucket:

`warranty-claim-evidence`

V1 file contract is inherited consistently across P/Q/R:

- images only;
- minimum/maximum counts frozen by each operation;
- maximum 5 images when evidence is required;
- maximum 8 MiB/image;
- JPEG, PNG, WebP;
- no video;
- no public bucket or raw anonymous object listing.

## 6.1 Storage vs database atomicity

Storage bytes and business rows are not one PostgreSQL transaction. Use a bounded staged-upload model:

1. authorize exact customer/Center context;
2. upload into a private random staged path;
3. final authoritative mutation validates ownership/type/size/count;
4. database transaction commits business row + evidence metadata + event + notification source;
5. failed final mutation compensates uploaded objects best-effort.

A successful business record must never reference missing required evidence.

---

# 7. Internal review and inspection architecture

## 7.1 Company queue/detail

Cube Q provides one Company/Admin Claims queue inside the existing `/operations` shell.

Admin detail composes bounded reads for:

- Claim facts/evidence;
- Warranty Number/status;
- coverage start/end and submit-time eligibility;
- Product identity snapshot;
- Warranty coverage/care snapshot;
- customer/vehicle data needed for review;
- activating Center snapshot;
- previous closed Claims/service history;
- inspection result when present;
- immutable timeline.

Current Product policy edits never replace the Warranty policy snapshot used to adjudicate the issued Warranty.

## 7.2 One formal V1 inspection

A Claim has at most one formal inspection row:

```text
requested
submitted
```

Admin may reassign the same pending inspection to another active Center with mandatory reason/event.

Assigned Center is evidence provider only. Submission returns Claim to `under_review`.

If Company legitimately cancels the Claim while inspection is pending, the requested row remains historical but the Center immediately loses task access because the Claim is closed.

---

# 8. Decision architecture

Only active Admin/Company decides.

## Approved

Atomic consequences:

- Claim → `approved`;
- final decision fields/events persisted;
- `closed_at` remains null;
- exactly one minimal Resolution row created in `authorized`;
- customer projection becomes accepted / processing.

No Roll, Center execution assignment, Warranty mutation or Transfer occurs automatically.

## Rejected

- Claim → `rejected`;
- final decision persisted;
- `closed_at` set;
- no Resolution.

## Cancelled

Bounded Admin closure for confirmed duplicate, submitted-in-error or customer withdrawal.

Allowed after review has started, including while one requested inspection is pending. It sets `closed_at`; any pending inspection becomes non-actionable without deleting history.

Cancellation is not available after approval because the case has entered R's immutable fulfillment path.

---

# 9. Resolution / fulfillment architecture

## 9.1 Remedy kinds

V1 has only:

- `service_reinstall` — corrective service/reinstall without consuming a new Protection Giants Roll;
- `replacement_roll_reinstall` — use one replacement physical Roll as Claim fulfillment and reinstall.

No money/refund/credit remedy types exist.

## 9.2 Performing Center

Admin assigns one operationally active Center. Original activating Center may be used but is not mandatory.

If assigned Center becomes unavailable before completion, Admin may reassign subject to material state. A reserved Roll allocation must be explicitly released before Center reassignment.

## 9.3 Replacement Roll movement

Existing Custody/Transfer remains authoritative.

If desired replacement material is elsewhere:

1. do not allocate it yet;
2. use ordinary Transfer;
3. recipient Center confirms receipt;
4. only then may R allocate that Roll to the Resolution.

R never auto-creates a Transfer.

## 9.4 Replacement Roll allocation

At allocation the Roll must be unopened, otherwise eligible, have no effective Warranty, have no blocking issue/recovery/transfer state, and be in confirmed custody of the assigned performing Center.

Allocation states:

```text
reserved
released
consumed
```

Only one active reserved/consumed Claim relationship may own a Roll.

### While `reserved`

The Roll is exclusive Claim material:

- ordinary Transfer blocked;
- customer Warranty Activation blocked;
- another Claim allocation blocked.

But reservation does **not** suppress the real physical opening/quality path:

1. the exact assigned performing Center may create the existing immutable Cube J Roll Opening for that reserved Roll;
2. after opening, if a suspected defect appears before use, the same Cube K Pre-install Issue workflow is available;
3. a `submitted` issue blocks R completion/consumption until Company resolves it;
4. `cleared_for_use` or `reported_in_error` allows fulfillment to continue;
5. `return_required` prevents Claim consumption; Admin releases the unused allocation, then the existing Cube J Opened Roll Recovery path may handle physical return.

No second Claim-specific opening or quality subsystem is created.

### If allocation is released

Release is allowed only before Claim consumption.

If Roll is still unopened, ordinary eligibility may resume subject to every existing rule.

If Roll was already opened, release does not undo that physical fact. Cube J Opening and any Cube K history remain authoritative; ordinary Transfer remains governed by opened-Roll rules.

### When `consumed`

The Roll is permanently Claim Fulfillment material and is blocked from:

- Warranty Activation;
- future Claim allocation;
- ordinary Transfer/reuse;
- new Roll Opening;
- new Pre-install Issue/Recovery paths that imply pre-use material.

Its own Cube N public Warranty resolver derives terminal `unavailable_for_warranty` when no effective Warranty exists.

Confirmed custody history remains operational history; consumption does not create a fake customer Operational Party.

---

# 10. Resolution completion

## `service_reinstall`

Requires assigned active performing Center, completion note, private completion images, and authoritative completion actor/time.

## `replacement_roll_reinstall`

Requires additionally:

- exactly one allocation still `reserved`;
- exactly one existing Cube J Opening for the allocated Roll, created by the assigned performing Center after reservation;
- no currently `submitted` Pre-install Issue;
- no historical `return_required` Pre-install outcome;
- Roll still in confirmed custody of performing Center;
- exact allocated Roll verified/scanned at completion;
- no second Warranty exists.

Final completion atomically:

- allocation `reserved → consumed` when replacement is used;
- Resolution → `completed`;
- completion event/evidence metadata persisted;
- Claim `closed_at` set;
- original Warranty remains issued with unchanged coverage timestamps;
- customer status derives `تم تنفيذ المعالجة`.

---

# 11. Warranty compatibility rules

## Original Warranty

Claims never extend, restart or replace original coverage timestamps.

## Warranty `voided_in_error`

Cube M void mutation rejects while an open Claim (`closed_at is null`) exists.

No automatic Claim/Resolution cancellation.

## Natural expiry

Expiry blocks new Claim creation but never terminates a previously valid Claim/Resolution.

## Warranty corrections

Claim reads may reflect Cube M's legitimate mutable customer/vehicle corrections where applicable; immutable Product/Center/policy issuance snapshots remain historical.

---

# 12. Cross-cube Roll compatibility matrix

| Operation on physical Roll | Normal Roll | Claim `reserved`, unopened | Claim `reserved`, opened | Claim `consumed` |
| --- | --- | --- | --- | --- |
| ordinary Transfer | existing rules | blocked until release | blocked by Claim reservation + Cube J opening | blocked |
| Cube J Roll Opening | existing rules | allowed only for exact assigned Claim-performing Center/context | already opened / duplicate blocked | blocked |
| Cube K Pre-install Issue | existing rules | not eligible until opened | allowed under existing K rules | blocked |
| Warranty Activation | existing rules | blocked | blocked while Claim reservation exists; K rules also apply | blocked |
| Claim allocation | eligible if all R rules pass | same Resolution only | no new allocation | blocked |
| allocation release | n/a | allowed before use | allowed before use; does not undo Opening | impossible |
| Cube N public Warranty state | existing resolver | ordinary pre-activation presentation | ordinary presentation subject to existing lifecycle until consumed | `unavailable_for_warranty` if no effective Warranty |

R owns only the minimal compatibility guards/exceptions required to enforce this matrix. It must not redesign Transfer/J/K/M/N.

---

# 13. Notification contract

Claims reuse Cube L's separation of domain truth, durable Inbox, attention policy and best-effort Push.

Recommended event catalog:

| Event | Recipient | Intent |
| --- | --- | --- |
| Claim submitted | active Admin profiles | action required |
| Inspection requested/reassigned | assigned Center | action required |
| Inspection submitted | active Admin profiles | action required |
| Claim approved/rejected/cancelled | relevant internal users; customer uses verified page | bounded |
| Resolution assigned/reassigned | performing Center | action required |
| Replacement Roll reserved | Center/Admin only if it changes required action | bounded |
| Resolution completed | relevant Admin/Center | informational/bounded |

Customer SMS/email/WhatsApp is not introduced.

---

# 14. Security and privacy invariants

1. Anonymous role never gets direct table/Storage access to Claims, evidence, inspections, Resolutions or allocations.
2. Customer actions use narrow server/RPC boundaries bound to Public Code + registered-phone verification.
3. Claim Number is never an authorization credential.
4. Direct Data API writes cannot bypass lifecycle mutations.
5. Evidence paths contain no raw phone, VIN, customer name or Public Code.
6. Admin has Company-wide Claims authority; Center sees only assigned inspection/fulfillment work.
7. Agent/Dealer receive no V1 adjudication authority.
8. Notification payloads remain privacy-safe.
9. All authoritative transitions produce immutable events/audit evidence.
10. Concurrency-sensitive mutations revalidate current truth under deterministic locking rather than trust stale UI state.

---

# 15. Permanent race/regression scenarios

P/Q/R quality gates must cover at least:

- simultaneous customer submissions → exactly one open Claim;
- Warranty expires between render and submit → new Claim rejected;
- valid Claim commits before expiry → survives later expiry;
- Warranty void races Claim submission → one deterministic valid winner;
- two Admin final decisions → one terminal adjudication;
- inspection submit races reassignment/cancellation → one valid winner;
- Q approval retry → exactly one `authorized` Resolution;
- two Resolutions allocate same Roll → one winner;
- allocation races ordinary Transfer → one winner;
- exact Claim-performing Center opening reserved Roll succeeds; unrelated/stale opening attempt fails;
- Pre-install Issue submitted on reserved/opened replacement Roll blocks Claim completion;
- `return_required` cannot be consumed; release + existing Recovery remains possible;
- allocation release races completion → either release wins and completion fails or completion consumes and release fails;
- Warranty void races incomplete Resolution → void blocked;
- second Claim races R completion → no overlapping open cases;
- consumed Roll later attempts Transfer/Open/Issue/Activation → blocked;
- consumed Roll public Warranty resolver → terminal unavailable.

---

# 16. Cube boundaries

## Cube P — Customer Warranty Claim Intake

Owns:

- Claim schema + Claim Number;
- `closed_at` / one-open-case foundation;
- issue taxonomy;
- customer phone verification;
- required private intake images;
- customer submit flow;
- `submitted` event;
- narrow verified customer status;
- Admin new-Claim notification.

Does not own review, inspection, decision, Resolution or replacement material.

## Cube Q — Claim Review, Inspection & Decision

Owns:

- Admin queue/detail;
- `under_review` / `awaiting_inspection`;
- one formal inspection + reassignment;
- bounded cancellation while inspection is pending;
- Center inspection submission;
- Company `approved | rejected | cancelled`;
- `closed_at` on rejected/cancelled;
- one minimal `authorized` Resolution on approval;
- Warranty void open-Claim guard;
- decision/inspection timeline + notifications.

Does not own remedy, performing Center, Roll allocation/consumption, reinstall or finance.

## Cube R — Approved Claim Resolution / Replacement & Reinstall

Owns:

- authorized Resolution processing;
- `service_reinstall | replacement_roll_reinstall`;
- performing Center assignment/reassignment;
- replacement Roll candidate boundary;
- allocation reservation/release/consumption;
- narrow Claim-reserved Cube J Opening compatibility;
- reuse of Cube K issue/quality path before replacement consumption;
- completion evidence;
- Resolution completion + Claim `closed_at`;
- Warranty service history;
- customer completed projection;
- fulfillment notifications;
- minimal Transfer/J/K/M/N compatibility guards.

Does not own finance, automatic Warranty renewal, new customer QR or generic aftersales/ticketing.

---

# 17. Implementation sequence and gates

## Stage P

1. fetch latest `main`;
2. revalidate/freeze P against exact base;
3. implement P only;
4. database/RLS/Storage/security review;
5. hosted customer mobile acceptance;
6. independent second audit;
7. merge.

P alone is not Production Claims launch approval.

## Stage Q

Repeat from merged P `main`; revalidate P contracts and Cube M void compatibility. Merge only after Q-specific gate and independent audit.

## Stage R

Repeat from merged Q `main`; revalidate Transfer/J/K/M/N compatibility and run real replacement-material staging scenarios.

## Claims Macro GO

Claims V1 is operationally complete only after:

- P gate PASS;
- Q gate PASS;
- R gate PASS;
- full customer Claim → optional inspection → decision → service/replacement completion PASS;
- replacement Roll opening + pre-install quality exception PASS;
- security/privacy PASS;
- no dead end from Center suspension, Warranty expiry, Roll defect, allocation release or failed Transfer;
- relevant M/N/L + Transfer/J/K regressions PASS.

---

# 18. Explicit architecture non-goals

Do not add during P/Q/R without a new Product Decision:

- generic helpdesk/ticket engine;
- arbitrary workflow builder;
- comments/chat;
- customer account/OTP;
- public Claim search;
- AI adjudication;
- Agent/Dealer adjudication;
- SLA/escalation engine;
- finance/accounting/invoicing;
- refund/credit remedy types;
- automatic Transfer;
- replacement inventory separate from tracked Rolls;
- second Roll Opening/pre-install quality system;
- renewed Warranty after replacement;
- new customer QR/public identity;
- video evidence;
- cron/background processes when explicit synchronous lifecycle actions are sufficient.

The design completes the physical Product/Warranty service lifecycle without turning Protection Giants into an ERP or generic support suite.
