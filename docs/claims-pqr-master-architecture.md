# Protection Giants — Claims P/Q/R Master Architecture

**Status:** APPROVED architecture baseline / implementation Specs require final review  
**Date:** 2026-08-25  
**Baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Product decisions:** `docs/claims-product-decisions-amendment.md` (PD-063 through PD-075)  
**Depends on:** Cube M Warranty Activation, Cube N Public Warranty Access, Cube L Notifications/PWA, existing Operational Party / Center foundation, Roll Custody & Transfers, and physical Roll lifecycle guards  
**Purpose:** freeze one coherent end-to-end Claims architecture before P, Q and R are implemented separately.

---

## 1. Why this document exists

Claims are one customer journey but not one implementation cube.

If Intake, adjudication and replacement/reinstall were designed independently, the project would risk:

- adding Claim states that later need to be repurposed as fulfillment states;
- changing Claim ownership or customer verification after public launch;
- leaving approved Claims without an authoritative fulfillment handoff;
- making a replacement Roll accidentally eligible for a second Warranty;
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

The existing human Warranty Number remains unchanged:

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

- P creates only `submitted`.
- Q owns all later adjudication transitions.
- `approved`, `rejected`, `cancelled` are adjudication-terminal.
- R does not rewrite an approved Claim into a fulfillment status.

## 4.2 End-to-end open-case marker

`status` alone cannot enforce one active customer case because an `approved` Claim remains operationally unfinished until Resolution completes.

Therefore Claim also carries an authoritative nullable `closed_at`:

- new Claim → `closed_at = null`;
- Q `rejected` → set `closed_at`;
- Q `cancelled` → set `closed_at`;
- Q `approved` → leave `closed_at = null`;
- R successful completion → set `closed_at` atomically with Resolution completion.

Database enforces:

> at most one Claim per Warranty where `closed_at is null`.

This is the cross-cube invariant that prevents a second Claim while the first approved remedy is still being executed, without merging Q/R state machines.

## 4.3 Resolution state

Frozen V1 Resolution states:

```text
authorized
assigned
completed
```

A narrow audited `cancelled` recovery state may exist only if implementation review proves a real pre-completion operational recovery need; it must not be used as a financial settlement state or as an easy undo for consumed material.

Recommended boundary:

- Q approval atomically creates exactly one minimal Resolution/Entitlement row in `authorized` state.
- Q does not populate performing Center, replacement Roll or completion data.
- R exclusively owns transitions beyond `authorized`.

This gives the Q→R handoff a durable database contract without implementing R prematurely.

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
- if an open Claim exists, verified customer sees its narrow status instead of a second submit form.

For an effective **expired** Warranty:

- no new Claim submission;
- verified customer may still follow a Claim that was submitted while coverage was active.

For non-effective/no-current/unavailable states:

- no new Claim submission;
- do not expose internal historical Claim data through anonymous public state.

## 5.3 Phone verification

Verification compares the submitted normalized phone to the phone stored on the authoritative effective Warranty.

The server must not return the stored phone to the browser for comparison.

No verification endpoint may become a phone-based Warranty lookup oracle.

Repeated invalid phone attempts must fail in a generic bounded way; implementation may use ordinary platform/server abuse controls without creating a bespoke fraud engine in P.

## 5.4 Customer-visible Claim projection

After successful phone verification, return only the minimum customer service projection.

Possible derived customer statuses include:

- `تم استلام المطالبة`;
- `قيد المراجعة`;
- `مطلوب فحص بالمركز`;
- `تم قبول المطالبة وجارٍ ترتيب المعالجة`;
- `تم رفض المطالبة`;
- `تم إلغاء المطالبة`;
- `تم تنفيذ المعالجة`.

These labels are a presentation projection; they do not create another persisted state machine.

---

# 6. Evidence architecture

Claims use a new private evidence boundary separate from Product assets and Pre-install Issue evidence.

Recommended bucket responsibility:

`warranty-claim-evidence`

V1 file contract:

- images only;
- bounded formats validated server-side and by Storage policy where possible;
- bounded count and per-image/aggregate size frozen in Cube P implementation Spec;
- no video;
- no public bucket;
- no customer-readable raw object listing;
- no direct anonymous object enumeration.

## 6.1 Submission atomicity vs Storage

Storage bytes and business rows are not one PostgreSQL transaction. The architecture therefore uses a safe two-boundary model:

1. customer is successfully phone-verified for one exact effective Warranty;
2. required images are uploaded into a private, random, short-lived/staged intake path through a bounded server-authorized upload path;
3. final authoritative Claim submission validates that every referenced staged image belongs to that exact intake context and meets the frozen evidence contract;
4. one database transaction creates Claim + Claim Number + evidence metadata references + initial Claim event + durable notification materialization inputs;
5. only the committed Claim owns those evidence references.

