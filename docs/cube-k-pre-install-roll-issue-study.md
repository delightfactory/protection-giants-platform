# Protection Giants — Pre-install Roll Issue Reporting Study

**Status:** Product/design study — not an implementation specification  
**Provisional cube name:** Cube K — Pre-install Roll Issue Reporting  
**Prepared:** 2026-08-22  
**Depends on:** completed Cube J — Roll Opening / Claiming

## 1. Why this is the next lifecycle cube

The approved lifecycle now reaches a Center that legitimately holds a physical Roll and records Roll Opening.

The next approved gap is the exceptional case where the Center discovers a manufacturing or physical problem **after Opening but before customer Warranty Activation**.

This boundary already exists in approved Product Decision PD-008 and in the post-Cube-J canonical status. It must remain separate from Warranty Activation and customer Claims.

The provisional `Cube K` numbering is used because Cube I is already reserved for the remaining Production-owned Label Package and Cube J owns Roll Opening. The number/name is not frozen by this study alone.

## 2. Source-supported facts already approved

The following are not new proposals:

1. the physical Roll is the tracked unit;
2. Roll Opening and Warranty Activation are separate lifecycle events;
3. an active authenticated Center that is the confirmed Roll custodian is the operational actor around Opening/Activation;
4. network approval is a trust/public designation and is not an Opening or Activation gate;
5. after Opening, the Center may report a manufacturing/physical issue before Warranty Activation;
6. evidence may be requested for issue handling;
7. photos/video/invoice/evidence are not mandatory for normal Warranty Activation merely because issue evidence exists as a separate concern;
8. Cube J Opening history is immutable and must be consumed as an existing prerequisite rather than rebuilt;
9. opened Rolls are already excluded from ordinary Transfer; exceptional physical return uses the separate Cube J Recovery path;
10. customer/VIN Warranty Activation, public Warranty token/URL, Claims, replacement and reinstall remain later responsibilities.

Primary references:

- `docs/product-decisions.md` — especially PD-003, PD-006, PD-007, PD-008, PD-009 and PD-031;
- `docs/cube-j-roll-opening-claiming-spec.md` — especially the separation from Pre-install Issue Reporting;
- `docs/post-cube-j-canonical-status-amendment.md`;
- `docs/gap-closure-roadmap.md` section 8.

## 3. Proposed bounded responsibility

The smallest complete useful responsibility is:

> Allow an eligible Center to create an auditable issue against an exact already-opened Roll before Warranty Activation, allow an authorized reviewer to reach an explicit operational decision, and expose that decision as a later Warranty-Activation eligibility input — without moving custody or creating customer/warranty/claim state.

This is intentionally more than a free-text note, but much smaller than a generic ticketing or claims engine.

## 4. Recommended eligibility boundary

### Reporter

Recommended first-release reporter:

- authenticated active Center profile;
- Center entity is active;
- exact Roll exists and Production Order remains generated/non-voided;
- Roll has a valid Cube J Opening;
- reporting Center is still the confirmed current custodian;
- no Warranty Activation exists for the Roll once that later cube is implemented;
- no other unresolved Pre-install Issue exists for the same Roll.

### Why current custody should still be required

The Opening record proves who opened the Roll historically. It does not prove who physically holds it now after a possible Recovery.

Therefore the recommended mutation rule is **Opening exists + reporter is current confirmed custodian Center**, not historical opening identity alone.

If the Roll has already been recovered to Agent/Company custody, the Center should not be able to create a new issue as if it still held the Roll.

### Network approval

Not required. This preserves PD-006/PD-008 and avoids turning a public trust badge into an operational permission.

## 5. Recommended issue identity and data model

Do not store this as a mutable field on `rolls` or `roll_openings`.

Recommended dedicated bounded context:

### `roll_preinstall_issues`

Minimum durable fields proposed for discussion:

- `id` — internal UUID;
- `issue_number` — human-operational reference, if approved;
- `roll_id` — exact physical Roll;
- `reported_by_profile_id`;
- `reporting_center_party_id`;
- `category` — controlled small category set;
- `description` — required human description;
- `status` — explicit current projection;
- `created_at`;
- `resolved_at` when terminal.

### History

Use immutable issue events for transitions/decisions rather than relying only on mutable timestamps/status.

Avoid a generic workflow/event engine; this issue domain only needs its own named events.

### Multiplicity

Recommended:

- historical multiple issues per Roll may exist over its lifetime;
- **at most one active/unresolved issue per Roll** at a time, enforced by a partial unique index or equivalent atomic rule.

