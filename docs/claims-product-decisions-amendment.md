# Protection Giants — Claims / Resolution Product Decisions Amendment

**Status:** APPROVED / FROZEN — Product Owner approval completed 2026-08-25  
**Baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Applies to:** Cubes P, Q and R — Customer Warranty Claim Intake, Claim Review / Inspection / Decision, and Approved Claim Resolution / Replacement / Reinstall  
**Authority:** This amendment is canonical for the Claims/Resolution lifecycle once merged. It supplements `docs/product-decisions.md` and supersedes earlier wording that left Claims and replacement/reinstall undefined or merely deferred. It does not supersede Cube M Warranty issuance rules, Cube N permanent Roll-owned public identity, Cube O print identity, Cube L notification semantics, or the existing Custody/Transfer foundation except where the decisions below explicitly add a later compatibility guard.

---

## Context

The existing platform already establishes the customer Warranty as a durable historical issuance record with immutable core identity and policy snapshots. A wrong activation may be corrected through the narrow `voided_in_error` path, but that correction is explicitly not a replacement/reinstall entitlement. Cube N establishes one permanent customer-facing `/w/<PUBLIC-CODE>` identity owned by the physical source Roll, and Cube O reuses that same identity in every customer QR copy.

The Claims capability must therefore be added as a separate post-Warranty lifecycle rather than overloading or mutating the Warranty into a ticket, repair or replacement state machine.

The historical reference repository contained Warranty Activation / Warranty Check and customer-facing warranty wording, but no real Claim entity, adjudication workflow or replacement lifecycle. Its useful defect examples remain functional reference only; current platform decisions remain authoritative where the legacy behavior conflicts.

---

## Approved decisions

### PD-063 — Warranty, Claim and Resolution are separate lifecycles
**Status:** Approved — 2026-08-25

The post-activation customer service chain is:

`Warranty → Claim → Resolution/Fulfillment`.

The Warranty remains the durable historical issuance record. A Claim is an independent case linked to exactly one effective Warranty. An approved Claim may create one independent Resolution/Entitlement lifecycle.

Claim review states must not be stored as Warranty statuses. Resolution/replacement states must not be stored as Claim adjudication statuses merely for convenience.

The three implementation cubes are coordinated but remain independently bounded:

- Cube P — Customer Warranty Claim Intake;
- Cube Q — Claim Review, Inspection & Decision;
- Cube R — Approved Claim Resolution / Replacement & Reinstall.

### PD-064 — New Claim entry starts from the permanent Warranty URL and requires an active Warranty
**Status:** Approved — 2026-08-25

The customer starts from the existing permanent Roll-owned Warranty route:

`/w/<PUBLIC-CODE>`.

The system resolves the code through the existing Cube N identity boundary and binds the Claim internally to the authoritative effective Warranty. The customer never chooses, types or posts an arbitrary `warranty_id`, Roll ID, Warranty Number or Roll serial as the Claim ownership source.

A **new** V1 Claim may be submitted only while the effective Warranty is currently active at the authoritative submission time.

No new Claim may be opened from `not_activated`, `no_current_warranty_after_void`, `unavailable_for_warranty` or naturally expired Warranty state.

A Claim validly submitted while coverage was active continues through review and fulfillment even if the Warranty naturally expires later. Natural expiry after submission does not cancel, reject or invalidate the existing Claim.

### PD-065 — V1 claimant verification uses registered Warranty phone match; no customer account or OTP
**Status:** Approved — 2026-08-25

Possession of the high-entropy `/w/<PUBLIC-CODE>` link remains sufficient for Cube N's approved read-only public Warranty projection, but it is not sufficient by itself for sensitive Claim mutations or Claim-detail reads.

V1 Claim access adds one bounded verification factor: the customer supplies the phone number already stored on the effective Warranty, and the server compares normalized values through a narrow private boundary.

V1 does **not** add:

- customer accounts;
- passwords;
- SMS/email OTP;
- public lookup by phone;
- a generic customer identity/CRM subsystem.

Verification failures must not reveal whether the public code, phone, Warranty or Claim exists beyond the already-approved public Warranty projection.

### PD-066 — Every Claim has an independent permanent Claim Number and only one Claim may remain open per Warranty
**Status:** Approved — 2026-08-25

Every successfully submitted Claim receives one database-generated human-readable Claim Number in the family:

`PG-C-NNNNNNNN`.

