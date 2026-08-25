# Cube R — Approved Claim Resolution / Replacement & Reinstall

**Status:** DRAFT FOR FINAL PRODUCT / ENGINEERING REVIEW — product decisions are APPROVED/FROZEN  
**Version:** 1.0  
**Planning baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Implementation base:** must be the merged Cube Q HEAD, not the planning baseline above  
**Depends on:** Cubes P + Q, Roll Custody/Transfer foundation, Cube J Roll Opening guards, Cube K Pre-install Issue guards, Cube M Warranty Activation/support, Cube N Public Warranty resolver, Cube L Notifications/PWA  
**Consumes but does not redefine:** `docs/claims-product-decisions-amendment.md`, `docs/claims-pqr-master-architecture.md`  
**Primary responsibility:** execute the physical operational remedy for one approved Claim, optionally consuming one tracked replacement Roll, record completion evidence, and close the end-to-end Claim without changing the original Warranty term or introducing finance.

---

# 1. Purpose

Cube Q answers whether the Claim is accepted. Cube R answers whether the accepted remedy was actually carried out.

R starts only from the one-to-one `warranty_claim_resolutions` row created by Q in:

`authorized`

It ends when the physical service is completed and recorded:

`completed`

The core invariant is:

> An approved Claim is not closed merely because Company approved it. It closes only when its authorized physical remedy is completed.

---

# 2. Inherited rules R must preserve

1. Original Claim stays `approved`; R does not rewrite adjudication status.
2. Original Claim has `closed_at is null` while fulfillment is pending.
3. Original Warranty remains the customer Warranty record.
4. Original Warranty `coverage_expires_at` never restarts/extends because of V1 replacement/reinstall.
5. Original `/w/<PUBLIC-CODE>` remains the customer's permanent Warranty identity.
6. Replacement Roll remains a real tracked physical Roll; no second replacement inventory exists.
7. Existing Transfer/Custody remains the only way to move ordinary Roll custody.
8. R never auto-creates a Transfer.
9. Replacement Roll can never issue its own customer Warranty after it is consumed for Claim fulfillment.
10. No cost/payment/reimbursement fields or workflows exist in R.

---

# 3. Cube R scope

## In scope

- approved Resolution queue/detail for Admin;
- remedy selection;
- performing Center assignment/reassignment;
- Center fulfillment task/detail;
- bounded eligible replacement Roll resolver for the assigned Center;
- Admin replacement Roll allocation;
- allocation release before use;
- replacement Roll verification at completion;
- terminal Claim-fulfillment consumption of replacement Roll;
- completion note + required private completion images;
- normal Center completion;
- narrow Admin recovery completion for an inactive assigned Center after real work/material use cannot otherwise be recorded;
- Resolution events/timeline;
- Claim `closed_at` finalization;
- Warranty service-history read projection;
- customer verified completion projection;
- Cube L fulfillment notifications;
- minimal compatibility guards in Transfer, Roll Opening, Pre-install Issue, Warranty Activation, Warranty void and Cube N public resolver.

## Explicitly out of scope

- deciding whether Claim is covered;
- reopening/changing Q final decision;
- refunds/credits/invoices/labor charges;
- automatic Roll transfer or receipt;
- customer Warranty renewal;
- replacement customer QR;
- new customer account/OTP;
- generic stock reservation engine;
- repair parts beyond tracked PPF Rolls;
- arbitrary remedy/work-order builder;
- workshop scheduling/calendar;
- multi-Roll fulfillment for one V1 Claim;
- reopening completed Resolution.

---

# 4. Resolution state model

Frozen V1 states:

```text
authorized
assigned
completed
```

Transitions:

```text
authorized → assigned → completed
```

No backwards transition.

Reassignment while `assigned` changes the current performing Center with an immutable event but does not create another state.

A generic `in_progress`, `waiting_stock`, `scheduled`, `payment_pending`, `customer_arrived` state set is deliberately not added.