This prevents duplicate parallel review without erasing history.

## 6. Category proposal — requires product-owner approval

A short category set is preferable to a large taxonomy in the first release.

Recommended candidate categories:

1. `manufacturing_defect` — suspected film/material manufacturing defect;
2. `physical_damage` — physical damage noticed on the Roll/film before installation;
3. `contamination_or_packaging` — contamination, packaging or handling condition affecting usability;
4. `other` — requires description.

These names are proposals, not approved business decisions.

Do not introduce severity matrices, root-cause taxonomies or SLA classification until there is a real operating need.

## 7. Review lifecycle — key decision still required

This is the main unresolved product question.

### Recommended minimal status model

Prefer a small explicit state machine:

- `submitted` — Center has reported the issue and no final decision exists;
- `cleared_for_use` — reviewer decided the Roll may continue toward installation/Warranty Activation;
- `return_required` — reviewer decided the Roll should not proceed and requires physical return/handling through the existing Recovery path.

A separate `under_review` state is not recommended initially unless the business actually needs ownership/queue semantics; opening the report is already enough to mean it is pending review.

### Recommended reviewer

**Recommended first release: Admin/Company only.**

Reason:

- it gives one authoritative manufacturing-quality decision point;
- it avoids inventing country-Agent quality powers before required;
- it keeps authorization and escalation simple;
- Agent can still perform physical Recovery only when its separate Cube J capability is enabled.

If operational volume later proves this too centralized, Agent review can be added through an explicit Product Decision rather than silently inheriting Recovery authorization.

This recommendation requires product-owner approval.

## 8. Does an open issue block Warranty Activation?

**Recommended: yes.**

A submitted unresolved issue represents uncertainty about whether the physical Roll should be used. Allowing Warranty Activation while that issue is unresolved creates a contradictory lifecycle.

Recommended future Activation handoff rule:

- no Pre-install Issue → Activation may proceed if all other Activation rules pass;
- latest/active issue = `submitted` → Activation blocked;
- terminal issue = `return_required` → Activation blocked;
- terminal issue = `cleared_for_use` → Activation may proceed if all other rules pass.

This rule should be frozen now as a handoff contract but implemented/enforced again at the future Warranty Activation boundary.

Product-owner approval is required because PD-008 confirms issue reporting exists but does not explicitly state the Activation blocking semantics.

## 9. Evidence strategy

PD-008 says evidence **may be requested**. It does not say every report must include evidence.

### Existing technical capability

The repository already has a secure Storage pattern for Product assets:

- metadata in PostgreSQL;
- actual file in Supabase Storage;
- server-only/admin Storage mutation;
- explicit mime/size validation;
- compensation when metadata/storage mutation partially fails;
- signed/private access rather than anonymous bucket exposure.

That pattern can be reused technically, but `product_assets` itself must **not** be reused because issue evidence is operational evidence, not Product content.

### Recommended first-release evidence behavior

Evidence should be **optional at report creation**.

If evidence is included in this cube, use a dedicated private issue-evidence metadata table/bucket and reuse the proven server-only upload/compensation pattern.

Do not make evidence mandatory for report creation unless the product owner explicitly requires it.

### Still unresolved

The phrase “evidence may be requested” could justify a later reviewer action `request_evidence`. That action adds another non-terminal state and response loop.

Recommended approach for first release:

- allow Center to attach optional images at submission;
- reviewer can make the final decision from the report/evidence available;
- defer a formal “request more evidence / Center responds” sub-workflow unless it is operationally necessary from day one.

This avoids turning Cube K into a ticketing system while respecting PD-008.

Product-owner approval is required.

## 10. Interaction with Cube J Recovery

Issue reporting must not move custody.

Recommended flow for a defective Roll:

`Opening → Issue submitted → Company decision return_required → physical Recovery when actually received`

The issue decision must **not automatically create or complete Recovery**. Cube J Recovery already has its own physical-receipt confirmation and custody rules and must remain the only exceptional custody-change path for an opened Roll.

Likewise, Recovery does not delete or rewrite the issue record.

A future UI may link the two histories, but no automatic cross-domain state engine is needed for the first release.

## 11. Interaction with ordinary Transfer

No new ordinary-Transfer rule is necessary.

Cube J already makes every opened Roll unavailable to a standard Transfer. A Pre-install Issue therefore does not need a second reservation/Transfer block.

## 12. Immutability and correction

Recommended:

- reporter cannot delete an issue after submission;
- description/category should not be silently rewritten after submission;
- reviewer decisions are immutable events;
- no generic Undo.

