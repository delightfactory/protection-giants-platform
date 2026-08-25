# Cube R — Approved Claim Resolution / Replacement & Reinstall

**Status:** DRAFT FOR FINAL PRODUCT / ENGINEERING REVIEW — product decisions are APPROVED/FROZEN  
**Version:** 1.2  
**Planning baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Implementation base:** must be the merged Cube Q HEAD, not the planning baseline above  
**Depends on:** Cubes P + Q, Roll Custody/Transfer foundation, Cube J Roll Opening, Cube K Pre-install Issue, Cube M Warranty Activation/support, Cube N Public Warranty resolver, Cube L Notifications/PWA  
**Consumes but does not redefine:** `docs/claims-product-decisions-amendment.md`, `docs/claims-pqr-master-architecture.md`  
**Primary responsibility:** execute the physical operational remedy for one approved Claim, optionally consuming one tracked replacement Roll, record completion evidence, and close the end-to-end Claim without changing the original Warranty term or introducing finance.

---

# 1. Purpose

Cube Q answers whether the Claim is accepted. Cube R answers whether the accepted remedy was actually carried out.

R starts from the one-to-one `warranty_claim_resolutions` row created by Q in:

`authorized`

It ends only when the physical service is completed and recorded:

`completed`

Core invariant:

> An approved Claim is not closed merely because Company approved it. It closes only when its authorized physical remedy is completed.

---

# 2. Inherited rules

R must preserve all of the following:

1. original Claim remains `approved`; R does not rewrite adjudication;
2. Claim `closed_at` remains null while fulfillment is incomplete;
3. original Warranty remains the customer Warranty record;
4. original `coverage_expires_at` never restarts/extends because of V1 service;
5. original `/w/<PUBLIC-CODE>` remains the customer Warranty identity;
6. replacement Roll is a real tracked physical Roll; no replacement inventory subsystem exists;
7. existing Transfer/Custody remains the only ordinary physical-movement engine;
8. R never auto-creates Transfer/receipt;
9. replacement Product compatibility is policy-driven; V1 enables same Product/SKU only, but equality is not a permanent schema invariant;
10. replacement Roll must still record the real physical Cube J Opening before it can be consumed;
11. replacement Roll may use the existing Cube K pre-install quality path before use;
12. once consumed for Claim fulfillment, replacement Roll can never issue an independent customer Warranty;
13. no cost/payment/reimbursement fields or workflows exist.

---

# 3. Cube R scope

## In scope

- Admin Resolution queue/detail;
- remedy selection;
- performing Center assignment/reassignment;
- Center fulfillment task;
- bounded replacement Roll candidate resolver;
- one authoritative Replacement Product Eligibility Policy boundary shared by candidate reads and allocation;
- V1 same-Product default eligibility without hard schema coupling;
- server-generated Product eligibility basis snapshot on successful Roll allocation;
- Admin Roll reservation/release;
- narrow Cube J Opening compatibility for a Claim-reserved Roll;
- reuse of Cube K Pre-install Issue on that opened reserved Roll;
- exact replacement Roll verification;
- terminal Claim-fulfillment consumption;
- completion note + required private completion images;
- normal Center completion;
- narrow Admin recovery completion if the assigned Center becomes inactive after real work/material use;
- Resolution events/timeline;
- Claim `closed_at` finalization;
- Warranty service-history projection;
- verified customer completion projection;
- Cube L fulfillment notifications;
- minimal compatibility guards in Transfer/J/K/M/N and Production void where actually required.

## Explicitly out of scope

- changing Q final decision;
- Resolution cancellation/reopen;
- refunds/credits/invoices/labor charges;
- automatic Roll transfer or receipt;
- customer Warranty renewal;
- replacement customer QR;
- customer account/OTP;
- generic stock reservation engine;
- arbitrary remedy/work-order builder;
- scheduling/calendar;
- multi-Roll fulfillment for one V1 Claim;
- a second Roll Opening or quality-control subsystem;
- cross-Product/SKU substitution configuration in V1;
- an unused generic Product compatibility engine or substitution matrix.

---

# 4. Resolution state model

Frozen V1 states are exactly:

```text
authorized
assigned
completed
```

Transition:

```text
authorized → assigned → completed
```

No backwards transition and no Resolution `cancelled` state.