The Claim Number is globally unique, stable, never reused, and is a customer/operational reference rather than an access secret.

A Warranty may legitimately have multiple Claims over its lifetime, but V1 permits only one **open end-to-end Claim case** at a time.

The open-case rule spans adjudication and fulfillment:

- `rejected` or bounded `cancelled` closes the case in Cube Q;
- `approved` remains open while its Resolution is incomplete;
- successful Resolution completion closes the case in Cube R.

The implementation must enforce this invariant authoritatively at the database mutation boundary, not only in UI checks.

### PD-067 — V1 Claim intake uses a small defect taxonomy and requires private image evidence
**Status:** Approved — 2026-08-25

V1 Claim categories are intentionally small:

- `cracking`;
- `yellowing`;
- `discoloration`;
- `peeling`;
- `delamination`;
- `adhesive_issue`;
- `bubbling`;
- `other`.

The customer also provides a human description and the affected vehicle area/part.

Category selection never proves coverage or automatically determines the decision. The authoritative review context is the Warranty's snapshotted Product coverage/care policy plus the submitted/inspection evidence.

Unlike normal Warranty Activation and unlike optional pre-install evidence, a V1 customer Warranty Claim requires image evidence. Images are private operational evidence. V1 does not accept video.

### PD-068 — Protection Giants Company/Admin alone makes the final V1 Claim decision
**Status:** Approved — 2026-08-25

Only active Protection Giants Admin/Company may transition a Claim to the final adjudication outcomes:

- `approved`;
- `rejected`;
- bounded `cancelled`.

Country Agents, Dealers and Centers do not receive Claim approval/rejection authority.

A Center may act as a technical evidence provider only when Company requests a physical inspection under Cube Q.

Every final decision requires the authoritative actor/time, an internal reason, a bounded customer-facing explanation, and immutable audit/timeline evidence. Claims are never deleted to correct an operational mistake.

### PD-069 — Physical inspection is optional, Center-provided evidence, and must not create a dead end
**Status:** Approved — 2026-08-25

Company may decide directly when submitted evidence is sufficient, or request one formal V1 physical inspection when evidence is insufficient.

The default inspecting Center is the activating/installing Center recorded on the Warranty snapshot. If that Center is inactive, suspended, unavailable or otherwise unsuitable, active Protection Giants Admin may assign another operationally active Center.

The assigned Center may submit bounded technical observations and private image evidence. It cannot approve or reject the Claim.

Center suspension or other later Center lifecycle changes do not cancel the Warranty or Claim. Reassignment is the recovery path.

V1 does not build a generic comments thread, chat system, assignment engine, SLA engine or repeated evidence-request loop.

### PD-070 — Claim adjudication and Resolution/Fulfillment are separate; approval authorizes work but does not perform it
**Status:** Approved — 2026-08-25

An `approved` Claim means Protection Giants accepted the Warranty Claim. It does not mean the physical remedy is complete.

Approval creates or authorizes exactly one independent Resolution/Entitlement record. The approval mutation must not silently:

- create another customer Warranty;
- void or rewrite the original Warranty;
- move Roll custody;
- create/receive a Transfer;
- open a replacement Roll through the normal Warranty-opening path;
- allocate or consume replacement material;
- mark reinstall complete.

Cube R performs later operational fulfillment explicitly.

### PD-071 — Claim Resolution manages product operations only; financial settlement is outside the platform
**Status:** Approved — 2026-08-25

Protection Giants Claims/Resolution is a product-lifecycle capability, not an accounting, invoicing or financial-dispute system.

The platform may record and execute operational remedy facts such as:

- approved Claim;
- performing Center;
- whether a replacement Roll is required;
- physical Roll allocation;
- existing custody/Transfer movement when separately initiated;
- material use for Claim fulfillment;
- reinstall/service completion;
- completion evidence and Warranty service history.

The platform does **not** determine or persist in V1:

- who pays installation labor;
- Roll price/cost for the dispute;
- reimbursement or monetary compensation;
- discounts, credits or debts;
- invoices or payment status;
- accounting settlement between Company, Center, Dealer, Agent or customer.

Those matters remain direct commercial arrangements outside this lifecycle.

### PD-072 — A replacement Roll remains a normal tracked physical Roll until claim allocation, then becomes protected Claim material
**Status:** Approved — 2026-08-25

A physical Roll intended for an approved Claim remains an ordinary tracked Roll and may move through the existing Custody/Transfer lifecycle before it is allocated to fulfillment.