If a report was created by mistake, recommended terminal decision is a specific audited outcome such as `reported_in_error` **only if the product owner wants this case represented explicitly**.

Do not add it automatically unless a real operating case is confirmed.

## 13. UX study

### Center

Entry should be available from the opened Roll context/custody surface and may reuse the contextual Roll QR scanner.

Proposed mobile flow:

1. identify exact Roll by QR or serial;
2. system verifies Opening + current custody + issue eligibility;
3. show Product, Roll, Lot, Center and Opening time;
4. choose issue category;
5. enter required description;
6. optionally attach permitted evidence if evidence is approved for V1;
7. review irreversible submission statement;
8. submit;
9. show issue reference/status and next instruction.

### Admin reviewer

Simple queue/detail:

- submitted issues;
- exact Roll/Product/Lot/Center/Opening context;
- description and evidence;
- decision `cleared_for_use` or `return_required`;
- reason/comment for decision recommended as required;
- immutable timeline.

Do not build generic assignment, priority, SLA, comments, mentions or ticket routing in this cube.

## 14. Security boundary

Recommended contracts:

- Center can create/read only issues for Rolls it is currently entitled to report;
- Center cannot set review status or reviewer fields;
- Admin can read/review all issues;
- Agent/Dealer have no issue-review authority in V1 unless separately approved;
- no anonymous access;
- evidence bucket private;
- all mutations through named service/RPC actions with database revalidation;
- issue creation/decision idempotent and concurrency-safe;
- later Warranty Activation revalidates issue state atomically rather than trusting UI state.

## 15. Concurrency risks to test

If this design is approved, permanent tests must cover at least:

- duplicate issue creation for the same Roll;
- two concurrent submissions → one active issue maximum;
- issue submission racing with opened-Roll Recovery;
- issue decision racing with Recovery;
- future issue submission racing with Warranty Activation;
- decision retry/idempotency;
- reporter losing Center/activity/custody before commit;
- unauthorized Agent/Dealer/other Center access;
- immutable audit evidence.

The important race is submission vs Recovery: the reporter must still be the confirmed current custodian Center at commit time.

## 16. Explicit exclusions

This cube must not own:

- customer identity, phone or VIN;
- Warranty Activation;
- Warranty duration/snapshot creation;
- public Warranty token/URL/QR;
- customer Claims;
- replacement/reinstall approval;
- automatic stock/write-off/accounting credit;
- generic quality-management system;
- generic ticket/workflow engine;
- ordinary Transfer redesign;
- Cube I production labels.

## 17. Product decisions required before a frozen specification

The study cannot safely become an implementation spec until the product owner confirms these points:

### K-Q1 — Activation gate

Should any unresolved Pre-install Issue block Warranty Activation, with only `cleared_for_use` allowing later Activation?

**Recommendation:** yes.

### K-Q2 — Reviewer authority

Who can make the final quality decision in V1?

**Recommendation:** Admin/Company only. Do not infer review authority from Agent Recovery capability.

### K-Q3 — Final outcomes

Are these two terminal outcomes sufficient for V1?

- `cleared_for_use`;
- `return_required`.

**Recommendation:** yes; add no more states unless a real case requires them.

### K-Q4 — Issue category set

Approve or adjust:

- manufacturing defect;
- physical damage;
- contamination/packaging;
- other.

### K-Q5 — Evidence at creation

Should the Center be allowed to attach optional images when submitting?

**Recommendation:** yes, optional; private storage. Do not make evidence mandatory.

### K-Q6 — Formal evidence-request loop

Must the reviewer be able to formally request more evidence and wait for a Center response in V1?

**Recommendation:** no for the first release unless this is operationally necessary. Optional evidence at submission keeps the cube materially smaller.

### K-Q7 — Reported-in-error correction

Do we need an audited `reported_in_error` terminal outcome for accidental reports?

**Recommendation:** only add it if the business expects this case; otherwise keep V1 at the two quality outcomes.

## 18. Recommended next step after this study

1. product owner answers K-Q1 through K-Q7;
2. freeze those decisions in `docs/product-decisions.md` / Cube K specification;
3. re-fetch latest `main` after the Cube J post-merge audit patch is settled;
4. create a fresh implementation branch;
5. implement a complete vertical slice only for the approved Cube K boundary;
6. double-review and run permanent DB/application regressions before merge.

No Cube K database table, UI route, Storage bucket or lifecycle mutation should be implemented before the questions above are settled.