Reassignment while `assigned` changes performing Center with an immutable event but does not add another state.

Operational readiness is derived from assignment, allocation, Product-policy eligibility, Opening and quality facts rather than extra workflow statuses.

---

# 5. Resolution persistence extension

Q creates the minimal header. R extends it logically:

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

Allowed remedy kinds:

- `service_reinstall`;
- `replacement_roll_reinstall`.

Shape:

- `authorized`: remedy/Center/assignment/completion fields null;
- `assigned`: remedy + performing Center + assignment actor/time present, completion null;
- `completed`: assignment + completion actor kind/profile/time/note present.

Completion note target: 10–2000 trimmed characters.

Completed row is terminal and immutable.

No financial columns.

---

# 6. Remedy + performing Center assignment

Admin mutation, logically:

`assign_warranty_claim_resolution(...)`

Initial assignment:

`authorized → assigned`

Commit-time checks:

1. active Admin;
2. Claim exactly `approved`;
3. Claim `closed_at is null`;
4. Resolution exactly `authorized`;
5. Warranty still exists and is not `voided_in_error`;
6. performing party is a real operational Center;
7. Center active.

Protection Giants approval badge is not a remedy-performance gate in V1.

Mutation persists remedy/Center/actor/time + `resolution_assigned` event + Center notification atomically.

---

# 7. Reassignment

Admin may reassign an unresolved `assigned` Resolution when current Center cannot perform the work.

Requirements:

- Resolution not completed;
- Claim open;
- new Center active;
- new Center differs;
- mandatory reason 5–500 chars;
- **no active `reserved` replacement Roll allocation**.

If a Roll is reserved, Admin explicitly releases it first. R does not move/release material as a side effect.

If that Roll had already been opened, release does not undo Cube J Opening. Any later physical handling follows the existing opened-Roll rules/Recovery.

Reassignment updates performing Center and appends `resolution_reassigned` with old/new Center + reason.

Old Center loses task access immediately; new Center receives notification.

---

# 8. Existing Transfer/Custody boundary

R never bypasses custody.

If desired replacement Roll is held elsewhere:

1. do not allocate it;
2. use ordinary existing Transfer;
3. recipient Center confirms receipt;
4. only after confirmed custody equals performing Center may Admin allocate it.

This avoids special Claim-aware Transfer semantics.

R may explain that suitable material is not currently held by the Center, but it must not create a hidden Transfer from the Resolution page.

---

# 9. Replacement Product Eligibility Policy + candidate resolver

For `replacement_roll_reinstall`, Admin gets a narrow resolver/list limited to Rolls currently held by the assigned Center.

No global inventory browser is added.

Product compatibility must not be duplicated throughout R. Introduce one authoritative private/server policy boundary, logically equivalent to:

```text
resolve_claim_replacement_product_eligibility(
  original_warranty_product_id,
  candidate_roll_product_id
) -> { eligible, basis_code }
```

Exact implementation naming/location follows repository conventions, but its responsibility is frozen:

- candidate list/read path uses it;
- final Roll reservation mutation uses it again under authoritative locks;
- client cannot supply or override `eligible` or `basis_code`;
- Claim/Resolution/allocation tables do not carry a permanent equality constraint between Warranty Product and replacement Roll Product.

## 9.1 V1 Product policy

The only enabled V1 policy is:

```text
eligible = candidate_roll.product_id = original_warranty.product_id
basis_code = 'same_product_default'
```

Therefore V1 behavior remains same canonical Product/SKU by default and in actual operation.

This equality belongs **inside this policy boundary only**. Do not scatter `candidate.product_id = warranty.product_id` across candidate SQL, UI, completion, Transfer or unrelated lifecycle functions.

A future Company-approved substitution policy may extend the policy implementation/configuration to accept selected alternative Products without redesigning the Claim/Resolution lifecycle or physical Roll lifecycle.

Do **not** build that future mapping/configuration now.

## 9.2 General physical Roll candidate checks

At allocation commit time, candidate Roll must satisfy at minimum:

1. Roll exists;
2. parent Production Order generated/non-voided;
3. Roll not terminally unavailable;
4. confirmed custodian = assigned performing Center;
5. no active Transfer reservation;
6. **no Cube J Opening yet**;
7. no effective customer Warranty;
8. no terminal prior state that makes it unusable;
9. no active Claim allocation elsewhere;
10. no prior Claim `consumed` relationship;
11. Product policy returns `eligible=true` and a valid server-generated basis code.