Operational readiness is derived from current assignment/allocation facts.

---

# 5. Resolution persistence extension

Q already created the minimal `warranty_claim_resolutions` row.

R extends it logically to:

```text
warranty_claim_resolutions
- id                         UUID PRIMARY KEY
- claim_id                   UUID NOT NULL UNIQUE -> warranty_claims.id
- status                     TEXT NOT NULL
- authorized_by_profile_id   UUID NOT NULL -> profiles.id
- authorized_at              TIMESTAMPTZ NOT NULL

- remedy_kind                TEXT NULL
- performing_center_party_id UUID NULL -> operational_parties.id
- assigned_by_profile_id     UUID NULL -> profiles.id
- assigned_at                TIMESTAMPTZ NULL

- completed_by_profile_id    UUID NULL -> profiles.id
- completion_actor_kind      TEXT NULL
- completion_note            TEXT NULL
- completed_at               TIMESTAMPTZ NULL

- created_at                 TIMESTAMPTZ NOT NULL
- updated_at                 TIMESTAMPTZ NOT NULL
```

Allowed `remedy_kind`:

- `service_reinstall`;
- `replacement_roll_reinstall`.

Shape constraints:

## `authorized`

- remedy/performing Center/assignment/completion fields null.

## `assigned`

- `remedy_kind`, performing Center, assigned actor/time present;
- completion fields null.

## `completed`

- all assignment fields present;
- completion actor kind/profile/time/note present;
- note trimmed and bounded; target 10–2000 characters.

Completed row is terminal and immutable.

No financial columns are permitted.

---

# 6. Remedy selection and performing Center assignment

Named Admin mutation, logically:

`assign_warranty_claim_resolution(...)`

Initial assignment allowed only:

`authorized → assigned`

Inputs:

- Resolution/Claim internal identity;
- remedy kind;
- performing Center party id;
- request id.

At commit time revalidate:

1. active Admin actor;
2. Claim is exactly `approved`;
3. Claim `closed_at is null`;
4. Resolution exactly `authorized`;
5. Warranty remains present and not `voided_in_error`;
6. performing party is a real operational Center;
7. Center is active.

Protection Giants public approval badge is not required merely to perform an already-approved Warranty remedy in V1.

Mutation writes `resolution_assigned` event and Center notification in the same database boundary.

---

# 7. Reassignment

Admin may reassign an unresolved `assigned` Resolution when the current Center cannot perform the work.

Requirements:

- Resolution not completed;
- Claim still open;
- new Center operationally active;
- new Center differs from current;
- mandatory reason 5–500 characters;
- **no active `reserved` replacement Roll allocation exists**.

If a Roll is reserved, Admin must explicitly release that allocation first. R does not silently move/release material as a side effect of Center reassignment.

Reassignment updates current performing Center and appends immutable `resolution_reassigned` event with old/new Center and reason.

Old Center loses task access immediately; new Center receives notification.

---

# 8. Existing Transfer/Custody boundary

R never bypasses custody.

If Company wishes to use a Roll currently held elsewhere:

1. do **not** allocate it to the Claim yet;
2. use the existing ordinary Transfer workflow;
3. recipient Center accepts/receives it under existing rules;
4. only after confirmed custody equals the performing Center may Admin allocate it to the Resolution.

This sequence is intentional.

It avoids special Claim-aware Transfer semantics and keeps one authoritative physical-movement system.

R may present a helpful message that suitable material is not currently held by the Center, but it must not create a hidden Transfer from the Resolution page.

---

# 9. Eligible replacement Roll resolver

For `replacement_roll_reinstall`, Admin needs a narrow list/resolver limited to Rolls currently held by the assigned Center and eligible for Claim use.

Do not expose a global inventory browser merely for R.

A Roll candidate must pass all authoritative checks at read time, and again at allocation commit time.

Minimum commit-time eligibility:

1. physical Roll exists;
2. parent Production Order is generated/non-voided;
3. Roll is not terminally unavailable under existing lifecycle;
4. confirmed current custodian is the assigned performing Center;
5. no active pending Transfer reservation exists;
6. no normal Roll Opening exists;
7. no effective customer Warranty exists;
8. no unresolved/terminal Pre-install Issue state makes the Roll unusable;
9. no Opened Roll Recovery path has consumed/reclassified it;
10. no active Claim allocation for this or another Resolution;
11. Roll has not previously been consumed for Claim fulfillment.

The implementation must inspect the exact merged J/K/M/H guards and reuse their authoritative predicates/helpers where possible rather than reimplementing divergent copies.

---

# 10. Replacement Roll allocation model

Use dedicated allocation history:

```text
warranty_claim_resolution_roll_allocations
- id                     UUID PRIMARY KEY
- resolution_id          UUID NOT NULL -> warranty_claim_resolutions.id
- roll_id                UUID NOT NULL -> rolls.id
- status                 TEXT NOT NULL DEFAULT 'reserved'
- reserved_by_profile_id UUID NOT NULL -> profiles.id
- reserved_at            TIMESTAMPTZ NOT NULL
- released_by_profile_id UUID NULL -> profiles.id
- release_reason         TEXT NULL
- released_at            TIMESTAMPTZ NULL
- consumed_by_profile_id UUID NULL -> profiles.id
- consumed_at            TIMESTAMPTZ NULL
- created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
```

Allowed states:

```text
reserved
released
consumed
```

Rules:

- only `replacement_roll_reinstall` may have an allocation;
- at most one `reserved` allocation per Resolution;
- at most one `consumed` allocation per Resolution;
- one Roll may have at most one `reserved` or `consumed` Claim allocation across the system;
- released rows remain historical and do not block a later different allocation if every ordinary Roll rule still passes;
- consumed is terminal and permanent;
- no update/delete except named reservation lifecycle mutations.

A consumed Roll cannot be released.

---

# 11. Allocate replacement Roll

Admin-only named mutation, logically:

`reserve_claim_resolution_roll(...)`

Preconditions:

- Claim `approved` and open;
- Resolution `assigned`;
- remedy `replacement_roll_reinstall`;
- performing Center active;
- Roll passes every section 9 check under authoritative locks;
- no current reserved allocation for Resolution.

Atomic effects:

- create allocation `reserved`;
- append `replacement_roll_reserved` Resolution event;
- material becomes blocked from normal conflicting operations immediately.

No Transfer or Roll Opening is created.

---

# 12. Release unused allocation

Admin-only mutation, logically:

`release_claim_resolution_roll(...)`

Allowed only while allocation is exactly `reserved` and Resolution not completed.

Requires mandatory reason 5–500 chars.

Atomic effects:

- allocation → `released`;
- actor/reason/time persisted;
- event appended.

After release the Roll is ordinary inventory again **only if all other current Roll lifecycle rules allow it**.

Release does not move custody.

This is the required path before:

- choosing a different Roll;
- reassigning the Resolution to another Center;
- ordinary Transfer of that Roll.

---

# 13. Guards while Roll is reserved

Presence of active Claim allocation `status='reserved'` must make the Roll fail closed in:

- ordinary Transfer creation/selection;
- Cube J normal Roll Opening;
- Cube K Pre-install Issue entry into the normal pre-Warranty path;
- Cube M Warranty Activation;
- allocation to another Claim Resolution.

Do not silently release the Claim allocation when another operation is attempted.

The user must resolve the reservation in R explicitly.

The reserved state is a temporary operational hold and does not need a new public Cube N Warranty label; the public resolver may continue its ordinary pre-activation presentation until the Roll is actually consumed.

---

# 14. Performing Center fulfillment task

Active users bound to the assigned performing Center may read one narrow task projection when Resolution is `assigned`.

Projection may include:

- Claim Number;
- approved customer-safe remedy instruction;
- Product name/version snapshot from original Warranty;
- vehicle make/model/year plus identity needed to work on the correct vehicle;
- affected area;
- customer Claim description;
- relevant Claim/inspection images when needed for work;
- original Warranty coverage context as useful;
- remedy kind;
- if replacement remedy: allocated Roll serial/product identity needed to verify the correct material.

Do not expose:

- financial information;
- unrelated customer history;
- internal decision reason beyond what is operationally necessary;
- other inventory;
- Admin audit data.

---

# 15. Completion evidence

Use the existing private `warranty-claim-evidence` bucket with a dedicated metadata table:

```text
warranty_claim_resolution_evidence
- id                     UUID PRIMARY KEY
- resolution_id          UUID NOT NULL -> warranty_claim_resolutions.id
- storage_path           TEXT NOT NULL UNIQUE
- mime_type              TEXT NOT NULL
- size_bytes             BIGINT NOT NULL
- uploaded_by_profile_id UUID NOT NULL -> profiles.id
- created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
```

Normal V1 completion requires:

- minimum 1 image;
- maximum 5 images;
- maximum 8 MiB/image;
- JPEG/PNG/WebP;
- completion note.

Images demonstrate the completed physical service. No video.

Same server-controlled upload, private signed read and compensation rules apply.

---

# 16. Normal Center completion

Named mutation/service, logically:

`complete_warranty_claim_resolution(...)`

Caller must be an active Profile bound to the exact currently assigned active Center.

Common prerequisites:

1. Claim `approved`;
2. Claim `closed_at is null`;
3. Resolution `assigned`;
4. performing Center equals caller Center;
5. valid completion note;
6. 1–5 valid staged completion images;
7. Warranty relationship remains intact and Warranty is not `voided_in_error`.

## For `service_reinstall`

There must be no active/consumed replacement Roll allocation for the Resolution.

## For `replacement_roll_reinstall`

Additionally:

- exactly one allocation exists in `reserved`;
- allocated Roll is still confirmed custody of the performing Center;
- Roll still has no normal opening/Warranty/transfer conflict;
- caller confirms/scans the exact allocated Roll identity; a different Roll fails closed.

### Atomic database effects

For `service_reinstall`:

- Resolution → `completed`;
- completion fields set;
- completion evidence metadata committed;
- `resolution_completed` event appended;
- original Claim `closed_at` set to authoritative completion time;
- notifications materialized.

For `replacement_roll_reinstall`, the **same transaction** additionally:

- allocation `reserved → consumed`;
- consumed actor/time set;
- `replacement_roll_consumed` event appended;
- permanent consumed Roll guard becomes effective.

There is no separate normal Roll Opening or new Warranty Activation.

This design intentionally makes digital consumption and Resolution completion one authoritative boundary. A network retry uses idempotency and returns the already-completed result rather than double-consuming material.

---

# 17. Narrow Admin completion recovery

A normal active assigned Center should complete its own work.

However, a dead end can occur if physical work/material use has genuinely occurred and the assigned Center becomes operationally inactive before it can record completion.

R therefore permits one narrow Company recovery operation, logically:

`admin_complete_claim_resolution_recovery(...)`

Allowed only when:

- active Protection Giants Admin actor;
- Resolution remains `assigned` and Claim open;
- currently assigned Center is **operationally inactive/suspended** at commit time;
- required completion evidence is provided through Company-controlled private upload;
- mandatory recovery reason 5–500 chars;
- all remedy-specific Roll facts can still be authoritatively proven.

For a replacement remedy, if the reserved Roll cannot be proven as the material actually used, Admin must **not guess or consume it**. The case requires operational correction outside the automated happy path before recovery completion.

Recovery completion records `completion_actor_kind='admin_recovery'` and an immutable recovery event/reason. It is not Center impersonation.

Do not broaden this into a general Admin “complete anything” shortcut while an assigned Center is active.

---

