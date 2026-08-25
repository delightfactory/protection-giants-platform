# Protection Giants — Claims P/Q/R Final Specification Review Amendment

**Status:** FINAL SPEC AUDIT PASS WITH BOUNDED CORRECTIONS — FROZEN FOR SEQUENTIAL IMPLEMENTATION  
**Date:** 2026-08-25  
**Reviewed branch:** `docs/claims-pqr-architecture-specs`  
**Reviewed branch HEAD before this amendment:** `ece03a70f1fb65177a2922762d7bfff8fd94b28d`  
**Planning baseline / current `main`:** `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Applies to:** Cube P — Customer Warranty Claim Intake; Cube Q — Claim Review, Inspection & Decision; Cube R — Approved Claim Resolution / Replacement & Reinstall  
**Reviewed against:** Claims Product Decisions PD-063–PD-076, Claims P/Q/R Master Architecture, Cube J Roll Opening/Recovery, Cube K Pre-install Issue, Cube L Notification/PWA materialization, Cube M Warranty Activation/Admin support, Cube N Public Warranty resolver, Transfer/Custody, Production void guards, Development Governance, Mobile-Native Interface Standard.

---

# 1. Final review conclusion and precedence

The coordinated Claims architecture is sound and may be frozen for implementation **one Cube at a time**.

The audit found no reason to redesign the core decomposition:

```text
Warranty → Claim → Resolution/Fulfillment
```

and no reason to merge P, Q and R into one implementation batch.

The review did identify several bounded integration/dead-end corrections that are required before implementation. They are captured normatively in this amendment.

This document has **canonical precedence for Claims P/Q/R wherever it explicitly corrects or clarifies**:

- `docs/claims-product-decisions-amendment.md`;
- `docs/claims-pqr-master-architecture.md`;
- `docs/cube-p-customer-warranty-claim-intake-spec.md`;
- `docs/cube-q-claim-review-inspection-decision-spec.md`;
- `docs/cube-r-claim-resolution-replacement-reinstall-spec.md`.

Their older DRAFT/FOR REVIEW header wording becomes historical planning wording once this amendment is merged. The five documents plus this amendment form one frozen specification package.

No implementation code, database migration, deployment change or Production release authorization is created by this audit.

---

# 2. Final macro lifecycle

The frozen V1 path is:

```text
Effective active Warranty
        ↓
Public Code + current registered-phone verification
        ↓
Claim submitted while Warranty active
        ↓
Company review
   ┌────┴──────────────┐
   │ evidence enough   │ physical inspection needed
   ↓                   ↓
Company decision   assigned active Center inspection
   │                   ↓
   └────────────── Company review
                       ↓
                 final adjudication
       ┌───────────────┴─────────────────┐
       ↓                                 ↓
rejected / cancelled                  approved
       ↓                                 ↓
Claim closed                    Resolution authorized
                                         ↓
                              performing Center assigned
                                         ↓
                         service/reinstall OR replacement
                                         ↓
                       optional ordinary Roll Transfer
                                         ↓
                           replacement Roll allocation
                                         ↓
                           real Cube J Roll Opening
                                         ↓
                      optional Cube K pre-install issue
                                         ↓
                              physical service completed
                                         ↓
                         Resolution completed / Claim closed
                                         ↓
                              Warranty service history