Because allocation requires an unopened Roll, there should normally be no Cube K issue yet. Implementation must still inspect current J/K/M/H predicates and reuse authoritative helpers rather than duplicate them.

Read-time eligibility is advisory; allocation mutation revalidates every rule under locks using the same Product-policy boundary.

---

# 10. Replacement Roll allocation

Use dedicated history:

```text
warranty_claim_resolution_roll_allocations
- id                        UUID PRIMARY KEY
- resolution_id             UUID NOT NULL -> warranty_claim_resolutions.id
- roll_id                   UUID NOT NULL -> rolls.id
- product_eligibility_basis TEXT NOT NULL
- status                    TEXT NOT NULL DEFAULT 'reserved'
- reserved_by_profile_id    UUID NOT NULL -> profiles.id
- reserved_at               TIMESTAMPTZ NOT NULL
- released_by_profile_id    UUID NULL -> profiles.id
- release_reason            TEXT NULL
- released_at               TIMESTAMPTZ NULL
- consumed_by_profile_id    UUID NULL -> profiles.id
- consumed_at               TIMESTAMPTZ NULL
- created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
```

`product_eligibility_basis` rules:

- generated only by the authoritative policy boundary;
- never accepted as client input;
- trimmed/bounded stable code, recommended 2–80 characters;
- V1 value is `same_product_default`;
- do **not** add a database CHECK that permanently restricts it to the V1 code;
- immutable after allocation creation;
- records why the exact Roll was eligible at allocation time so later policy changes do not rewrite history.

Allowed allocation states:

```text
reserved
released
consumed
```

Rules:

- only `replacement_roll_reinstall` may have allocation;
- at most one `reserved` allocation per Resolution;
- at most one `consumed` allocation per Resolution;
- one Roll may have at most one `reserved` or `consumed` Claim allocation system-wide;
- released rows remain historical;
- consumed is terminal/permanent;
- no generic direct update/delete.

No separate `replacement_product_id` is needed: the exact allocated Roll already owns its canonical Product identity. The eligibility basis explains the policy decision without duplicating Product ownership.

---

# 11. Reserve replacement Roll

Admin-only mutation, logically:

`reserve_claim_resolution_roll(...)`

Requires:

- Claim approved/open;
- Resolution assigned;
- replacement remedy;
- performing Center active;
- candidate passes section 9 under authoritative locks;
- no reserved allocation already exists for Resolution.

Atomic effects:

1. resolve authoritative Product eligibility and basis code;
2. reject if not eligible;
3. create `reserved` allocation with that immutable `product_eligibility_basis`;
4. append `replacement_roll_reserved` event;
5. conflicting normal operations become blocked immediately.

No Transfer and no Opening are created by reservation itself.

Idempotent retry returns the same allocation and same eligibility basis. A conflicting retry for a different Roll fails deterministically.

---

# 12. Claim-reserved Roll Opening — reuse Cube J

The replacement Roll must record the same real physical fact as every other Roll:

> the assigned Center physically opened it.

Do **not** create a Claim-specific Opening table.

R adds only the minimal compatibility logic required around existing Cube J `roll_openings` / `open_roll` behavior.

For a Roll with one active Claim allocation `reserved`, Cube J Opening is allowed only when all are true:

1. caller is authenticated active Center user;
2. current custodian is that Center under ordinary J rules;
3. allocation belongs to an open approved Claim's `assigned` Resolution;
4. Resolution remedy = `replacement_roll_reinstall`;
5. Resolution performing Center = caller's Center;
6. allocation still `reserved`;
7. no existing Opening;
8. no pending Transfer reservation;
9. Roll still satisfies ordinary Production eligibility;
10. no consumed Claim relationship exists.

Opening writes the **existing immutable `roll_openings` row**. It does not change Claim status, Resolution status, Warranty, Product eligibility basis or custody.

The Opening should occur after reservation (`opened_at >= reserved_at`) and is required before replacement completion.

Possession of Roll QR remains only identification, never authority.

---

# 13. Replacement Roll Pre-install Issue — reuse Cube K

