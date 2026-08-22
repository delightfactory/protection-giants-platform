# Cube K — Pre-install Roll Issue Reporting

**Status:** Frozen specification — product decisions approved 2026-08-22  
**Baseline:** `main` at `382aecbebb53a52f6f6be75defd01cd78ff6975d`  
**Depends on:** completed Cube J — Roll Opening / Claiming, confirmed Roll custody, contextual Roll QR, and the existing opened-Roll Recovery path.  
**Precedence:** this specification supersedes the draft study in PR #61 for Cube K implementation decisions.

## 1. Purpose

Cube K closes one narrow lifecycle gap:

> an active installation Center that currently holds an already-opened Roll can report a suspected manufacturing/physical problem before Warranty Activation; the report immediately places that Roll under a temporary Activation hold until Protection Giants Company/Admin resolves the report.

Cube K is not a Claims system, customer-support ticket system, Warranty Activation flow, inventory write-off engine, or custody engine.

## 2. Approved product decisions

The following decisions were explicitly approved by the product owner on 2026-08-22 and are normative.

### K-D1 — Valid issue submission immediately places the Roll on Activation hold

A valid Pre-install Issue submission immediately blocks Warranty Activation for that Roll. Company confirmation is not required to start the hold.

Submission does **not** mean the Roll is proven defective. It means only that the Roll may not proceed to Warranty Activation while the issue remains unresolved.

The future Warranty Activation cube must revalidate this rule atomically at activation time.

### K-D2 — Company/Admin alone owns the final quality decision in V1

Only an active Protection Giants Admin acting for the Company may resolve a submitted issue.

Country Agent, Dealer, and Center users do not receive issue-review or quality-decision authority in V1. A Country Agent's separate Cube J opened-Roll Recovery capability does not grant quality-review authority.

### K-D3 — Two quality outcomes, plus one narrow administrative correction

Normal quality outcomes are exactly:

- `cleared_for_use` — Company reviewed the reported problem and decided the Roll may continue toward installation/Activation, subject to all other rules;
- `return_required` — Company decided the Roll must not proceed toward installation/Activation and should be physically returned/handled through the existing opened-Roll Recovery path.

A third terminal status exists only as an administrative correction:

- `reported_in_error` — Admin confirms the report itself was created in error. A reason is mandatory. This is not a quality clearance decision.

There is no generic Undo, reopen, assignment, approval chain, or editable terminal decision.

### K-D4 — V1 issue categories are deliberately small

Allowed categories are exactly:

- `manufacturing_defect`;
- `physical_damage`;
- `contamination_or_packaging`;
- `other`.

The category never determines the quality decision automatically. A human description is always required.

No severity matrix, root-cause taxonomy, SLA taxonomy, or extended QMS classification is introduced in V1.

### K-D5 — Image evidence is optional, private, and issue-owned

A Center may attach images when submitting an issue, but zero images is a valid report.

V1 supports images only, not video. Evidence is private operational evidence owned by the Pre-install Issue domain and must not reuse the Product asset data model.

### K-D6 — No formal additional-evidence request loop in V1

Admin reviews the submitted description and any images already attached, then records a terminal outcome.

There is no `evidence_requested`, `awaiting_center_response`, comments thread, assignment queue, or ticket-style response workflow. Exceptional requests for more information may occur outside the platform in V1.

### K-D7 — Issue handling never moves custody by itself

Submitting or resolving an issue does not change confirmed Roll custody, create a Transfer, complete Recovery, reverse Opening, or create Warranty state.

Physical return remains owned by Cube J opened-Roll Recovery and occurs only when the authorized recovering party actually receives the physical Roll.

## 3. Bounded scope

Cube K owns:

1. exact opened-Roll issue eligibility;
2. auditable issue submission by the current custodian Center;
3. immediate issue-specific Warranty Activation hold;
4. four controlled issue categories and required description;
5. optional private image evidence;
6. Company/Admin review and the approved terminal outcomes;
7. narrow `reported_in_error` administrative correction;
8. immutable issue event history;
9. Center/Admin read surfaces and mobile-first UX;
10. concurrency, idempotency, RLS, Storage, and regression contracts;
11. a clear handoff contract to future Warranty Activation;
12. the minimum Recovery integration needed to prevent contradictory state.

Cube K does **not** own:

- customer identity, phone, vehicle, or VIN;
- Warranty Activation or policy snapshot creation;
- public Warranty URL/token/QR;
- customer Claims;
- replacement or reinstall;
- reimbursement, credit, stock write-off, accounting, or supplier claims;
- generic ticketing/QMS/workflow functionality;
- ordinary Transfer redesign;
- Production label work;
- formal evidence-request messaging.

## 4. Lifecycle model

Each issue has one current status:

- `submitted` — unresolved; Activation hold is active;
- `cleared_for_use` — terminal quality outcome; this issue no longer blocks Activation;
- `return_required` — terminal quality outcome; Roll remains blocked from Activation;
- `reported_in_error` — terminal administrative correction; this issue no longer blocks Activation.

Terminal states are immutable.

### 4.1 Multiple historical issues

The platform preserves issue history rather than overwriting a single Roll field.

Rules:

- at most one `submitted` issue may exist for a Roll at a time;
- after `cleared_for_use` or `reported_in_error`, the current custodian Center may submit a later genuinely new issue if all normal pre-install eligibility rules still pass;
- once any issue reaches `return_required`, no later Pre-install Issue may be created for that Roll in V1;
- historical resolved issues remain readable to authorized actors and are never deleted by a later report.

## 5. Persistence contract

Use a dedicated bounded context. Do not add mutable issue columns to `rolls` or `roll_openings`.

### 5.1 `roll_preinstall_issues`

Required logical shape:

```text
roll_preinstall_issues
- id                         UUID PRIMARY KEY
- request_id                 UUID NOT NULL UNIQUE
- roll_id                    UUID NOT NULL -> rolls.id
- reported_by_profile_id     UUID NOT NULL -> profiles.id
- reporting_center_party_id  UUID NOT NULL -> operational_parties.id
- category                   TEXT NOT NULL
- description                TEXT NOT NULL
- status                     TEXT NOT NULL DEFAULT 'submitted'
- resolved_by_profile_id     UUID NULL -> profiles.id
- resolution_reason          TEXT NULL
- resolved_at                TIMESTAMPTZ NULL
- created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints:

- category is one of the four K-D4 values;
- status is one of the four lifecycle values in section 4;
- description is trimmed, non-empty, and bounded; implementation target is 10–2000 characters;
- terminal transitions require an Admin actor and an auditable reason; `reported_in_error` always requires a reason;
- a partial unique index or equivalent atomic rule enforces at most one `submitted` issue per Roll;
- useful indexes cover `roll_id`, `reporting_center_party_id`, and Admin queue ordering by `status/created_at`.

Issue identity fields, reporter, Center, Roll, category, description, and creation time become immutable after successful submission. Current `status` and resolution fields may change only through the named controlled transition mutation.

### 5.2 `roll_preinstall_issue_events`

Append-only history records at minimum:

- `submitted`;
- `cleared_for_use`;
- `return_required`;
- `reported_in_error`.

Logical shape:

```text
roll_preinstall_issue_events
- id               UUID PRIMARY KEY
- issue_id          UUID NOT NULL -> roll_preinstall_issues.id
- event_kind        TEXT NOT NULL
- actor_profile_id  UUID NOT NULL -> profiles.id
- reason            TEXT NULL
- created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

Rows are immutable. Direct client update/delete is denied. Terminal decisions must append the matching event in the same database transaction that updates the issue projection.

### 5.3 `roll_preinstall_issue_evidence`

Evidence metadata is separate from Storage objects:

```text
roll_preinstall_issue_evidence
- id                    UUID PRIMARY KEY
- issue_id              UUID NOT NULL -> roll_preinstall_issues.id
- storage_path          TEXT NOT NULL UNIQUE
- mime_type             TEXT NOT NULL
- size_bytes            BIGINT NOT NULL
- uploaded_by_profile_id UUID NOT NULL -> profiles.id
- created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

Evidence metadata is immutable after successful issue submission. The application does not expose evidence deletion/editing as normal V1 behavior.

## 6. Private Storage contract

Use a dedicated private bucket, logically `roll-preinstall-issue-evidence`.

Requirements:

- no public bucket access;
- no direct anonymous URL;
- browser/client cannot upload arbitrary objects directly through a permissive Storage policy;
- upload orchestration is server-controlled and follows the already proven Product-asset validation/compensation pattern without reusing the Product asset table/domain;
- authorized viewing uses short-lived signed/private access after application/database authorization;
- Center access is limited to evidence for issues it is authorized to read; Admin may read all issue evidence;
- Agent/Dealer have no evidence access in V1.

V1 upload bounds must remain explicit and small. Initial technical target:

- maximum 5 images per issue;
- maximum 8 MiB per image;
- explicitly allowed browser-safe image MIME types, initially JPEG, PNG, and WebP;
- server validates MIME/size rather than trusting the filename extension.

If Storage upload succeeds but issue creation fails, uploaded objects must be removed through compensation. A successful issue must not reference a missing object because of a partial application failure.

## 7. Center submission eligibility

The issue-creation mutation fails closed unless all are true at commit time:

1. caller is authenticated;
2. Profile is active;
3. role is `center`;
4. bound Installation Center is active;
5. caller's current Operational Party is that Center;
6. exact Roll exists;
7. parent Production Order remains generated/non-voided;
8. a valid immutable Cube J `roll_openings` row exists;
9. `roll_custody_current.custodian_party_id` equals the caller's Center party;
10. no active `submitted` Pre-install Issue exists for the Roll;
11. no prior issue for the Roll is `return_required`;
12. no Warranty Activation exists once the future Warranty schema is introduced.

Protection Giants network approval is **not** an issue-submission gate.

Possessing a Roll QR/photo is **not** authorization.

## 8. Candidate resolver

Provide a narrow exact resolver, logically:

```text
resolve_roll_preinstall_issue_candidate(p_roll_serial TEXT)
```

It returns only the information required for the Center to verify the correct Roll and understand eligibility:

- Product name / SKU;
- Roll serial;
- Lot where useful;
- Opening time;
- current Center identity;
- whether an active issue already exists;
- deterministic ineligibility reason when the caller cannot submit.

QR parsing remains application-level reuse of the existing contextual Roll QR parser. The database resolver consumes the canonical exact Roll serial.

No fuzzy Roll search or global Roll directory is introduced.

## 9. Issue submission mutation

Provide a named mutation, logically:

```text
create_roll_preinstall_issue(...)
```

The application/service contract must:

1. validate category, description, and bounded images;
2. generate a stable `request_id` for idempotent retry;
3. stage/upload validated private evidence through the server-only Storage path;
4. resolve and lock actor/Center state;
5. lock the exact Roll and current custody in a deterministic order shared with conflicting lifecycle mutations;
6. revalidate every rule in section 7 inside the transaction;
7. insert one issue in `submitted` status;
8. append immutable `submitted` event;
9. create evidence metadata atomically with the successful issue record or fail/compensate cleanly;
10. return a minimal safe issue result;
11. immediately expose the Activation-hold state in read projections.

### 9.1 Idempotency

Retrying the same request ID with the same actor/Roll/payload returns the same successful issue.

Reusing the request ID for a different Roll, category, description, evidence set, or incompatible actor fails with a deterministic request-conflict error.

A different request while another issue is already `submitted` fails with an explicit active-issue error.

## 10. Company/Admin resolution

### 10.1 Quality decision mutation

Use a named Admin-only mutation, logically:

```text
resolve_roll_preinstall_issue(
  p_request_id UUID,
  p_issue_id UUID,
  p_outcome TEXT,
  p_reason TEXT
)
```

Allowed quality outcomes are only:

- `cleared_for_use`;
- `return_required`.

The mutation must:

- lock the issue row;
- require active Admin/Company actor;
- require current status `submitted`;
- require a bounded non-empty reason/note suitable for audit;
- update status/resolution projection exactly once;
- append the matching immutable event in the same transaction;
- be idempotent for exact safe retries;
- reject conflicting second decisions.

### 10.2 Administrative correction mutation

Keep accidental-report correction semantically separate from quality review:

```text
mark_roll_preinstall_issue_reported_in_error(
  p_request_id UUID,
  p_issue_id UUID,
  p_reason TEXT
)
```

Only active Admin may execute it. The issue must still be `submitted`. Reason is mandatory. The original issue, description, category, evidence, reporter, and event history remain preserved.

The Center cannot delete, retract, or mark its own report as erroneous.

## 11. Warranty Activation handoff contract

Cube K does not implement Warranty Activation, but it freezes the eligibility input the future cube must consume atomically.

Activation is blocked when:

- any issue is currently `submitted`; or
- any historical issue for the Roll has terminal status `return_required`.

Issue-specific blocking is absent when all historical issues are only `cleared_for_use` and/or `reported_in_error`.

The future Activation mutation must lock the same physical Roll before checking issue state so `Issue submission vs Activation` cannot both succeed from the same pre-state.

Expected race rule:

- if issue submission commits first, Activation fails because the hold exists;
- if Activation commits first, later Pre-install Issue creation fails because the Roll is already activated.

No UI-only eligibility check is sufficient.

## 12. Interaction with Cube J opened-Roll Recovery

Issue handling and custody remain separate domains, but they must not allow a contradictory dead-end.

### 12.1 No automatic Recovery

`return_required` does not create or complete Recovery. Admin/enabled Agent must use the existing Cube J Recovery action when the physical Roll is actually received.

Recovery does not delete or rewrite the issue.

### 12.2 Pending issue blocks Recovery until Company resolution

While an issue is `submitted`, opened-Roll Recovery must be rejected.

Reason: moving the opened Roll away before Company resolves the issue could leave a later `cleared_for_use` decision with no supported path to return the opened Roll into normal Center circulation. Requiring resolution first keeps the approved lifecycle bounded and prevents physical custody from outrunning the quality decision.

Therefore Cube K must add one database-side Recovery eligibility check:

- active `submitted` issue -> Recovery blocked;
- `return_required` -> Recovery may proceed under all existing Cube J authorization/receipt rules;
- `cleared_for_use` or `reported_in_error` -> the issue itself does not block Recovery, but all normal Cube J Recovery rules still apply.

This does not grant Admin any new custody authority and does not change Agent network scope.

### 12.3 Submission vs Recovery race

Both mutations must serialize on the same Roll/current-custody lock order.

Exactly one may win from a state where the Center still holds the Roll and no issue exists:

- if issue submission wins, Recovery sees the pending issue and fails;
- if Recovery wins, custody leaves the Center and issue submission fails current-custodian eligibility.

## 13. Read and privacy model

### Center

An active Center may:

- resolve an exact eligible Roll for issue submission;
- create an issue only for a Roll it currently holds and that satisfies section 7;
- read issues it reported, including their terminal Company decision and evidence;
- continue reading its historical report after custody later moves, subject to active-account authorization.

A Center cannot:

- resolve/transition status;
- edit/delete submitted description/category/evidence;
- read another Center's issues;
- browse global issue inventory.

### Admin / Company

Active Admin may:

- read all issues/evidence;
- view the submitted queue;
- resolve issues to one of the two quality outcomes;
- perform the narrow `reported_in_error` correction.

### Agent / Dealer

No Pre-install Issue read/review authority is added in V1. Agent Recovery capability remains separate and consumes only the Recovery eligibility result it needs.

### RLS and direct mutation

RLS must be enabled on issue, event, and evidence-metadata tables. Direct client insert/update/delete is denied; business writes occur only through controlled functions/service actions with database authorization.

## 14. UX contract — Center

Phone-first operation is mandatory.

### 14.1 Entry

Provide a clear **الإبلاغ عن مشكلة في رول** action from the opened-Roll/Center operations context.

Identification:

- primary: scan existing contextual Roll QR;
- fallback: exact canonical Roll serial entry/paste.

### 14.2 Pre-submission confirmation

After exact resolution show:

- Product / SKU;
- Roll serial;
- Lot where useful;
- current Center name;
- Opening time;
- clear statement that submitting the report **temporarily stops Warranty Activation immediately** until Company resolution.

### 14.3 Report form

Require:

- one of the four categories;
- description.

Allow:

- 0–5 optional images within the private evidence limits.

The UI should show upload validation errors before final submission where possible.

### 14.4 Success

Show:

- report submitted successfully;
- Roll/Product reference;
- status `قيد مراجعة الشركة`;
- explicit statement that Warranty Activation is currently paused;
- no Undo/delete action.

### 14.5 Center issue history

Provide a lightweight Center view of its own reports with status and Company resolution. This is not a ticket inbox and has no comments/assignment/SLA controls.

## 15. UX contract — Admin / Company

Provide a focused review queue and detail surface.

Queue prioritizes `submitted` issues and shows enough operational context to identify the report without exposing irrelevant data.

Detail shows:

- Product / SKU;
- Roll serial / Lot;
- reporting Center;
- Opening time;
- category;
- description;
- private images;
- immutable event timeline.

Admin actions:

- **السماح بالاستخدام** -> `cleared_for_use`;
- **إلزام بإرجاع الرول** -> `return_required`;
- secondary correction **تم الإبلاغ بالخطأ** -> `reported_in_error`.

Every terminal action requires explicit confirmation and an audit reason. The UI must state the resulting Activation behavior before confirmation.

## 16. Deterministic business errors

Implementation should expose domain-specific errors rather than leaking Transfer/SQL internals. Expected set includes equivalents of:

- `PG_ROLL_ISSUE_ACTOR_INACTIVE`;
- `PG_ROLL_ISSUE_CENTER_INACTIVE`;
- `PG_ROLL_ISSUE_FORBIDDEN`;
- `PG_ROLL_ISSUE_ROLL_NOT_FOUND`;
- `PG_ROLL_ISSUE_ROLL_NOT_OPENED`;
- `PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN`;
- `PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS`;
- `PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY`;
- `PG_ROLL_ISSUE_ALREADY_ACTIVATED` once that domain exists;
- `PG_ROLL_ISSUE_INVALID_CATEGORY`;
- `PG_ROLL_ISSUE_INVALID_DESCRIPTION`;
- `PG_ROLL_ISSUE_INVALID_EVIDENCE`;
- `PG_ROLL_ISSUE_REQUEST_CONFLICT`;
- `PG_ROLL_ISSUE_ALREADY_RESOLVED`;
- `PG_ROLL_RECOVERY_ISSUE_PENDING` for the Cube J Recovery integration.

Application UX maps these to concise Arabic messages.

## 17. Concurrency and permanent database tests

Permanent tests must cover at minimum:

1. valid Center issue creation after Opening;
2. no network-approval requirement;
3. wrong Center/current-custody rejection;
4. unopened Roll rejection;
5. voided/ineligible Production state rejection;
6. one active `submitted` issue maximum;
7. historical new issue allowed after `cleared_for_use` / `reported_in_error` when otherwise eligible;
8. no new issue after `return_required`;
9. exact idempotent submission retry;
10. request-ID conflict;
11. concurrent duplicate submission -> one winner;
12. submission vs Recovery -> one valid winner under section 12.3;
13. pending issue blocks Recovery;
14. Recovery allowed after `return_required` subject to Cube J rules;
15. Admin-only quality resolution;
16. Agent/Dealer/Center resolution denied;
17. terminal decision immutability;
18. `reported_in_error` Admin-only + mandatory reason;
19. immutable issue identity/description/category/event history;
20. RLS privacy between Centers;
21. evidence metadata privacy/immutability;
22. Storage bucket remains private and bounded;
23. Product-asset data is not reused for issue evidence;
24. future Activation integration contract test placeholder/extension when Warranty schema lands;
25. all prior Cube J Opening/Transfer/Recovery contracts continue passing.

## 18. Application/contract quality gates

Before Cube K implementation may merge:

- migrations rebuild successfully from a fresh local Supabase state;
- DB lint passes;
- public function grants are explicitly verified;
- generated database types are synchronized;
- TypeScript passes;
- production build passes;
- permanent structural tests cover QR candidate flow, private evidence handling, and no unsafe RPC typing bypass;
- mobile UX is reviewed for Center submission and Admin resolution;
- two independent review passes are completed: domain/security/concurrency, then UX/integration/regression.

No production Supabase deployment is required merely to merge development code; environment deployment remains a later launch concern.

## 19. Notifications and messaging boundary

The repository currently has no approved generic notification foundation for this platform. Cube K therefore does not introduce a new notification subsystem merely for issue reporting.

Operational completeness is provided by the Admin submitted-issue queue and Center issue-status surface. A future notification capability may consume issue events without changing Cube K state semantics.

## 20. Future handoff

After Cube K is implemented and closed, the next critical lifecycle cube is **Warranty Activation**.

That future cube must consume, not reinvent:

- immutable Cube J Opening;
- confirmed current Center custody;
- Cube K Activation-hold rules;
- one-PPF-Roll/one-customer-warranty product decision;
- Product warranty policy snapshot requirements.

Customer identity, VIN, public Warranty access, Claims, replacement, and reinstall remain outside Cube K.