# 18. Consumed replacement Roll terminal behavior

Once allocation is `consumed`, the physical Roll is permanently Claim Fulfillment material.

The presence of that consumed relationship must authoritatively block:

- ordinary Transfer;
- normal Roll Opening;
- Pre-install Issue / Opened Roll Recovery paths;
- Warranty Activation;
- allocation to another Resolution;
- return to ordinary available inventory.

There is no “unconsume”.

Historical confirmed custodian remains the last operational Center; R does not invent a Customer operational-party custody row.

---

# 19. Cube N public Warranty resolver compatibility

A consumed replacement Roll already owns its own permanent Public Code because all Rolls do.

After consumption for Claim fulfillment, if that Roll has no effective Warranty, its own `/w/<PUBLIC-CODE>` must resolve as terminal:

`unavailable_for_warranty`

rather than `not_activated`.

This protects against a printed replacement-Roll Warranty sticker later implying that a second Warranty can be activated.

The **customer vehicle Warranty page remains the original source Roll Public Code** and continues to show the original Warranty according to Cube N, plus the verified Claims/service entry added by P/Q/R.

Do not rotate either code.

---

# 20. Original Warranty behavior / service history

R does not change:

- Warranty Number;
- source Roll;
- activated_at;
- coverage_expires_at;
- Product policy snapshot;
- activating Center snapshot;
- original customer Public Code.

R adds a bounded read projection that lets authorized Company and the verified customer understand service history without mutating Warranty issuance.

## Internal Warranty service history may show

- Claim Number;
- Claim category/affected area;
- submission time;
- final decision;
- inspection summary when authorized;
- Resolution remedy kind;
- performing Center;
- replacement Roll internal identity where operationally authorized;
- completion time/evidence;
- timeline.

## Verified customer service history shows only

- Claim Number;
- customer-facing decision;
- remedy/progress;
- assigned Center when relevant;
- completion date/status.

No replacement Roll serial, ERP serial, private internal reason, custody history or audit actors are exposed to the customer.

---

# 21. Warranty `voided_in_error` interaction

Q already blocks Warranty void while Claim is open.

R preserves that rule through completion.

Only after Resolution completes and Claim `closed_at` is set may Cube M void-in-error be evaluated again under its ordinary rules.

R completion does **not** automatically void/renew the Warranty.

If a later human concludes the original Warranty itself was an erroneous activation despite completed service, that is a separate audited Company correction and must not erase Claim/Resolution history.

---

# 22. Resolution events

Use an append-only `warranty_claim_resolution_events` table or equivalently bounded event stream.

Required event kinds:

- `resolution_assigned`;
- `resolution_reassigned`;
- `replacement_roll_reserved`;
- `replacement_roll_released`;
- `replacement_roll_consumed`;
- `resolution_completed`;
- `resolution_completed_admin_recovery` when applicable.

Q's Claim `approved` event + Resolution `authorized_by/at` remain sufficient evidence of authorization; R does not need to synthesize duplicate historical authorization events unless implementation quality benefits from it.

Events are immutable and cannot be used as comments/chat.

---

# 23. Notifications

Reuse Cube L.

## Resolution assigned/reassigned

Recipient: active profiles of performing Center.  
Intent: action required.

## Replacement Roll reserved

Notify assigned Center only if the information changes what they need to do; avoid redundant Push when the task page already reflects it and no immediate action is required.

## Resolution completed

- Admin Inbox: informational/operational completion;
- performing Center: do not Push actor about its own synchronous success;
- customer: verified Claim page reflects completion; no SMS/email/WhatsApp added.

Push transport remains best-effort and cannot determine fulfillment state.

---

# 24. RLS / authorization

## Admin

May:

- list/read authorized/incomplete/completed Resolutions;
- assign/reassign Center;
- list eligible Rolls within the assigned Center boundary;
- reserve/release replacement Roll;
- read all Resolution evidence;
- invoke narrow inactive-Center recovery completion when preconditions pass.