After the reserved Roll has been opened, the performing Center may discover a manufacturing/physical problem before installing it.

The existing Cube K workflow remains the only quality path.

R must **not** block a merely `reserved` Claim Roll from Cube K once ordinary K eligibility (including Opening/current custody) is satisfied.

Cube K behavior applies unchanged:

- issue `submitted` → unresolved quality hold;
- `cleared_for_use` → quality hold removed;
- `reported_in_error` → issue-specific hold removed;
- `return_required` → Roll must not be used.

R adds Claim-consumption interpretation:

- while any issue is `submitted`, Resolution completion/consumption fails closed;
- historical `return_required` permanently blocks this Roll from Claim consumption;
- all issue history only `cleared_for_use` / `reported_in_error` permits fulfillment to continue subject to other R rules.

## Defective replacement Roll path

If Company decides `return_required`:

1. Claim Resolution remains assigned/open;
2. Admin explicitly releases the **unused** Claim allocation;
3. release does not undo Roll Opening, Product eligibility basis or issue history;
4. existing Cube J Opened Roll Recovery may handle physical return under its ordinary rules after Cube K resolution;
5. Admin may later reserve a different eligible unopened Roll for the same Resolution after all current rules and current Product policy pass.

No automatic Recovery/Transfer occurs.

This closes the replacement-material defect case without a second quality subsystem.

---

# 14. Release unused allocation

Admin-only mutation:

`release_claim_resolution_roll(...)`

Allowed while allocation exactly `reserved` and Resolution incomplete.

Requires reason 5–500 chars.

Atomic:

- allocation → `released`;
- actor/reason/time;
- `replacement_roll_released` event.

Release is required before:

- choosing another Roll;
- reassigning Center;
- moving an unopened Roll through ordinary Transfer.

After release:

- if Roll remains unopened, ordinary eligibility may resume subject to all existing rules;
- if Roll was already opened, it remains opened forever under Cube J; ordinary Transfer remains blocked and any physical return uses opened-Roll Recovery where eligible;
- any Cube K issue history remains authoritative;
- the historical allocation's `product_eligibility_basis` remains immutable evidence and does not authorize a later new allocation by itself.

Consumed allocation can never be released.

---

# 15. Guards while allocation is reserved

A `reserved` Claim Roll must fail closed in:

- ordinary Transfer creation/selection;
- Cube M Warranty Activation;
- allocation to another Claim Resolution.

Cube J Opening is **not generally blocked**: only the exact section 12 Claim-performing Center/context may open it.

Cube K is **not blocked** after that Opening: the existing Pre-install Issue lifecycle remains available.

Do not silently release reservation when conflicting operations are attempted.

Cube N does not need a new public label/state for mere reservation/opening; the Roll becomes terminally unavailable only after Claim consumption or another existing terminal lifecycle reason.

---

# 16. Performing Center task

Active users bound to assigned performing Center may read one narrow unresolved Resolution projection:

- Claim Number;
- approved customer-safe remedy instruction;
- original Warranty Product name/version snapshot;
- vehicle identity needed to work on correct car;
- affected area;
- customer description;
- relevant Claim/inspection images;
- relevant Warranty coverage context;
- remedy kind;
- allocated replacement Roll serial/product identity when applicable;
- whether replacement Roll is reserved/opened/blocked by unresolved quality issue.

Do not expose finance, unrelated customer history, private Admin audit, or other inventory.

The UI may show the selected replacement Product identity when a Roll is allocated, but it must not infer or decide Product compatibility client-side.

For replacement remedy the UI should guide the natural sequence:

**allocated → scan/open exact Roll → if defect, report through existing Roll Issue → otherwise complete installation → submit completion evidence.**

---

# 17. Completion evidence

Use private `warranty-claim-evidence` bucket and dedicated metadata:

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

Normal completion requires:

- minimum 1 image;
- maximum 5;
- maximum 8 MiB/image;
- JPEG/PNG/WebP;
- completion note;
- no video.

Use server-controlled upload, private signed reads and compensation pattern already established by P/Q/K.

---

# 18. Normal Center completion

Named operation, logically:

`complete_warranty_claim_resolution(...)`

Caller must be active Profile bound to exact assigned active Center.

Common preconditions:

