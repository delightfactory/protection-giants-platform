# Cube Q — Claim Review, Inspection & Decision

**Status:** DRAFT FOR FINAL PRODUCT / ENGINEERING REVIEW — product decisions are APPROVED/FROZEN  
**Version:** 1.1  
**Planning baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Implementation base:** must be the merged Cube P HEAD, not the planning baseline above  
**Depends on:** Cube P Customer Warranty Claim Intake, Cube M Warranty Activation/Admin support, Cube L Notifications/PWA, Center identity/access foundation  
**Consumes but does not redefine:** `docs/claims-product-decisions-amendment.md`, `docs/claims-pqr-master-architecture.md`  
**Primary responsibility:** let Protection Giants Company review a submitted Claim, optionally obtain one formal Center inspection, and make one authoritative audited final decision while creating only the minimal durable handoff to Cube R.

---

# 1. Purpose

Cube Q answers:

> **Is this Warranty Claim accepted by Protection Giants?**

Company may decide from submitted evidence or request one formal physical inspection.

Normal adjudication outcomes are:

- `approved`;
- `rejected`;
- `cancelled`.

Approved Claim remains open end-to-end (`closed_at is null`) because fulfillment is pending. Approval creates one `authorized` Resolution header only.

Q also owns one narrow administrative correction for an approval made in error **before fulfillment starts**. It is not a generic Undo.

---

# 2. Inherited rules

1. Claim belongs to one Warranty fixed at P submission.
2. Claim Number remains permanent/non-secret.
3. Customer submission/evidence immutable.
4. Warranty issuance policy snapshot, not current Product edits, is review context.
5. Natural Warranty expiry after valid submission does not invalidate Claim.
6. Company/Admin alone decides.
7. Center is technical evidence provider only.
8. One formal inspection max; reassignment changes assigned Center, not inspection count.
9. Rejected/cancelled Claim closes; approved stays open until R completion unless the narrow pre-execution approval-in-error correction applies.
10. No financial responsibility/settlement is represented by decision.

---

# 3. Scope

## In scope

- Admin Claims queue/detail under `/operations`;
- `submitted → under_review`;
- optional `under_review → awaiting_inspection`;
- one inspection assignment/reassignment;
- Center inspection UI/evidence;
- `awaiting_inspection → under_review` after inspection submission;
- Company `approved | rejected | cancelled`;
- bounded cancellation while inspection pending;
- bounded `approved → cancelled` correction only while Resolution remains untouched `authorized`;
- decision reason/customer-safe message;
- one-to-one minimal `authorized` Resolution row on approval;
- `closed_at` for rejection/cancellation/correction;
- Cube M Warranty void guard while Claim open;
- Q events/timeline/notifications;
- verified customer status extension.

## Out of scope

- remedy kind;
- performing Center for remedy;
- replacement Roll selection/reservation;
- Transfer/receipt;
- Roll consumption;
- reinstall completion;
- finance;
- chat/comments;
- repeated evidence loops;
- multiple inspections;
- AI scoring/decision;
- Agent/Dealer decision authority;
- cancellation/undo once R has assigned the Resolution.

---

# 4. Admin queue

Recommended:

`/operations/claims`

Protected detail may use Claim Number as locator, e.g. `/operations/claims/[claimNumber]`; authorization never depends on knowing that number.

Queue shows only useful V1 context:

- Claim Number;
- adjudication status;
- submitted time;
- Product snapshot;
- vehicle make/model;
- activating Center snapshot;
- inspection pending/submitted;
- elapsed time display.

Filters: open/closed, status, recent ordering. No priority/SLA/owner/search-builder subsystem.

Mobile-first cards/compact rows; no wide-table dependency.

---

# 5. Admin Claim detail

Bounded Company read composes:

## Claim

Claim Number, category, affected area, description, submitted time, images, status, timeline.

## Warranty

Warranty Number/state, activation/end date, Product code/name/version snapshot, full coverage/care snapshot, activating Center identity/name snapshot, customer contact, vehicle data, legitimate Cube M corrections.