## Assigned Center

May:

- read only currently assigned unresolved Resolution tasks;
- see exact allocated replacement Roll when relevant;
- upload completion evidence;
- complete its own assigned Resolution.

Cannot:

- choose/allocate arbitrary Company Rolls;
- transfer Roll via R;
- change remedy kind;
- assign another Center;
- release allocation;
- alter Claim decision;
- restart Warranty.

## Agent / Dealer

No R resolution authority in V1.

## Anonymous

No direct R table/storage access; customer reads only verified projection.

---

# 25. Cross-cube compatibility changes R must make

R may touch existing completed cubes only through narrow guards required by the approved lifecycle.

## Transfer

Reject Roll with active `reserved` Claim allocation or terminal `consumed` Claim allocation.

## Cube J Roll Opening

Reject reserved/consumed Claim Roll.

## Cube K Pre-install Issue

Reject Claim-reserved/consumed Roll from entering normal pre-Warranty issue path.

## Cube M Activation

Reject reserved/consumed Claim Roll.

## Cube M Admin Warranty void

Keep Q open-Claim guard through R completion.

## Cube N resolver

Treat `consumed` Claim Roll as terminal unavailable when no effective Warranty exists.

## Production void

During implementation, re-audit the exact current Production Order void predicate. A Roll already transferred to a Center and/or reserved/consumed for Claim fulfillment must never be silently erased or made contradictory by Production void. Reuse existing downstream-operation guards where they already cover this; add only the missing narrow claim-consumption guard if required.

These are compatibility patches, not redesign permission.

---

# 26. Concurrency / hard cases

R must permanently test:

1. two Admins assign same authorized Resolution;
2. reassignment races Roll reservation;
3. Roll reservation races ordinary Transfer;
4. Roll reservation races Roll Opening;
5. Roll reservation races Warranty Activation;
6. same Roll allocated concurrently to two Resolutions → one winner;
7. allocation release races Center completion → either release wins and completion fails recoverably, or completion consumes and release fails; never both;
8. replacement completion retried after network ambiguity → one consumed allocation, one completion;
9. performing Center suspended after assignment but before allocation → reassign works;
10. Center suspended while Roll reserved but unused → Admin release then reassign;
11. Center suspended after physical use but before digital completion → bounded Admin recovery path, no guessed material;
12. second Claim submission races R completion → no overlapping open Claims;
13. Warranty void races R completion → deterministic valid winner; no voided Warranty with still-open unresolved Claim;
14. consumed Roll later attempts Transfer/Open/Activation → all blocked;
15. consumed Roll own public Warranty URL → `unavailable_for_warranty`;
16. original Warranty expiry during R → fulfillment continues and original expiry remains unchanged.

---

# 27. Required tests

## Resolution state

- only authorized→assigned→completed;
- completed immutable;
- remedy shape constraints;
- assignment active-Center requirement;
- reassignment reason and no-reserved-allocation guard;
- Claim remains open through assigned state;
- completion sets Claim `closed_at`.

## Roll allocation

- eligibility predicates;
- one reserved/consumed allocation per Roll;
- one active/consumed material path per Resolution;
- release only before consumption;
- consumed terminal;
- reserved/consumed guards in Transfer/J/K/M;
- public resolver terminal state after consumption.

## Evidence

- completion min 1 / max 5;
- JPEG/PNG/WebP only;
- 8 MiB/image limit;
- private access;
- compensation on failed final mutation;
- completed Resolution never references missing evidence.

## Authorization

- Admin allocation only;
- only assigned active Center normally completes;
- wrong Center denied;
- suspended Center denied normal completion;
- Admin recovery only under inactive-Center condition;
- Agent/Dealer denied;
- customer cannot access raw completion evidence/internal Roll identity.

## Regression