1. Claim `approved`;
2. Claim `closed_at is null`;
3. Resolution `assigned`;
4. performing Center = caller Center;
5. valid completion note;
6. 1–5 valid staged completion images;
7. Warranty relationship intact and Warranty not `voided_in_error`.

## `service_reinstall`

- no active/consumed replacement allocation.

## `replacement_roll_reinstall`

Additionally require:

1. exactly one allocation `reserved`;
2. allocation has non-empty immutable server-generated `product_eligibility_basis`;
3. allocated Roll still confirmed custody of performing Center;
4. exact Roll still has the same canonical Product identity it had when allocated; Roll Product identity must not be mutable through this lifecycle;
5. exactly one Cube J Opening exists for that Roll;
6. `opened_by_center_party_id` = performing Center;
7. Opening occurred after the allocation reservation;
8. no active Transfer reservation/conflict;
9. no effective customer Warranty;
10. no Cube K issue currently `submitted`;
11. no historical Cube K `return_required`;
12. exact allocated Roll is confirmed/scanned at completion.

A different Roll fails closed.

**Do not re-run the current/latest Product eligibility policy at completion.** Allocation was the authoritative Product-eligibility decision point and its basis is snapshotted. A later Company policy change must not retroactively invalidate a Roll already validly reserved under an earlier basis.

### Atomic database effects

For `service_reinstall`:

- Resolution → `completed`;
- completion fields/evidence metadata;
- `resolution_completed` event;
- Claim `closed_at` set;
- notifications materialized.

For replacement remedy, the **same transaction** additionally:

- allocation `reserved → consumed`;
- consumed actor/time;
- `replacement_roll_consumed` event;
- terminal consumed-Roll guards become effective.

There is **no new Warranty Activation** for replacement material.

Cube J Opening happened earlier as the real physical Opening fact; completion does not synthesize or backdate it.

Idempotent retry returns already-completed result rather than double-consuming.

---

# 19. Narrow Admin completion recovery

Normal assigned active Center records completion.

Dead-end case: real work/material use occurred but assigned Center becomes inactive/suspended before digital completion.

Allow one narrow Company recovery operation:

`admin_complete_claim_resolution_recovery(...)`

Only when:

- active Admin;
- Resolution still assigned and Claim open;
- assigned Center currently inactive/suspended;
- required completion evidence provided through Company-controlled private upload;
- mandatory reason 5–500 chars;
- all remedy-specific facts can still be proven.

For replacement remedy, Admin must prove the exact reserved Roll was opened/used, that the allocation carried a valid recorded Product eligibility basis, and that all quality constraints pass. If material identity/use cannot be proven, Admin must not guess or consume it.

Recovery records `completion_actor_kind='admin_recovery'` + immutable recovery event/reason.

This is not Center impersonation and not a general Admin completion shortcut while Center is active.

---

# 20. Consumed replacement Roll terminal behavior

Once allocation = `consumed`, Roll is permanently Claim Fulfillment material.

Authoritatively block:

- ordinary Transfer;
- new Roll Opening;
- new Pre-install Issue / Opened Roll Recovery paths that imply pre-use material;
- Warranty Activation;
- another Claim allocation;
- return to ordinary inventory.

Existing historical Cube J Opening, Cube K events and allocation Product eligibility basis remain readable/auditable.

There is no `unconsume`.

Confirmed custodian remains last operational Center; no fake Customer operational-party custody row.

---

# 21. Cube N public Warranty resolver compatibility

Every Roll has its own permanent Public Code.

After replacement Roll is consumed for Claim fulfillment, if it has no effective Warranty, its own `/w/<PUBLIC-CODE>` resolves:

`unavailable_for_warranty`

not `not_activated`.

This prevents printed replacement-Roll Warranty stickers from implying later Warranty eligibility.

The serviced customer's Warranty page remains the **original source Roll Public Code**. It continues to show original Warranty and, after phone verification, the Claim/service history.

No code rotates.

---

# 22. Original Warranty / service history

R does not change:

- Warranty Number;
- source Roll;
- activated_at;
- coverage_expires_at;
- Product policy snapshot;
- activating Center snapshot;
- original Public Code.

Internal service history may show Claim, decision, inspection, remedy, performing Center, replacement Roll internal identity/Product, Product eligibility basis, completion/evidence/timeline.