```

Two bounded correction branches exist and are not generic workflow features:

- wrong adjudication before fulfillment may be corrected under section 5;
- an already-approved Resolution may be closed without false completion when the customer withdraws after fulfillment assignment under section 7.

---

# 3. Canonical Product Decision additions from Final Audit

The following decisions extend PD-063–PD-076 and are frozen by this review.

## PD-077 — Claim phone verification always follows the current corrected Warranty phone
**Status:** Approved/frozen by Final Spec Audit — 2026-08-25

The phone used to authorize customer Claim actions is the **current** `warranties.customer_phone` after any legitimate audited Cube M correction.

A short-lived Claim verification context created before an Admin changes the Warranty phone becomes invalid for further Claim upload, submit or private Claim-status access after that change.

Implementation must not persist or expose the raw phone merely to detect freshness. A server-controlled keyed fingerprint/HMAC of the normalized current phone may be bound to the short-lived verification context. Every sensitive use re-compares it to the current Warranty phone under the appropriate authoritative boundary.

If Claim submission commits before a later legitimate phone correction, the Claim remains valid. Future customer Claim access uses the newly corrected Warranty phone.

This does not add OTP, accounts, SMS or a customer identity subsystem.

## PD-078 — A wrong rejected or ordinary-cancelled Claim may be reopened through one bounded audited correction
**Status:** Approved/frozen by Final Spec Audit — 2026-08-25

Company/Admin must be able to correct an erroneous **rejection** or an ordinary **pre-approval cancellation** without forcing the customer to create a replacement Claim that may no longer be eligible after natural Warranty expiry.

A Claim may therefore be corrected from:

```text
rejected → under_review
cancelled → under_review
```

only when all are true:

- active Protection Giants Admin performs the correction;
- the Claim was originally submitted validly while the Warranty was active;
- it is the latest Claim for that Warranty and **no later Claim exists**;
- no Resolution row exists for that Claim;
- the cancellation being reopened was an ordinary pre-approval cancellation, not the special `approved → cancelled` correction that preserved an authorized Resolution;
- a mandatory reason is recorded;
- immutable prior decision events remain untouched.

The correction sets `closed_at` back to null, clears the current decision projection fields needed to resume review, and appends an immutable `decision_reopened_for_correction` event containing a private snapshot/reference of the superseded decision.

Natural Warranty expiry after the original valid Claim submission does not prevent this correction.

This is **not** a generic reopen after fulfillment, consumed material, completed Resolution, or an approval-in-error cancellation with historical Resolution.

## PD-079 — Customer withdrawal after Resolution assignment closes fulfillment without undoing Claim approval
**Status:** Approved/frozen by Final Spec Audit — 2026-08-25

Once an approved Claim has entered Cube R and the Resolution is already `assigned`, the Claim approval is no longer undone merely because the customer later declines/withdraws the authorized physical service.

To avoid falsely recording unperformed service as completed, Cube R has a narrow terminal Resolution outcome:

```text
cancelled
```

It means only:

> the accepted Claim's authorized physical fulfillment was closed without completion because the customer declined/withdrew the service after execution assignment.

Rules:

- active Admin only;
- documented customer withdrawal/decline required;
- mandatory internal reason and bounded customer-safe message;
- no material may already be `consumed`;
- any still-`reserved` replacement Roll allocation must be explicitly released first;
- no hidden Transfer/custody/financial side effect;
- Resolution becomes terminal `cancelled`;
- Claim remains adjudication status `approved`;
- Claim `closed_at` is set;
- original Warranty remains unchanged;
- immutable Resolution event is appended.

Before R assignment, the existing Q `approved → cancelled` approval-in-error/customer closure path remains the appropriate bounded path while the Resolution is untouched `authorized`.

Resolution cancellation is not rejection, refund, credit, Warranty cancellation or accounting settlement.

---

# 4. Cube P final corrections

## 4.1 Verification-context freshness

Cube P's short-lived customer verification context must be bound to:

- exact Roll Public Code identity / effective Warranty;
- a server-controlled keyed fingerprint of the **normalized current Warranty phone**;
- a short expiry;
- same-origin/session safeguards appropriate to the chosen application mechanism.

Do not use a plain unsalted hash of a low-entropy phone value as if it were secret.

The context is checked again for:

- staged evidence upload authorization;
- final Claim submit;
- verified Claim-management/status reads.

Final Claim submission must lock/revalidate the Warranty row before accepting the context. Cube M phone correction and P submit therefore have one deterministic committed truth rather than stale verification acceptance.

## 4.2 Customer Claim management is Warranty-scoped, not singular-Claim-shaped

A Warranty may have multiple Claims over time. The verified customer read boundary should therefore expose a narrow Warranty-scoped management envelope, logically:

```text
{
  current_open_claim: ClaimSummary | null,
  recent_closed_claims: ClaimSummary[],
  can_submit_new_claim: boolean
}
```

P may initially return no closed history beyond what exists, but the shape must not force Q/R to replace a singular `get...claim_status` contract later.

Rules:

- active Warranty + no open Claim → `can_submit_new_claim=true`;
- active Warranty + open Claim → false and current open Claim shown;
- expired Warranty → false, but verified customer may view legitimate open and closed historical Claim/service summaries;
- anonymous bearer access alone still exposes none of this private Claim history;
- `not_activated`, `no_current_warranty_after_void`, `unavailable_for_warranty` do not create new Claim access semantics.

The history remains bounded and customer-safe; no raw evidence, internal reason, inspector diagnosis, replacement Roll identity or audit actor.

## 4.3 Claim row state-shape constraints

The Claim schema must make impossible combinations difficult to create:

- `submitted | under_review | awaiting_inspection` → `closed_at IS NULL`;
- `rejected | cancelled` → `closed_at IS NOT NULL`;
- `approved` → `closed_at` may be null while Resolution is unresolved, or non-null after R terminal completion/cancellation;
- whenever present, `closed_at >= submitted_at`.

The partial unique open-case constraint remains:

```text
UNIQUE (warranty_id) WHERE closed_at IS NULL
```

Q's bounded reopen atomically restores `closed_at=NULL`, so it naturally re-enters this same invariant and fails if a later Claim already exists.

## 4.4 Notification materialization

Claims must use the already-established Cube L model:

```text
immutable domain event
      ↓ same DB transaction