## History

Earlier closed Claims for same Warranty and, once R exists, service history.

Current mutable Product policy must never replace Warranty snapshot during adjudication.

---

# 6. Claim transitions

## 6.1 Start review

`submitted → under_review`

Named mutation such as `start_warranty_claim_review(...)`.

Requires active Admin, open Claim, exact current status, intact Warranty relationship. Natural expiry does not block.

Same-request retry idempotent; matching immutable event in same transaction.

## 6.2 Request inspection

`under_review → awaiting_inspection`

Creates the single formal inspection + matching event atomically.

## 6.3 Inspection submission

`awaiting_inspection → under_review`

Same business boundary marks inspection submitted, commits evidence metadata/event and Admin notification.

## 6.4 Approval / rejection

Allowed from `under_review` only.

## 6.5 Bounded cancellation before approval

Allowed from:

- `under_review`; or
- `awaiting_inspection`.

For duplicate, submitted-in-error or customer withdrawal communicated through ordinary support.

Cancellation while inspection pending closes Claim immediately; requested inspection remains historical but is non-actionable because Center access requires parent Claim open + awaiting inspection.

## 6.6 Narrow approval-in-error correction

Allowed:

`approved → cancelled`

**only** when all are true at commit time:

1. active Admin;
2. Claim still open;
3. Claim current status exactly `approved`;
4. exactly one Resolution exists for Claim;
5. Resolution status exactly `authorized`;
6. no performing Center/remedy/Roll/completion work has been added by R;
7. mandatory correction reason + customer-safe message;
8. no competing R assignment committed first.

Effects:

- Claim → `cancelled`;
- `closed_at` set;
- final cancellation projection fields set;
- append immutable `approval_cancelled_before_execution` event that preserves reference to prior approval event/time in private event data;
- original `approved` event remains immutable;
- `authorized` Resolution row is **not deleted or mutated into a fake state**; it becomes historical/non-actionable because parent Claim is cancelled/closed;
- customer verified projection becomes cancelled.

There is no such correction after Resolution becomes `assigned`. This mirrors existing project correction philosophy without creating a general Undo/reopen capability.

---

# 7. Inspection persistence

## `warranty_claim_inspections`

Logical shape:

```text
- id UUID PK
- claim_id UUID NOT NULL UNIQUE
- status TEXT NOT NULL DEFAULT 'requested'
- assigned_center_party_id UUID NOT NULL
- requested_by_profile_id UUID NOT NULL
- requested_at TIMESTAMPTZ NOT NULL
- submitted_by_profile_id UUID NULL
- technical_observation TEXT NULL
- suspected_cause TEXT NULL
- submitted_at TIMESTAMPTZ NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
```

Statuses only:

```text
requested
submitted
```

Rules:

- zero/one inspection per Claim;
- observation required on submit, target 10–3000 chars;
- suspected cause optional note, not taxonomy/auto-decision;
- request actor/time immutable;
- assigned Center changes only via Admin reassignment while inspection requested + parent Claim open/awaiting;
- submitted facts/evidence immutable;
- requested inspection under a later-cancelled Claim is historical/non-actionable.

## Inspection evidence

Use `warranty_claim_inspection_evidence` metadata + same private `warranty-claim-evidence` bucket:

- minimum 1 image;
- max 5;
- max 8 MiB/image;
- JPEG/PNG/WebP;
- no video;
- server-controlled staging/compensation.

---

# 8. Inspection Center selection/reassignment

Default UI proposes original activating/installing Center if active, but Admin explicitly confirms.

Another operationally active Center may be selected; network approval badge is not an inspection-authority requirement.

Pending reassignment requires:

- inspection requested;
- parent Claim open + awaiting inspection;
- new Center active/different;
- reason 5–500 chars.

Update assigned Center + immutable `inspection_reassigned` event. Old Center loses access; new Center notified. No reassignment after submission/parent closure.

---

# 9. Center inspection access

Center may read/submit only when:

1. authenticated active Profile;
2. role center;
3. bound Center active;
4. current party = assigned Center;
5. inspection requested;
6. Claim awaiting inspection + open.

Narrow read may include Claim Number, Product/vehicle identity needed to inspect correct car, affected area, description, customer images, Warranty coverage/care context and instructions.

Do not expose unrelated Claim history, Admin notes/reasons, replacement inventory, decision controls or unnecessary PII.

---

# 10. Inspection submission

`submit_warranty_claim_inspection(...)`

Requires exact assigned Center, valid observation + ≥1 image, parent Claim still open/awaiting, inspection still requested, no reassignment/cancellation race winner.

Atomic:

- inspection submitted;
- technical fields/actor/time;
- evidence metadata;
- Claim → under_review;
- `inspection_submitted` event;
- Admin notification.

---

# 11. Decision projection

Q adds bounded fields to `warranty_claims`:

```text
- decided_by_profile_id UUID NULL
- decision_reason TEXT NULL
- customer_decision_message TEXT NULL
- decided_at TIMESTAMPTZ NULL
```

Normal terminal decision requires all fields. Suggested bounds 5–1000 chars for reason/message.

The immutable event stream is the full audit truth when a prior approval is later superseded by the bounded pre-execution cancellation correction. Current Claim fields represent current final customer/operational projection.

No price/cost/reimbursement/payer fields.

---

# 12. Final decision mutations

Prefer explicit operations:

- `approve_warranty_claim(...)`;
- `reject_warranty_claim(...)`;
- `cancel_warranty_claim(...)`.

All active-Admin-only + idempotent request ID.

## Approve

From under_review/open/no actionable pending inspection.

Atomic:

1. Claim approved;
2. decision fields;
3. approved event;
4. `closed_at` stays null;
5. exactly one Resolution header `authorized`;
6. notifications.

Expiry after submission is not blocker. No Warranty/Center/Roll/Transfer side effect.

## Reject

From under_review/open.

Atomic Claim rejected + fields/event + `closed_at`; no Resolution.

## Cancel

- from under_review or awaiting_inspection for ordinary bounded closure; or
- from approved only under section 6.6 untouched-authorized correction rules.

Never directly from submitted; Company must start review.

No deletion of Claim, inspection, approval event or Resolution history.

---

# 13. Minimal Q→R Resolution handoff

Q creates:

```text
warranty_claim_resolutions
- id UUID PRIMARY KEY
- claim_id UUID NOT NULL UNIQUE
- status TEXT NOT NULL DEFAULT 'authorized'
- authorized_by_profile_id UUID NOT NULL
- authorized_at TIMESTAMPTZ NOT NULL
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
```

At Q completion:

- Q creates only `authorized`;
- no remedy;
- no performing Center;
- no Roll;
- no finance;
- no completion.

Direct update/delete denied.

If Claim is later corrected `approved → cancelled` before execution, this row remains untouched historical and R must reject/list it as non-actionable because parent Claim is no longer approved/open.

---

# 14. Warranty void compatibility

Cube M Admin `voided_in_error` path must reject whenever:

```text
exists warranty_claims
where warranty_id = target
  and closed_at is null
```

No automatic Claim/inspection/Resolution cancellation.

Warranty void vs Claim creation/decision/correction must share compatible locking so no voided Warranty + open Claim contradiction commits.

---

# 15. Claim events added by Q

- `review_started`;
- `inspection_requested`;
- `inspection_reassigned`;
- `inspection_submitted`;
- `approved`;
- `rejected`;
- `cancelled`;
- `approval_cancelled_before_execution`.

Every transition/reassignment writes matching immutable event in same DB transaction.

Pending-inspection cancellation does not fake inspection submission. Approval correction preserves original approved event.

---

# 16. Notifications

Reuse Cube L.

- inspection requested/reassigned → assigned Center action-required;
- inspection submitted → Admin action-required;
- cancellation while inspection pending → Center task disappears; concise informational Inbox only if needed to neutralize prior Push confusion;
- final decision/correction → bounded internal notification, no self-success noise;
- anonymous customer uses verified page; no SMS/email/WhatsApp.