Verified customer history shows only Claim Number, customer-facing decision, remedy/progress, assigned Center when relevant, and completion date/status.

No replacement serial/ERP identity, Product eligibility basis, private reason, custody history or audit actor is customer-visible.

---

# 23. Warranty `voided_in_error`

Q blocks Warranty void while Claim open. R preserves the guard until completion.

Only after Resolution completed + Claim `closed_at` may Cube M void-in-error be evaluated under ordinary rules.

R completion does not void/renew Warranty.

Later Warranty correction cannot erase Claim/Resolution/Opening/Issue/consumption history.

---

# 24. Resolution events

Append-only Resolution event stream includes:

- `resolution_assigned`;
- `resolution_reassigned`;
- `replacement_roll_reserved`;
- `replacement_roll_released`;
- `replacement_roll_consumed`;
- `resolution_completed`;
- `resolution_completed_admin_recovery` when used.

`replacement_roll_reserved` evidence must be sufficient to reconstruct the exact Roll and the server-generated Product eligibility basis used by the allocation; this may live on the allocation row and be referenced by the event rather than duplicated as free-form text.

Cube J/K keep their own Opening/Issue event domains; R references/composes them but does not duplicate them into fake Resolution events.

Events are immutable and not comments/chat.

---

# 25. Notifications

Reuse Cube L.

## Assigned/reassigned

Performing Center: action-required Inbox/Push as appropriate.

## Replacement Roll reserved

Notify only if it changes required Center action; avoid redundant Push.

## Pre-install Issue

Existing Cube K notifications/queue semantics remain authoritative for quality review. R does not create duplicate Company quality alerts.

## Resolution completed

Admin: informational/operational Inbox. Avoid pushing actor about its own synchronous success. Customer follows verified Claim page; no SMS/email/WhatsApp.

---

# 26. RLS / authorization

## Admin

May:

- list/read Resolutions;
- assign/reassign Center;
- list eligible Rolls within assigned Center scope;
- reserve/release replacement Roll;
- read Resolution evidence;
- invoke narrow inactive-Center recovery completion.

Admin may choose a candidate Roll only from the authoritative resolver result; Admin does not manually override Product-policy eligibility or type an eligibility basis.

## Assigned Center

May:

- read only assigned unresolved Resolution;
- see exact allocated Roll;
- open that reserved Roll through the bounded Cube J compatibility path;
- use existing Cube K issue submission if defect found;
- upload completion evidence;
- complete its own assigned Resolution.

Cannot:

- choose/allocate arbitrary Company Rolls;
- override Product eligibility;
- transfer Roll through R;
- change remedy;
- assign Center;
- release allocation;
- alter Claim decision;
- restart Warranty.

## Agent / Dealer

No R Resolution authority. Existing Agent Opened Roll Recovery capability remains a separate Cube J capability and is usable only under its existing rules after Claim allocation is released when relevant.

## Anonymous

No direct R table/Storage access; customer reads verified projection only.

---

# 27. Minimal compatibility changes R must make

R may touch completed cubes only through guards/exceptions needed for approved lifecycle.

## Transfer

- `reserved` Claim allocation → ordinary Transfer blocked;
- `consumed` → blocked;
- after allocation release, Transfer follows ordinary rules; if Roll was opened, Cube J already blocks ordinary Transfer.

Transfer does not need to know same-Product vs future substitute Product. Product compatibility belongs only to R's allocation policy.

## Cube J Opening

- `consumed` → blocked;
- `reserved` → allowed only for exact assigned performing Center/context in section 12;
- no second Opening engine.

## Cube K Pre-install Issue

- `reserved + opened` → allowed under existing K rules;
- `consumed` → new issue blocked;
- R completion consumes only when no pending issue and no `return_required` history.

## Cube M Activation

- `reserved` and `consumed` → blocked.

If allocation is released before consumption, ordinary M rules apply; existing Cube J/K facts may still independently permit/block Activation.

## Cube M Admin Warranty void

Keep Q open-Claim guard through R completion.

## Cube N resolver

Consumed Claim Roll → terminal unavailable when no effective Warranty.

## Production void

Re-audit exact current predicate at implementation. A Roll with downstream transfer/opening/Claim allocation/consumption must never be made contradictory by Production void. Add only missing narrow Claim guard; reuse existing downstream-operation guards otherwise.