A failed final submission must never leave a visible `submitted` Claim with missing required evidence.

Orphaned unreferenced staging objects are not domain Claims. Implementation should use best-effort compensation and bounded cleanup without introducing a cron/ticket subsystem solely for V1 intake.

---

# 7. Internal review and inspection architecture

## 7.1 Company Claim queue

Cube Q provides Admin with one Claims work queue using the existing `/operations` authenticated shell.

The queue is Company/Admin only in V1.

It must be useful on mobile and must not depend on wide desktop tables.

## 7.2 Review context

Admin Claim detail composes, through bounded reads:

- Claim facts and evidence;
- Warranty Number/status;
- coverage start/end and submit-time eligibility;
- Product identity snapshot;
- Warranty coverage/care snapshot;
- customer/vehicle data needed for review;
- activating Center snapshot;
- previous closed Claims/service history for the same Warranty;
- inspection result when present;
- immutable timeline.

Current Product policy edits must not replace the Warranty policy snapshot used for adjudicating the historical Warranty.

## 7.3 One formal V1 inspection

A Claim may have at most one formal inspection record in V1.

Inspection current state:

```text
requested
submitted
```

Admin may reassign the **same** pending inspection to another active Center with a mandatory reason and immutable event. Reassignment is not a second inspection loop.

Assigned Center can read only the Claim facts/evidence necessary to perform the requested technical inspection. It must not receive unrelated customer history, internal Admin notes or decision controls.

Center inspection submission requires:

- technical observation/note;
- affected area confirmation;
- private inspection image evidence;
- authoritative Center actor/time.

Submission returns the Claim to `under_review` for Company decision.

---

# 8. Decision architecture

Only active Admin/Company may decide.

## `approved`

Atomic consequences:

- Claim status → `approved`;
- final decision fields/events persisted;
- `closed_at` remains null;
- exactly one minimal Resolution/Entitlement row is created in `authorized` state;
- customer-visible status becomes approved / processing;
- notification materialization follows the frozen event policy.

No Roll, Center execution assignment, Warranty mutation or Transfer occurs automatically.

## `rejected`

Atomic consequences:

- Claim status → `rejected`;
- final decision fields/events persisted;
- `closed_at` set;
- no Resolution created.

## `cancelled`

V1 is an Admin-only bounded correction/closure path for cases such as confirmed duplicate, submitted-in-error or customer withdrawal communicated through ordinary support.

It requires a reason/event and sets `closed_at`.

It is not a substitute for rejection and cannot be used after material has been consumed in R.

---

# 9. Resolution / fulfillment architecture

## 9.1 Remedy kinds

V1 intentionally needs only the PPF operational remedies already established by the approved flow:

- `reinstall_only` — approved corrective installation/service without consuming a new Protection Giants Roll;
- `replacement_roll_reinstall` — consume one replacement physical Roll as Claim fulfillment and reinstall.

Do not add money/refund/credit remedy types.

A future materially different product remedy requires an explicit Product Decision.

## 9.2 Performing Center

Admin assigns one operationally active Center.

The original activating Center may be used but is not mandatory.

If an assigned Center becomes inactive before completion, Admin may reassign the unresolved Resolution with reason/event, subject to material-allocation rules below.

No Center can assign itself to arbitrary Claims.

## 9.3 Replacement Roll movement

The existing Custody/Transfer engine remains authoritative.

R does **not** auto-transfer a Roll when a Claim is approved or a Center is assigned.

If the desired replacement Roll is not already in confirmed custody of the performing Center, Company/ordinary authorized parties use the existing Transfer workflow explicitly. After confirmed receipt, R may allocate the Roll to the Resolution.

This ordering deliberately avoids teaching the Transfer engine to carry a special pre-reserved Claim Roll across custody boundaries.

## 9.4 Replacement Roll allocation

Before allocation, the authoritative R mutation revalidates at minimum that the Roll:

- belongs to a generated/non-voided Production source;
- is not already terminally consumed/unavailable;
- has no effective customer Warranty;
- is not already opened into the normal customer-Warranty path;
- is not blocked by unresolved Pre-install Issue/Recovery state;
- has no active pending Transfer reservation;
- is not allocated to another Claim Resolution;
- is confirmed current custody of the assigned performing Center.

Allocation creates an exclusive reservation state:

```text
reserved
released   (before use only)
consumed
```

Only one active `reserved` allocation may exist per Roll.

### While `reserved`

Normal Transfer, normal Roll Opening and Warranty Activation must fail closed for that Roll.

To move/reassign material, release the allocation explicitly first; then ordinary Transfer may occur.

### When `consumed`

The Roll is permanently Claim Fulfillment material.

It must be blocked from:

- Warranty Activation;
- ordinary Roll Opening/Recovery paths;
- future Claim allocation;
- ordinary Transfer inventory;
- reuse as available stock.

Its own Cube N public Warranty resolver must derive terminal `unavailable_for_warranty` when no effective Warranty exists.

Confirmed custody history remains the existing operational history; consumption does not invent a fake customer Operational Party or automatic custody transfer to the vehicle/customer.

---

# 10. Resolution completion

A Resolution may complete only when its remedy-specific prerequisites are satisfied.

## `reinstall_only`

Requires:

- assigned active performing Center at execution time;
- completion note;
- bounded private completion image evidence;
- Center completion actor/time;
- Admin confirmation only if the final Cube R implementation review proves it is necessary to prevent a real authority gap. Do not add a second approval step by default.

## `replacement_roll_reinstall`

Requires additionally:

- exactly one Claim Roll allocation;
- Roll allocation transitioned to `consumed` in the same authoritative completion boundary or in a prior explicit use step that cannot be undone;
- no second Warranty created for the replacement Roll.

Final completion atomically:

- Resolution → `completed`;
- completion event persisted;
- Claim `closed_at` set;
- original Warranty remains issued with unchanged coverage timestamps;
- service history becomes visible through bounded Warranty/Claim reads;
- customer status derives `تم تنفيذ المعالجة`.

---

# 11. Warranty compatibility rules

## Original Warranty

Claims never extend, restart or replace original coverage timestamps.

## Warranty `voided_in_error`

Cube M void mutation must be extended at Q/R integration time to reject while an open Claim (`closed_at is null`) exists.

No automatic Claim cancellation is permitted.

## Natural Warranty expiry

Expiry blocks **new** Claim creation but never terminates a previously valid open Claim.

## Warranty corrections

Cube M bounded customer/vehicle correction remains possible only if it does not violate Claim evidence/history integrity. Implementation review must ensure Claim reads use the current corrected customer/vehicle fields where those are legitimately mutable, while immutable Product/Center/policy snapshots remain historical.

---

# 12. Cross-cube Roll compatibility matrix

| Operation on physical Roll | Normal Roll | Claim-allocated `reserved` Roll | Claim `consumed` Roll |
| --- | --- | --- | --- |
| ordinary Transfer | existing rules | blocked until explicit allocation release | blocked |
| Roll Opening | existing rules | blocked | blocked |
| Pre-install Issue | existing rules | blocked from entering normal pre-Warranty path | blocked |
| Warranty Activation | existing rules | blocked | blocked |
| Claim allocation | eligible if all R rules pass | same Resolution only | blocked |
| Cube N public Warranty state | existing resolver | transient hold not publicly disclosed | `unavailable_for_warranty` if no effective Warranty |

R implementation owns the **minimal compatibility guards** required to enforce this table. It must not redesign completed Transfer/Open/Activation engines.

---

# 13. Notification contract

Claims reuse Cube L's four-way separation:

- domain truth;
- durable Inbox;
- attention policy;
- best-effort Push.

Recommended V1 event catalog:

| Event | Recipient | Inbox | Push intent |
| --- | --- | --- | --- |
| Claim submitted | active Admin profiles | yes | action-required |
| Inspection requested/reassigned | assigned Center profiles | yes | action-required |
| Inspection submitted | active Admin profiles | yes | action-required |
| Claim approved/rejected/cancelled | internal relevant profiles; customer uses verified page, not Web Push | yes where authenticated recipient exists | bounded |
| Resolution assigned/reassigned | performing Center profiles | yes | action-required |
| Replacement material ready/allocated | relevant Center/Admin only when action is required | yes | bounded |
| Resolution completed | Admin + performing Center as relevant | yes | informational/bounded |

Customer SMS/email/WhatsApp notifications are not introduced by P/Q/R.

---

# 14. Security and privacy invariants

1. Anonymous role never gets direct `SELECT`/mutation access to Claims, Claim evidence, inspections, resolutions or allocations.
2. Customer actions use narrow server/RPC boundaries bound to Public Code resolution + registered phone verification.
3. Claim Number is never an authorization credential.
4. Direct Data API mutations must not bypass lifecycle RPCs/server actions.
5. Evidence buckets remain private and object paths must not contain raw phone, VIN, customer name or public code.
6. Admin gets Company-wide Claim authority; Center receives only specifically assigned inspection/fulfillment access.
7. Agent/Dealer receive no V1 Claim decision access unless a future Product Decision explicitly introduces it.
8. Notification payloads remain privacy-safe and do not place Claim evidence/customer PII on lock screens.
9. All authoritative state transitions write immutable domain events/audit evidence.
10. Concurrency-sensitive mutations lock the authoritative Claim/Warranty/Roll rows in deterministic order and revalidate current truth in the transaction rather than trust stale UI state.

---