V1 does not invent a second replacement inventory or bypass ordinary custody.

Final Claim allocation occurs only when the Roll is otherwise eligible and is in confirmed custody of the performing Center. Allocation reserves it exclusively for that Resolution. A reserved Roll cannot simultaneously enter another Claim, normal Transfer, normal Roll Opening or customer Warranty Activation unless the allocation is explicitly released first.

Once the Center records actual use for the approved Claim, the Roll becomes permanently consumed as **Claim Fulfillment material**. It can never issue an independent customer Warranty or be reused/transferred as ordinary available inventory.

A released allocation made before physical use restores ordinary eligibility subject to all other current Roll rules; a consumed allocation is terminal.

### PD-073 — Replacement/reinstall preserves the original Warranty term and original customer public identity
**Status:** Approved — 2026-08-25

Warranty service under an approved Claim does not restart or extend the original Warranty term in V1.

The original Warranty retains its original `coverage_expires_at`. The platform records the service/Claim history without issuing a new customer Warranty merely because replacement material was installed.

The customer's permanent Warranty QR/public URL remains the original Roll-owned `/w/<PUBLIC-CODE>` identity established by Cube N.

A replacement Roll still has its own ordinary physical-Roll public identity because every Roll does, but that identity does not replace, rotate or become the customer's Warranty identity for the serviced vehicle.

When a replacement Roll is terminally consumed for Claim fulfillment, its own public Warranty resolver state must fail safely as unavailable for Warranty activation rather than implying that it can later receive an independent customer Warranty.

### PD-074 — Open Claim or incomplete approved Resolution blocks Warranty `voided_in_error`
**Status:** Approved — 2026-08-25

Cube M's `voided_in_error` correction must not silently invalidate an active downstream Claim/Resolution.

A Warranty with an open Claim case cannot be transitioned to `voided_in_error`.

The Claim must first reach an explicit audited closure path:

- rejection or bounded cancellation; or
- completion of its approved Resolution.

Only then may the ordinary Cube M void-in-error rules be evaluated again.

No Claim, inspection, Resolution, Roll allocation or custody state is auto-cancelled as a side effect of Warranty voiding.

### PD-075 — Customer Claim status is a narrow verified projection, not a public case file
**Status:** Approved — 2026-08-25

The anonymous `/w/<PUBLIC-CODE>` Warranty projection remains intentionally minimal and must not expose private Claim evidence, internal review notes, inspection findings, internal actors or replacement Roll identifiers merely because someone possesses a photographed/copied QR.

After registered-phone verification, the customer may receive a narrow Claim/service projection containing only what is needed to understand progress, such as:

- Claim Number;
- customer-facing status;
- submission date;
- whether a Center inspection/visit is required and the assigned Center identity when relevant;
- final customer-facing decision;
- approved remedy progress;
- completion state.

Internal reasons, audit identities, private evidence, technical diagnosis detail, replacement Roll serial/ERP identity, custody/Transfer history and internal UUIDs remain private.

---

## Macro lifecycle invariant

The approved V1 post-Warranty chain is:

```text
Effective active Warranty
        ↓
Verified Customer Claim Intake
        ↓
Claim submitted
        ↓
Company review
   ┌────┴─────────────┐
   │ evidence enough  │ evidence insufficient
   ↓                  ↓
Decision        Center inspection
   │                  ↓
   └──────────── Company review
                     ↓
              Final decision
          ┌──────────┴──────────┐
          ↓                     ↓
      rejected/cancelled     approved
          ↓                     ↓
      Claim closed       Resolution authorized
                                ↓
                        Center/material execution
                                ↓
                         service completion
                                ↓
                     Claim end-to-end closed
                                ↓
                    Warranty service history
```

---

## Explicit V1 non-goals across P/Q/R

The Claims series does not create:

- a generic ticketing/helpdesk platform;
- customer accounts or OTP infrastructure;
- public claim lookup by Claim Number, Warranty Number, VIN, phone or Roll serial;
- chat/comments messaging;
- arbitrary workflow/state designer;
- SLA/escalation/priority engine;
- automatic AI claim decisions;
- accounting, invoices, credits, reimbursements or payment settlement;
- automatic Roll Transfer as a side effect of approval;
- a second inventory/custody subsystem;
- automatic Warranty renewal after replacement;
- a new customer QR/public credential.

Any future expansion of these boundaries requires a new explicit Product Decision.