These are compatibility patches, not redesign permission.

---

# 28. Concurrency / hard cases

Permanently test:

1. two Admins assign same authorized Resolution;
2. reassignment races reservation;
3. reservation races ordinary Transfer;
4. same Roll reservation by two Resolutions → one winner;
5. V1 same-Product candidate accepted by centralized Product policy;
6. V1 different-Product candidate rejected by centralized Product policy;
7. read-time candidate result becomes stale before reservation → reservation re-evaluates under locks;
8. successful allocation records one immutable eligibility basis and retry returns the same basis;
9. exact assigned Center Opening races allocation release → deterministic winner; no unauthorized stale Opening;
10. unrelated Center/ordinary Opening attempt against reserved Roll → rejected;
11. Pre-install Issue submission races Resolution completion → one winner; pending issue prevents consumption;
12. `return_required` Roll completion attempt → rejected;
13. allocation release races completion → either release wins and completion fails or completion consumes and release fails;
14. completion retry → one consumption/one completion;
15. Center suspended before Opening → normal Opening denied; Admin can release/reassign;
16. Center suspended after Opening but before use → allocation can be released; physical Roll remains opened and follows Recovery rules;
17. Center suspended after real use before completion → narrow Admin recovery, no guessed material;
18. second Claim races R completion → no overlap;
19. Warranty void races R completion → no voided Warranty + unresolved open Claim contradiction;
20. consumed Roll attempts Transfer/Open/Issue/Activation → blocked;
21. consumed Roll own public URL → unavailable;
22. original Warranty expiry during R → completion continues, expiry unchanged.

Future Product policy changes must have their own tests, but V1 must already prove that Product equality is centralized rather than encoded as an allocation schema invariant.

---

# 29. Required tests

## Resolution

- only authorized→assigned→completed;
- no cancelled/reopen state;
- remedy shape;
- active Center assignment;
- reassignment requires no reserved Roll;
- Claim open until completion;
- completion sets Claim `closed_at`.

## Replacement Product policy

- one authoritative policy boundary exists;
- candidate resolver and reservation mutation both use it;
- V1 same Product returns eligible with `same_product_default`;
- V1 different Product returns ineligible;
- client cannot supply eligibility/basis;
- allocation schema has no hard same-Product CHECK/foreign-key shape;
- successful allocation snapshots immutable bounded `product_eligibility_basis`;
- completion uses the allocation snapshot and exact Roll/Product identity rather than reinterpreting eligibility under a later policy.

## Allocation / physical Roll

- candidate unopened at allocation;
- one reserved/consumed owner per Roll;
- release only before consumption;
- Claim-reserved Cube J Opening exact-context authorization;
- Opening immutable and after reservation;
- Cube K issue allowed after Opening;
- submitted/return_required issue blocks completion;
- cleared/reported-in-error path permits completion;
- return_required supports explicit release then existing Recovery;
- consumed terminal guards across Transfer/J/K/M/N.

## Evidence

- completion min 1 / max 5;
- JPEG/PNG/WebP;
- 8 MiB/image;
- private access;
- compensation on failed mutation;
- completed Resolution never references missing evidence.

## Authorization

- Admin allocation only;
- assigned Center only opens/completes;
- wrong Center denied;
- suspended Center denied normal actions;
- Admin recovery only under inactive-Center condition;
- Agent/Dealer no Resolution authority;
- customer cannot access raw evidence/internal replacement identity/eligibility basis.

## Regression

- P open-case invariant;
- Q decision/inspection/void guard;
- Transfer/Custody;
- Cube J Opening/Recovery;
- Cube K Issue/Recovery integration;
- Cube M Warranty Quality;
- Cube N Public Warranty Quality;
- Cube L Notification Quality.

---

# 30. Hosted end-to-end acceptance

## Scenario A — approved service without replacement Roll

1. active Warranty;
2. Claim submitted;
3. Company approves;
4. Resolution assigned `service_reinstall`;
5. Center completes with image/note;
6. Resolution completes + Claim closes;
7. verified customer sees completion;
8. original Warranty expiry unchanged.

## Scenario B — approved replacement Roll, clean material