---

# 17. Verified customer projection

- under_review → `قيد المراجعة`;
- awaiting_inspection → `مطلوب فحص بالمركز` + customer-safe assigned Center identity/contact/navigation already allowed publicly;
- approved → `تم قبول المطالبة وجارٍ ترتيب المعالجة` + customer-safe decision message;
- rejected → `تم رفض المطالبة`;
- cancelled → `تم إلغاء المطالبة`.

Approval-in-error correction updates customer projection to cancelled; no internal correction reason/actor exposed.

---

# 18. Authorization

## Admin

List/read/start review/request/reassign inspection/read evidence/decide/correct-before-execution.

## Center

Only currently assigned actionable inspection. No Company queue, other Claims, decision, Resolution creation or replacement inventory.

## Agent/Dealer

No Q Claim authority.

## Anonymous

No direct Q table/Storage access; customer stays behind P verified projection.

---

# 19. Hard/race cases

Test:

1. two Admins start review;
2. decision vs inspection request;
3. inspection submit vs reassignment;
4. inspection submit vs cancellation;
5. conflicting final decisions;
6. approve retry → one Resolution;
7. reject/cancel race;
8. approval-in-error cancellation vs R assignment → one winner;
9. correction retry idempotent;
10. correction denied once Resolution assigned;
11. Warranty void vs open Claim/decision;
12. expiry during review does not stop decision;
13. Center suspension → reassignment path;
14. cancelled parent Claim exposes no active Center task;
15. approved Claim remains open and blocks second Claim until R or bounded correction closes it.

---

# 20. Required tests

## Database/state

- transition constraints;
- approve/reject from under_review only;
- ordinary cancellation from under_review/awaiting_inspection;
- approved→cancelled only when Resolution untouched authorized;
- terminal audit preservation;
- one inspection;
- reassignment constraints;
- one Resolution per approved Claim;
- rejected/cancelled set closed_at;
- approved leaves it null;
- no Resolution for normal reject/cancel;
- historical authorized Resolution after approval correction is non-actionable;
- Warranty void guard.

## Authorization

- Agent/Dealer denied;
- Center assigned inspection only;
- old Center denied after reassignment;
- Center denied after parent cancellation;
- suspended Center denied;
- Admin-only decision/correction;
- private evidence authorization.

## UX

- mobile Admin queue/detail;
- correct Warranty snapshot context;
- direct decision;
- inspection request/reassignment;
- cancellation during pending inspection;
- approval-in-error correction before R assignment with explicit confirmation;
- correction unavailable after R assignment;
- Center mobile evidence flow;
- verified customer decision status.

## Regression

P intake/open-case, Cube M support+void guard, Cube N minimal public projection, Cube L notifications, Center approval badge independence.

---

# 21. Definition of Done

Q GO requires:

1. implementation base = merged/qualified P main;
2. Admin queue/detail/review works;
3. direct decision path works;
4. one formal inspection + reassignment works;
5. pending-inspection cancellation has no dead end;
6. assigned active Center submits technical evidence but cannot decide;
7. approved/rejected/cancelled decisions audited;
8. rejection/cancellation close Claim;
9. approval leaves Claim open + creates exactly one authorized Resolution;
10. approval made in error can be corrected only while Resolution untouched authorized, preserving history;
11. same correction impossible after R assignment;
12. no remedy/Transfer/Roll/finance leaks into Q;
13. Cube M void blocked by open Claim;
14. customer verified projection safe;
15. notifications use Cube L without noise;
16. PR Quality + Database Quality + P Quality + **Cube Q Claim Decision Quality** PASS exact SHA;
17. hosted Admin/Center mobile acceptance includes direct decision, inspection, reassignment, pending-inspection cancellation, approval-correction race;
18. independent engineering/security/operational audit PASS.

Q remains an intermediate macro milestone; Claims is not end-to-end complete until R.