AFTER INSERT materializer/projector
      ↓
durable notification Inbox row
      ↓
best-effort Push delivery later
```

P's `submitted` Claim event is the notification source. P must not create a second direct-notification write convention.

During P-only delivery, do **not** create a dead deep link to a Q page that does not exist. `action_path` should remain null unless P implements a real authorized receipt/read destination. Q may later materialize/action existing open Claims through its queue without rewriting Claim history.

Failure of required event/projector materialization rolls back the same authoritative domain transaction. Later Push delivery failure never rolls back the Claim.

## 4.5 Customer request security

Customer Claim verification, evidence upload authorization and submit must preserve same-origin request protections appropriate to the chosen server mechanism. There is no broad anonymous Storage policy and no browser-trusted `warranty_id`, stored phone, eligibility flag or evidence ownership claim.

---

# 5. Cube Q final corrections

## 5.1 Bounded reopen for wrong reject/cancel

Cube Q adds an explicit Admin correction operation, logically:

```text
reopen_warranty_claim_decision_for_correction(...)
```

Allowed only under PD-078.

Atomic effects:

1. lock/revalidate Warranty + target Claim under the frozen serialization contract;
2. prove no later Claim exists and no Resolution exists;
3. require current status `rejected` or eligible ordinary `cancelled`;
4. set status → `under_review`;
5. set `closed_at=NULL`;
6. clear current decision projection fields needed for resumed adjudication;
7. append `decision_reopened_for_correction` event with mandatory reason and private superseded-decision reference/snapshot;
8. materialize the required operational notification through Cube L event projection.

The original rejected/cancelled event remains immutable and visible in Company audit history.

A Claim cancelled by the special `approved → cancelled` pre-execution correction has a historical Resolution and therefore fails this reopen path.

## 5.2 Inspection assignment must be actionable

A Center is not an actionable inspection destination merely because the Center entity is active.

At inspection request/reassignment commit time, require:

- operational Center active;
- at least one active Profile currently bound to that Center and authorized for the Center task.

If all actionable Center users disappear later, the Claim remains valid and Admin reassigns the same pending inspection to another actionable Center. Do not invent an inspection SLA/escalation engine.

## 5.3 Q notification source

`review_started`, `inspection_requested`, `inspection_reassigned`, `inspection_submitted`, `approved`, `rejected`, `cancelled`, `approval_cancelled_before_execution`, and `decision_reopened_for_correction` remain immutable Claim-domain events.

Cube L projectors materialize Inbox rows from those events. Do not mutate Claim state based on notification/Push outcome.

## 5.4 Warranty void serialization

P Claim creation and Cube M Warranty correction/void share the Warranty row as the first logical serialization anchor for Warranty-state-sensitive customer operations.

Cube M `voided_in_error` must continue to reject if any Claim for the Warranty has `closed_at IS NULL`.

The intended race result is always one valid committed truth, never:

```text
voided Warranty + newly open Claim
```

---

# 6. Q→R handoff remains minimal

Approval still creates exactly one Resolution header in `authorized` state and does nothing else.

Q does not choose:

- remedy;
- performing Center;
- replacement Roll;
- Transfer;
- Opening;
- quality outcome;
- completion;
- money.

The pre-execution approval-in-error correction remains valid only while that Resolution is untouched `authorized`.

Once R changes it to `assigned`, Q no longer undoes Claim approval.

---

# 7. Cube R final state/correction model

The frozen Resolution state domain is now:

```text
authorized
assigned
completed
cancelled
```

Normal path:

```text
authorized → assigned → completed
```

Customer-withdrawal recovery after R assignment:

```text
assigned → cancelled
```

`completed` and `cancelled` are terminal.

There is no generic `reopen`, `in_progress`, `waiting_stock`, `payment_pending`, scheduler or arbitrary workflow status.

## 7.1 Resolution cancellation

Admin operation, logically:

```text
cancel_assigned_claim_resolution_for_customer_withdrawal(...)
```

Preconditions:

- active Admin;
- parent Claim remains `approved` and open;
- Resolution current status exactly `assigned`;
- customer withdrawal/decline reason documented;
- no `consumed` allocation;
- no completed service;
- no `reserved` allocation remains — release it first;
- no conflicting completion committed first.

Atomic effects:

- Resolution → `cancelled`;
- cancellation actor/time/internal reason/customer-safe message persisted;
- immutable `resolution_cancelled_customer_withdrawal` event;
- Claim `closed_at` set to same authoritative time;
- notification materialization committed;
- Warranty unchanged.

Customer projection should distinguish:

> المطالبة كانت مقبولة، وتم إغلاق تنفيذ الخدمة بناءً على إلغاء/عدم رغبة العميل في استكمال المعالجة

without exposing internal operational wording or implying rejection.

---

# 8. Cube R operational corrections

## 8.1 Performing Center must have an actionable user

Initial assignment and reassignment require both:

- active operational Center; and
- at least one active bound Center Profile capable of the fulfillment task.

If the Center later becomes inactive **or no active bound Center Profile remains capable of completion**:

- before real material use/work: release any reserved allocation and reassign;
- after real work/material use that can be authoritatively proven: the narrow Admin completion-recovery path may be used.

Admin recovery is forbidden while a valid active Center user still exists and can normally complete the task.

This prevents a structurally active Center with zero usable operators from becoming a dead task sink.

## 8.2 Remedy-kind correction before irreversible work

A wrong remedy choice after assignment must not require closing/recreating the whole Claim.

Add one bounded Admin operation, logically:

```text
change_claim_resolution_remedy(...)
```

Allowed only when:

- Resolution `assigned` and Claim open/approved;
- no active `reserved` allocation — release first;
- no `consumed` allocation;
- Resolution not completed/cancelled;
- mandatory reason;
- new remedy is one of the two frozen V1 kinds and differs from current.

The state remains `assigned`; performing Center may remain unchanged. Append immutable `resolution_remedy_changed` event with old/new remedy and reason.

This is a projection correction, not a new status or generic work-order editor.

## 8.3 Replacement Product policy boundary uses domain identities

The centralized Product compatibility seam from PD-076 should consume the authoritative domain objects/identities rather than force all future policy into a two-Product-ID signature.

Logical boundary:

```text
resolve_claim_replacement_roll_eligibility(
  warranty_id,
  candidate_roll_id
) -> { eligible, basis_code }
```

Internally V1 resolves canonical Product identities and returns eligible only when they match, with `basis_code='same_product_default'`.

This keeps V1 small while allowing a later approved substitution policy to inspect the legitimate Product/production/Warranty context without changing every caller or lifecycle table.

The client cannot provide the result or basis.

## 8.4 Claim allocation must block both ordinary Transfer and Opened Roll Recovery while reserved

A `reserved` Claim allocation is an exclusive material hold.

Until released:

- ordinary Transfer blocked;
- Cube J Opened Roll Recovery blocked;
- Warranty Activation blocked;
- another Claim allocation blocked;
- only exact assigned performing Center may use the narrow Claim-reserved Cube J Opening path;
- after Opening, Cube K Issue remains available.

If Cube K returns `return_required`, Admin first releases the unused Claim allocation, then existing Cube J Recovery may proceed under its ordinary authorization/receipt rules.

A `consumed` Claim Roll remains permanently blocked from ordinary Transfer/Recovery/Open/Issue/Activation/reallocation.

## 8.5 Production Order void reverse guard

Existing Cube J already protects Production Order void after a child Roll has been opened. Claims add one earlier downstream fact: a Roll may be reserved for Claim fulfillment **before** Opening.

R must therefore harden Production Order void narrowly so it fails if any child Roll has:

- active Claim allocation `reserved`; or
- terminal Claim allocation `consumed`.

If Production void commits first, later Claim allocation fails the ordinary generated-Production check.

Do not redesign Production void; add only the missing Claim downstream guard. Once the Roll is opened, existing J downstream protection still applies independently.

## 8.6 Cube N consumed-Roll compatibility

Cube N's resolver must treat a Roll with terminal Claim allocation `consumed`, and no effective Warranty of its own, as:

```text
unavailable_for_warranty
```

This check belongs among terminal-unavailable physical conditions before the default `not_activated` result.

A merely `reserved` or opened-for-Claim Roll does not require a new anonymous public state; private operational holds are not disclosed publicly.

## 8.7 R notifications

Resolution immutable events are the notification source. Cube L AFTER INSERT projectors materialize actionable/informational Inbox rows. Push remains best effort.

No separate Claims notification subsystem and no business transition driven by Push success/failure.

---

# 9. Frozen cross-domain serialization / locking contract

Implementation must preserve existing physical Roll lock ordering rather than invent a new mutex system.

## 9.1 Warranty / Claim family

For customer Claim creation and Warranty-sensitive corrections:

```text
Warranty → Claim / open-Claim invariant
```

P final submit locks/revalidates Warranty before committing the Claim. Cube M phone correction/void also locks Warranty. This serializes phone freshness, void and Claim creation.

Q decision corrections and R handoff then lock parent Claim/Resolution in a consistent order.

## 9.2 Physical Roll family

Existing Transfer/J/K/M use the proven physical prefix:

```text
Production Order → current custody
```

R physical mutations must preserve that prefix for the candidate Roll, then lock Claim allocation and other Roll facts in one documented deterministic order.

Do not change completed physical mutations to take a reverse `Resolution → custody → Production` lock merely for Claims.

## 9.3 Recommended combined R boundaries

### Roll reservation

Validate/lock Claim + Resolution eligibility, then acquire the replacement Roll's existing physical prefix:

```text
Claim/Resolution
→ Production Order
→ current custody
→ Transfer reservation / Claim allocation conflict facts
```

No competing existing physical operation takes Resolution after holding these rows; implementation must verify this on the actual merged base before coding.

### Claim-reserved Opening / Cube K issue

Preserve J/K:

```text
Production Order → current custody → Claim allocation/context check
```

The allocation is already stable because R reassignment cannot occur while a Roll remains reserved.

### Completion

Serialize Warranty/Claim end-state first, then Resolution, then replacement physical facts when applicable:

```text
Warranty
→ Claim
→ Resolution
→ Production Order
→ current custody
→ Claim allocation
→ Opening / Pre-install Issue facts
```

Exact helper reuse/naming may differ, but all conflicting mutations must agree on a deterministic relation and permanent concurrency tests must prove no deadlock (`40P01`) or contradictory winner.

The implementation review must re-audit the exact merged SQL before writing the final migration; this document freezes the invariant, not speculative helper names.

---

# 10. Final event catalogs

## Claim events

At minimum:

- `submitted`;
- `review_started`;
- `inspection_requested`;
- `inspection_reassigned`;
- `inspection_submitted`;
- `approved`;
- `rejected`;
- `cancelled`;
- `approval_cancelled_before_execution`;
- `decision_reopened_for_correction`.

## Resolution events

At minimum:

- `resolution_assigned`;
- `resolution_reassigned`;
- `resolution_remedy_changed`;
- `replacement_roll_reserved`;
- `replacement_roll_released`;
- `replacement_roll_consumed`;
- `resolution_completed`;
- `resolution_completed_admin_recovery` when used;
- `resolution_cancelled_customer_withdrawal`.

J/K retain their own Opening/Issue events. Claims reference/compose them; do not duplicate them into fake Claim events.

---

# 11. Final compatibility matrix

| Concern | Cube P | Cube Q | Cube R | Existing owner preserved |
| --- | --- | --- | --- | --- |
| Warranty identity/term | read/bind only | adjudication context | unchanged after service | M/N |
| customer phone | current corrected phone verification | customer projection only | customer projection only | M + P verification boundary |
| Claim state | create submitted/open | review/decision/correction | adjudication stays approved | P/Q |
| end-to-end Claim closure | none | reject/cancel close | completion or R customer-withdrawal cancellation closes | P invariant + Q/R transitions |
| inspection | none | one formal inspection | read only when useful | Q |
| Resolution | none | create authorized header only | assign/complete/cancel | Q handoff + R |
| replacement Product | none | none | centralized eligibility policy | R |
| physical custody | none | none | consumes existing custody truth | Transfer/Custody |
| Roll movement | none | none | no auto move; ordinary Transfer first | F/G/H |
| Opening | none | none | reuse J with reserved-Claim exception | J |
| pre-install quality | none | inspection is customer Claim evidence only | reuse K for replacement Roll before use | K |
| public Warranty state | anonymous projection unchanged | no widening | consumed Roll unavailable | N |
| notifications | Claim events → L | Claim events → L | Resolution events → L | L |
| finance | excluded | excluded | excluded | outside platform |

---

# 12. Final security/privacy findings

The package remains acceptable only if implementation preserves all of the following:

1. no anonymous direct table/Storage access to Claims, events, inspections, Resolutions or allocations;
2. bearer Public Code alone cannot mutate or read private Claim case data;
3. registered-phone verification is current/fresh under PD-077;
4. Claim Number is never authorization;
5. customer evidence is private and server-authorized; no raw evidence URLs in public projection;
6. Admin decision/reopen/cancellation corrections are explicit named operations with audit reason;
7. Center sees only specifically assigned inspection/fulfillment context;
8. inspection/fulfillment assignment requires actionable active Center user;
9. Agent/Dealer gain no adjudication or fulfillment authority;
10. notification lock-screen payloads avoid phone, VIN, raw evidence, internal reasons and replacement Roll serial;
11. direct Data API mutation paths cannot bypass lifecycle boundaries;
12. idempotency keys are bound to action identity/payload and cannot be replayed for different resources;
13. public Warranty route and Claims manage surface are non-stale for time/state-sensitive actions;
14. no customer account, OTP, public phone lookup or Claim Number lookup is added.

---

# 13. Final permanent race/dead-end test matrix

The combined quality plan must permanently cover at least:

1. two simultaneous new Claims for one Warranty → one open Claim;
2. phone correction vs verification-context use → stale context rejected;
3. phone correction vs Claim submit → deterministic winner;
4. Warranty expiry immediately before submit → new Claim rejected;
5. valid Claim immediately before expiry → survives expiry;
6. Warranty void vs Claim submit → no voided Warranty + open Claim;
7. conflicting Admin decisions → one committed final projection/event sequence;
8. wrong reject/cancel correction → reopen only if latest Claim/no later Claim/no Resolution;
9. reopen vs new Claim creation → one open-case winner;
10. inspection submission vs reassignment/cancellation → deterministic one valid outcome;
11. assigned inspection Center loses last active user → task cannot become permanently stranded; reassignment works;
12. approval retry → exactly one authorized Resolution;
13. approval-in-error cancellation vs R assignment → one winner;
14. R assignment requires actionable Center user;
15. remedy change vs Roll reservation → no hidden reserved material under wrong remedy;
16. Resolution customer-withdrawal cancellation vs completion → exactly one terminal outcome;
17. customer-withdrawal cancellation rejected while reserved allocation exists until explicit release;
18. replacement allocation vs Production void → one valid winner;
19. allocation vs ordinary Transfer → one valid owner of material lifecycle;
20. allocation vs Opened Roll Recovery → Recovery blocked until release;
21. same Roll reserved concurrently to two Resolutions → one winner;
22. current V1 different-Product candidate rejected by centralized policy;
23. same-Product candidate accepted and `product_eligibility_basis` persisted server-side;
24. assigned Center Opening vs allocation release → deterministic result;
25. unrelated Center Opening of reserved Roll → denied;
26. Cube K issue submission vs R completion → one winner; submitted issue blocks consumption;
27. `return_required` replacement Roll cannot be consumed; release + existing Recovery remains possible;
28. allocation release vs completion/consumption → no resurrection after consumption;
29. Center loses all actionable users after real work → bounded Admin completion recovery only with authoritative proof;
30. Warranty void vs R completion/cancellation → no contradictory open Claim;
31. second Claim vs R terminal closure → no overlap;
32. consumed Roll attempts Transfer/Recovery/Open/Issue/Activation/reallocation → all blocked;
33. consumed Roll own `/w/` → `unavailable_for_warranty`;
34. original Warranty expiry during Q/R → existing Claim/Resolution continues, original expiry unchanged;
35. no tested race may produce PostgreSQL deadlock `40P01` under the intended lock order.

---

# 14. Frozen Cube boundaries after audit

## Cube P — Customer Warranty Claim Intake

Owns only:

- Claim persistence/number/event foundation;
- one-open-case invariant;
- phone verification + freshness;
- required customer images;
- customer submit;
- Warranty-scoped verified Claim management envelope;
- submitted event → Admin Inbox materialization;
- customer/mobile/security/Storage/idempotency tests.

P does **not** implement review, inspection, decision, Resolution or replacement.

## Cube Q — Claim Review, Inspection & Decision

Owns only:

- Admin Claims queue/detail;
- review;
- one actionable-Center inspection + reassignment;
- Company final decision;
- ordinary cancellation;
- narrow approval-in-error cancellation before R assignment;
- narrow wrong reject/ordinary-cancel reopen correction under PD-078;
- one authorized Resolution header on approval;
- Warranty void guard;
- customer decision projection;
- Claim events/notifications.

Q does **not** implement remedy, execution Center, Roll allocation, Transfer, service completion or finance.

## Cube R — Approved Claim Resolution / Replacement & Reinstall

Owns only:

- Resolution `authorized | assigned | completed | cancelled` lifecycle;
- actionable performing Center assignment/reassignment;
- bounded remedy correction;
- policy-driven replacement Product eligibility;
- Roll allocation/reservation/release/consumption;
- ordinary Transfer reuse before allocation;
- reserved-Roll J Opening compatibility;
- K quality reuse;
- Production/J/Transfer/M/N compatibility guards;
- completion evidence;
- narrow inactive/no-actionable-user Admin recovery completion;
- customer-withdrawal Resolution cancellation;
- Claim final closure;
- Warranty service history/customer resolved projection;
- Resolution events/notifications.

R does **not** implement adjudication changes, accounting, new Warranty term, new customer QR, generic inventory or generic workflow.

---

# 15. Sequential implementation gate

The architecture being reviewed together does **not** authorize implementation together.

## P execution

When implementation is explicitly started:

1. fetch latest `main` again;
2. confirm no later merged change invalidates the P assumptions;
3. implement only Cube P;
4. qualify database/RLS/Storage/security/mobile/idempotency/race behavior;
5. independent review on exact HEAD;
6. merge only after P GO.

P completion is not Claims Production launch authorization.

## Q execution

Start only from merged/qualified P `main`. Revalidate P contracts and exact current Cube M support/notification APIs before implementation. Merge only after Q GO and P regression pass.

## R execution

Start only from merged/qualified Q `main`. Re-audit exact Transfer/J/K/M/N/Production SQL before compatibility migrations, then implement R in bounded increments. Full replacement-material hosted flow is mandatory before R GO.

---

# 16. Claims Macro GO gate

Claims/Resolution V1 is operationally complete only after all are true:

- Cube P Quality PASS;
- Cube Q Quality PASS;
- Cube R Quality PASS;
- Database Quality PASS on each exact qualified HEAD;
- current PR Quality PASS;
- affected Cube L/M/N and Transfer/J/K regressions PASS;
- full customer mobile flow PASS;
- direct-decision Claim flow PASS;
- inspection flow + reassignment PASS;
- wrong-decision correction PASS;
- approval-in-error pre-execution correction PASS;
- service/reinstall completion PASS;
- replacement Roll ordinary Transfer → allocation → J Opening → optional K Issue → completion PASS;
- defective replacement Roll release + existing Recovery path PASS;
- post-assignment customer-withdrawal Resolution cancellation PASS;
- Center-loss recovery scenarios PASS;
- consumed Roll terminal/public-unavailable behavior PASS;
- original Warranty term/Public Code unchanged PASS;
- no finance/accounting scope PASS;
- security/privacy review PASS;
- independent Claims Macro Audit PASS on the exact final R HEAD.

Only then may the Claims macro-capability be considered software-complete. Production launch remains subject to the wider environment/release readiness gates.

---

# 17. Explicit non-goals preserved by Final Audit

The audit does not authorize:

- generic helpdesk/ticket engine;
- chat/comments;
- customer account or OTP;
- public Claim lookup;
- AI adjudication;
- Agent/Dealer adjudication;
- SLA/escalation system;
- financial/accounting/refund/reimbursement logic;
- automatic Roll Transfer;
- second custody/inventory engine;
- second Opening or quality engine;
- multi-Roll V1 replacement;
- cross-Product substitution configuration in V1;
- generic substitution matrix;
- Warranty renewal after replacement;
- new customer QR/token;
- video evidence;
- automatic background workflow when explicit synchronous domain actions suffice.

---

# 18. Final execution authorization

**Final Spec Audit verdict: PASS WITH THE BOUNDED CORRECTIONS IN THIS AMENDMENT.**

No unresolved Product-Owner decision is required before Cube P implementation.

The Claims specification package is therefore frozen as:

1. `docs/claims-product-decisions-amendment.md` — PD-063–PD-076;
2. `docs/claims-pqr-master-architecture.md`;
3. `docs/cube-p-customer-warranty-claim-intake-spec.md`;
4. `docs/cube-q-claim-review-inspection-decision-spec.md`;
5. `docs/cube-r-claim-resolution-replacement-reinstall-spec.md`;
6. **this Final Specification Review Amendment**, including PD-077–PD-079 and all bounded engineering corrections above.

Implementation must follow the precedence in section 1 and the sequential P → Q → R gates. No implementation work should silently weaken or bypass these corrections merely to reduce migration scope.