1. approved Claim/authorized Resolution;
2. assign Center + replacement remedy;
3. desired Roll elsewhere → ordinary Transfer + confirmed receipt;
4. candidate resolver shows the V1 same-Product Roll as policy-eligible;
5. Admin reserves Roll only after custody confirmed; allocation stores `same_product_default` basis;
6. assigned Center scans/opens exact Roll through Cube J;
7. no defect → installation/reinstall performed;
8. Center submits completion image/note + exact Roll confirmation;
9. allocation consumed + Resolution completed + Claim closed atomically;
10. Roll cannot activate independent Warranty;
11. replacement Roll `/w/` unavailable;
12. original customer `/w/` unchanged.

Also prove a different-Product Roll in the same Center is excluded/rejected by the V1 policy rather than by a hard allocation-schema constraint.

## Scenario C — replacement Roll found defective

1. Roll reserved to Resolution;
2. assigned Center opens exact Roll;
3. defect found → existing Cube K issue submitted;
4. R completion blocked while issue pending;
5. Company decides `return_required`;
6. Admin releases Claim allocation;
7. existing Opened Roll Recovery can return physical Roll under ordinary J/K rules;
8. another currently policy-eligible unopened Roll may be transferred/reserved later;
9. same approved Resolution continues without new Claim/decision.

Also test `cleared_for_use` path resumes normal R completion.

## Scenario D — Center unavailable

Prove pre-opening reassignment, post-opening unused recovery path, and post-use narrow Admin completion recovery without hidden custody/material changes.

---

# 31. Cube R Definition of Done

R is GO only when:

1. starts from merged/qualified Cube Q `main`;
2. one approved Claim owns exactly one Resolution;
3. only the two frozen remedy kinds exist;
4. performing Center assignment/reassignment works without hidden material moves;
5. no automatic Transfer exists;
6. replacement Roll must reach confirmed Center custody before allocation;
7. replacement Product eligibility is centralized behind one authoritative policy boundary;
8. V1 policy accepts same canonical Product/SKU only, but allocation schema does not permanently encode that equality;
9. eligible candidate must be unopened at allocation;
10. successful allocation stores immutable server-generated `product_eligibility_basis`;
11. Admin can reserve/release one Roll at a time;
12. reserved Roll cannot Transfer/Activate elsewhere;
13. assigned Center can create the existing Cube J Opening for exact reserved Roll;
14. reserved/opened Roll can use Cube K Issue; pending/return_required blocks consumption;
15. defective Roll can be released and handled through existing Opened Roll Recovery without closing the Claim;
16. completion requires private images + note;
17. replacement completion atomically consumes exact allocated opened/cleared Roll and completes Resolution without re-running a newer Product policy;
18. consumed Roll permanently barred from Warranty/ordinary reuse and resolves unavailable publicly;
19. original Warranty Public Code + expiry unchanged;
20. Claim closes only on successful fulfillment (or earlier Q rejection/cancellation);
21. no accounting/financial scope exists;
22. inactive-Center recovery is narrow/audited/non-impersonating;
23. full service history is reconstructable without rewriting Warranty issuance;
24. PR Quality + Database Quality + P/Q + Transfer/J/K/M/N/L regressions + **Cube R Claim Fulfillment Quality** PASS on exact SHA;
25. hosted Scenarios A/B/C/D PASS;
26. independent engineering/security + operational/DoD audit PASS.

---

# 32. Claims macro closure

After R exact-HEAD gates, run one independent **Claims Macro Audit** proving:

```text
Warranty
  → Customer Claim
  → Company Review
  → optional Claim Inspection
  → Company Decision
  → approved Resolution
  → optional ordinary Roll Transfer
  → Replacement Product Eligibility Policy
  → replacement allocation
  → Cube J replacement Roll Opening
  → optional Cube K replacement Roll Issue
  → service/reinstall completion
  → Claim closure
  → Warranty service history
```

with:

- V1 same-Product default enforced by one centralized Product policy rather than permanent schema coupling;
- no second Warranty on replacement material;
- no changed original expiry;
- no new customer QR;
- no financial subsystem;
- no dead end from Center suspension, Warranty expiry or defective replacement Roll;
- no contradictory custody/reservation/Opening/Issue state;
- no unauthorized data exposure.

Only then is Claims/Resolution V1 functionally complete.