- P Claim intake/open-case invariant PASS;
- Q decision/inspection/void guard PASS;
- Transfer receipt/custody gates PASS;
- Cube J/K guards PASS;
- Cube M Warranty Quality PASS;
- Cube N Public Warranty Quality PASS;
- Cube L Notification Quality PASS.

---

# 28. Hosted end-to-end acceptance scenarios

R cannot close on isolated unit tests only.

Staging must prove at least:

## Scenario A — approved service without replacement Roll

1. active customer Warranty;
2. customer Claim submitted;
3. Company reviews and approves;
4. authorized Resolution assigned as `service_reinstall`;
5. Center opens task on mobile;
6. Center uploads completion image/note;
7. Resolution completes;
8. Claim closes;
9. customer verified page shows completed;
10. Warranty expiry unchanged.

## Scenario B — approved replacement Roll

1. approved Claim/authorized Resolution;
2. assign performing Center and replacement remedy;
3. candidate Roll initially elsewhere → ordinary Transfer to Center and confirmed receipt;
4. Admin allocates Roll only after custody is confirmed;
5. Roll disappears from conflicting normal Transfer/Open/Activation eligibility;
6. Center verifies exact allocated Roll and submits completion evidence;
7. allocation becomes consumed + Resolution completed + Claim closed atomically;
8. replacement Roll cannot activate a Warranty;
9. replacement Roll's own `/w/` resolves unavailable;
10. original customer `/w/` remains unchanged and shows original Warranty + completed service state after verification.

## Scenario C — Center becomes unavailable

Prove assignment/reassignment and the narrow recovery path produce no dead end and do not silently move/release Roll custody.

---

# 29. Cube R Definition of Done

Cube R is GO only when:

1. implementation starts from merged/qualified Cube Q `main`;
2. approved Claim creates/uses exactly one Resolution;
3. Company can assign one of the two frozen operational remedy kinds;
4. performing Center can be reassigned before completion with explicit material-release discipline;
5. R does not create automatic Transfers;
6. replacement candidate must already be in confirmed custody of performing Center before allocation;
7. Admin can reserve/release exactly one eligible replacement Roll at a time;
8. reserved Roll is blocked from conflicting Transfer/Open/Issue/Activation paths;
9. normal Center completion requires private image evidence and note;
10. replacement completion atomically consumes exact allocated Roll and completes Resolution;
11. consumed replacement Roll is permanently barred from customer Warranty and ordinary reuse;
12. Cube N shows consumed replacement Roll as unavailable for Warranty activation;
13. original Warranty Public Code and coverage expiry remain unchanged;
14. Claim `closed_at` is set only on successful fulfillment completion (or earlier Q rejection/cancellation);
15. no accounting/financial fields/workflows exist;
16. inactive-Center recovery has a narrow auditable non-impersonation path;
17. full Warranty service history is reconstructable without rewriting Warranty issuance;
18. PR Quality + Database Quality + P + Q + relevant Transfer/J/K/M/N/L regression gates + dedicated **Cube R Claim Fulfillment Quality** PASS on exact final SHA;
19. hosted end-to-end Scenarios A/B/C PASS on mobile-relevant actors;
20. independent engineering/security + operational/DoD second audit PASS.

---

# 30. Claims macro closure rule

After Cube R passes its exact-HEAD gates, run one independent end-to-end **Claims Macro Audit** across P/Q/R.

The macro is GO only when it proves:

```text
Warranty
  → Customer Claim
  → Company Review
  → optional Center Inspection
  → Company Decision
  → approved Resolution
  → optional ordinary Roll Transfer
  → replacement allocation
  → service/reinstall completion
  → Claim closure
  → Warranty service history
```

with:

- no second customer Warranty on replacement material;
- no changed original Warranty expiry;
- no new customer QR;
- no financial subsystem;
- no dead end from Center suspension or Warranty expiry;
- no contradictory Roll ownership/reservation state;
- no unauthorized customer/Center data exposure.

Only then is the Claims/Resolution core lifecycle functionally complete for the V1 product scope.