# 15. Concurrency / race scenarios that must be permanently tested

The P/Q/R quality gate must include at least:

- two simultaneous customer submissions for one Warranty → exactly one open Claim;
- Warranty expires between form load and submit → authoritative submit rejects new Claim;
- Claim submits just before expiry → committed valid Claim survives later expiry;
- Admin decision attempted twice → one deterministic terminal decision;
- inspection submission races reassignment → only the current valid assignment wins;
- Warranty void-in-error races Claim submission → deterministic valid winner, never voided Warranty + open Claim contradiction;
- Warranty void-in-error races approved/incomplete Resolution → void blocked;
- two Resolutions attempt to allocate same Roll → one winner;
- Claim allocation races ordinary Transfer/Roll Opening/Warranty Activation → one valid owner of the Roll lifecycle;
- allocation release races material consumption → consumed state cannot be resurrected;
- Resolution completion races second Claim submission → either old Claim closes then later submission may evaluate normally, or second submission sees the open-case lock; no overlap;
- replacement Roll consumed then public Warranty resolver queried → terminally unavailable, never `not_activated` eligible behavior.

---

# 16. Cube boundaries

## Cube P — Customer Warranty Claim Intake

Owns only:

- Claim schema foundation + Claim Number;
- open-case invariant foundation;
- issue taxonomy;
- customer phone verification boundary;
- required private intake image evidence;
- customer submit flow;
- `submitted` state + initial event;
- narrow verified customer Claim read/status;
- Admin new-Claim notification materialization.

Does not own Admin review, inspection, final decision, Resolution or replacement Roll.

## Cube Q — Claim Review, Inspection & Decision

Owns:

- Admin Claims queue/detail;
- `under_review` / `awaiting_inspection` transitions;
- one formal inspection + reassignment;
- Center inspection UI/evidence submission;
- Company decision `approved | rejected | cancelled`;
- `closed_at` on rejected/cancelled;
- minimal one-to-one `authorized` Resolution/Entitlement creation on approval;
- Warranty void-in-error open-Claim guard;
- decision/inspection notifications and timeline.

Does not own performing Center assignment for remedy, Roll allocation/consumption, reinstall completion or finance.

## Cube R — Approved Claim Resolution / Replacement & Reinstall

Owns:

- authorized Resolution processing;
- remedy kind;
- performing Center assignment/reassignment;
- replacement Roll candidate/read boundary;
- allocation reservation/release/consumption;
- minimal compatibility guards in Transfer / Opening / Activation / Public Warranty resolver;
- service/reinstall completion evidence;
- Resolution completion;
- Claim `closed_at` finalization;
- Warranty service history projection;
- customer resolved status;
- fulfillment notifications.

Does not own finance, automatic Warranty renewal, new customer QR, or generic aftersales/ticket system.

---

# 17. Implementation sequence and gates

## Stage 1 — P

1. re-fetch latest `main`;
2. freeze P Spec against exact base;
3. implement only P;
4. database/RLS/storage/security review;
5. hosted customer mobile acceptance;
6. independent second review;
7. merge P.

P alone is **not** Production Claims launch approval.

## Stage 2 — Q

Repeat from updated `main`. Revalidate P contracts and Cube M void compatibility. Merge only after Q-specific quality gate and independent review.

P+Q still do not authorize Production launch of approved Claims if R fulfillment is required operationally.

## Stage 3 — R

Repeat from updated `main`. Revalidate Transfer/Open/Activation/Public Warranty compatibility. Qualify full end-to-end scenario including a real replacement-material flow in Staging.

## Macro GO gate

Claims V1 becomes operationally complete only after:

- P quality gate PASS;
- Q quality gate PASS;
- R quality gate PASS;
- full end-to-end Customer Warranty → Claim → optional Inspection → Decision → Resolution scenario PASS;
- security/privacy review PASS;
- no dead-end state from Center suspension, Warranty expiry, Roll allocation or failed Transfer;
- existing Cube M/N/L and relevant Transfer/Open/Activation regressions remain PASS.

---

# 18. Explicit architecture non-goals

Do not add during P/Q/R unless a new Product Decision requires it:

- generic ticket/helpdesk engine;
- multi-step arbitrary workflow builder;
- comments/chat;
- customer account/OTP;
- manual public claim search;
- AI decision automation;
- agent/dealer adjudication;
- SLA/escalation engine;
- finance/accounting/invoicing;
- refund/credit remedy types;
- automatic Transfer;
- replacement inventory separate from physical Rolls;
- renewed Warranty after replacement;
- new customer QR/public identity;
- video evidence;
- background/cron processes when an explicit synchronous lifecycle action is sufficient.

The design intentionally remains narrow: it completes the physical Product/Warranty service lifecycle without turning Protection Giants into an ERP or generic support suite.
