# Cube Q — Claim Review, Inspection & Decision

**Status:** DRAFT FOR FINAL PRODUCT / ENGINEERING REVIEW — product decisions are APPROVED/FROZEN  
**Version:** 1.0  
**Planning baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Implementation base:** must be the merged Cube P HEAD, not the planning baseline above  
**Depends on:** Cube P Customer Warranty Claim Intake, Cube M Warranty Activation/Admin support, Cube L Notifications/PWA, Center identity/access foundation  
**Consumes but does not redefine:** `docs/claims-product-decisions-amendment.md`, `docs/claims-pqr-master-architecture.md`  
**Primary responsibility:** let Protection Giants Company review a submitted Claim, optionally obtain one formal Center inspection, and make one authoritative audited final decision without implementing physical remedy fulfillment.

---

# 1. Purpose

Cube Q answers exactly one business question:

> **Is this Warranty Claim accepted by Protection Giants?**

It gives Company/Admin enough authoritative Warranty context and evidence to decide responsibly, while allowing one bounded physical inspection when images alone are insufficient.

Cube Q must end every adjudicated Claim in one of:

- `approved`;
- `rejected`;
- `cancelled`.

An approved Claim remains **open end-to-end** (`closed_at is null`) because fulfillment is still pending. Approval creates the durable handoff to Cube R but does not execute it.

---

# 2. Inherited rules Q must preserve

1. Claim belongs to exactly one Warranty fixed at P submission.
2. Claim Number remains permanent and is not an authorization secret.
3. Customer submission facts/evidence are immutable.
4. The Warranty policy snapshot active at original Warranty issuance is the coverage context; current Product edits do not rewrite it.
5. Natural Warranty expiry after valid Claim submission does not invalidate the Claim.
6. Company/Admin alone decides in V1.
7. Center is technical evidence provider only.
8. One formal V1 inspection per Claim; reassignment changes the assigned Center, not the number of inspection loops.
9. Rejected/cancelled Claim closes immediately; approved Claim stays open until R completion.
10. No accounting/financial decision is represented by Claim approval.

---

# 3. Cube Q scope

## In scope

- Admin Claims queue under authenticated `/operations` shell;
- Admin Claim detail/read model;
- start-review transition;
- `submitted → under_review`;
- optional formal inspection request;
- `under_review → awaiting_inspection`;
- inspection assignment to an active Center;
- bounded reassignment of a pending inspection;
- Center inspection task/detail UI;
- Center private inspection image evidence + technical note;
- inspection submission;
- `awaiting_inspection → under_review`;
- Company final `approved | rejected | cancelled` decision;
- final decision reason/customer message;
- one-to-one minimal Resolution/Entitlement row on approval;
- end-to-end Claim `closed_at` handling for rejection/cancellation;
- Cube M `voided_in_error` guard while a Claim remains open;
- timeline/events and Q notification materialization;
- customer verified projection extension for inspection/decision status.

## Explicitly out of scope

- choosing final remedy kind;
- assigning the performing Center for remedy;
- replacement Roll selection/reservation;
- Transfer creation/receipt;
- Roll consumption;
- reinstall/service completion;
- monetary responsibility or settlement;
- customer chat/comments;
- repeated evidence request loops;
- multiple formal inspections;
- automatic claim scoring/AI decisions;
- Agent/Dealer decision authority.

---

# 4. Admin Claims work queue

Recommended route family:

`/operations/claims`

and a protected detail route keyed by internal stable route identity or Claim Number only after authenticated authorization, for example:

`/operations/claims/[claimNumber]`

The Claim Number in an authenticated route remains a locator, never the authorization check.

## 4.1 Queue contents

Company/Admin queue should support operational scanning by:

- Claim Number;
- current adjudication status;
- submitted time;
- Product name snapshot;
- vehicle make/model;
- activating Center name snapshot;
- whether inspection is pending/submitted;
- elapsed time as display information only.

V1 filters need only:

- open/closed;
- status;
- recent ordering.

Do not add arbitrary search builder, owner assignment, priority, SLA or analytics dashboard.

## 4.2 Mobile-first

Use cards/compact rows compatible with the existing mobile operations contract. No required wide table.

---

# 5. Admin Claim detail read model

The bounded Company detail may compose:

## Claim

- Claim Number;
- category;
- affected area;
- customer description;
- submitted time;
- customer submission images;
- current Claim status;
- timeline.

## Warranty

- Warranty Number;
- `record_state`;
- activation/start time;
- original coverage end time;
- Product code/name/version snapshot;
- full warranty coverage snapshot;
- full care instructions snapshot;
- activating Center identity/name snapshot;
- customer name/phone/email where present;
- vehicle make/model/year/plate/color/VIN;
- audited customer/vehicle corrections already applied by Cube M.

## History

- earlier **closed** Claims for the same Warranty;
- their final customer-level outcome;
- later R service history when R exists.

Do not allow Claim review to query current mutable Product policy as a substitute for the Warranty snapshot.

---

# 6. Claim lifecycle transitions

## 6.1 Start review

Named mutation, logically:

`start_warranty_claim_review(claim_id, request_id)`

Allowed only:

`submitted → under_review`

Requirements:

- authenticated active Admin profile;
- Claim exists and `closed_at is null`;
- current status is exactly `submitted`;
- Warranty still exists and is not contradictory;
- natural expiry does **not** block review.

Writes matching immutable event in same transaction.

Idempotent retry of the same request returns the same resulting state.

## 6.2 Request inspection

Named mutation, logically:

`request_warranty_claim_inspection(...)`

Allowed only:

`under_review → awaiting_inspection`

Creates the single formal inspection record and matching event atomically.

## 6.3 Inspection submission

Authoritative submission transitions:

`awaiting_inspection → under_review`

in the same business boundary that marks the inspection `submitted` and commits inspection evidence metadata/event.

## 6.4 Final decision

Allowed only from `under_review`.

Outcomes:

- `approved`;
- `rejected`;
- `cancelled`.

No decision directly from `submitted` or `awaiting_inspection`; Company must make the review state explicit first / finish the requested inspection.

This keeps the timeline deterministic without adding many states.

---

# 7. Inspection persistence contract

## 7.1 `warranty_claim_inspections`

Logical shape:

```text
warranty_claim_inspections
- id                           UUID PRIMARY KEY
- claim_id                     UUID NOT NULL UNIQUE -> warranty_claims.id
- status                       TEXT NOT NULL DEFAULT 'requested'
- assigned_center_party_id     UUID NOT NULL -> operational_parties.id
- requested_by_profile_id      UUID NOT NULL -> profiles.id
- requested_at                 TIMESTAMPTZ NOT NULL
- submitted_by_profile_id      UUID NULL -> profiles.id
- technical_observation        TEXT NULL
- suspected_cause              TEXT NULL
- submitted_at                 TIMESTAMPTZ NULL
- created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
```

Allowed status:

```text
requested
submitted
```

Rules:

- exactly zero or one formal inspection per Claim in V1;
- `technical_observation` required on submission, trimmed and bounded; target 10–3000 characters;
- `suspected_cause` optional free technical note, bounded; it is **not** a root-cause taxonomy and does not auto-decide the Claim;
- requested actor/time immutable;
- current assigned Center may change only through Admin reassignment mutation while status is `requested`;
- submitted actor/time/evidence immutable after submission.

## 7.2 Inspection evidence

Use a separate metadata table in the same Claims bounded context:

```text
warranty_claim_inspection_evidence
- id                     UUID PRIMARY KEY
- inspection_id          UUID NOT NULL -> warranty_claim_inspections.id
- storage_path           TEXT NOT NULL UNIQUE
- mime_type              TEXT NOT NULL
- size_bytes             BIGINT NOT NULL
- uploaded_by_profile_id UUID NOT NULL -> profiles.id
- created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
```

Use the same private `warranty-claim-evidence` bucket and same proven bounds:

- minimum 1 inspection image;
- maximum 5;
- maximum 8 MiB/image;
- JPEG/PNG/WebP;
- no video.

Server-controlled upload/compensation rules from P remain applicable.

---

# 8. Inspection Center selection and reassignment

## 8.1 Default

UI should propose the Warranty's activating/installing Center when it remains operationally active.

It is a proposal, not a hidden automatic assignment.

Admin confirms the Center when requesting inspection.

## 8.2 Alternate Center

Admin may choose another operationally active Center. Protection Giants network approval badge is not an inspection authority requirement; operationally active Center identity is sufficient in V1.

Do not expose a global private Center directory to ordinary users. Admin may use existing Company-authorized Center selection/read capabilities.

## 8.3 Reassignment

Pending inspection can be reassigned by active Admin when:

- current inspection status is `requested`;
- Claim remains `awaiting_inspection` and open;
- new Center is operationally active;
- new Center differs from current;
- mandatory reassignment reason is 5–500 characters.

Mutation changes current `assigned_center_party_id` and appends an immutable `inspection_reassigned` Claim event containing old/new Center identifiers in a private audit snapshot.

Old Center loses inspection access immediately after commit. New Center receives the task notification.

No reassignment after the inspection is submitted.

---

# 9. Center inspection access

Center user may read/submit only when all are true at request/commit time:

1. authenticated;
2. Profile active;
3. role = `center`;
4. bound Center operationally active;
5. current Operational Party equals `assigned_center_party_id`;
6. inspection status is `requested`;
7. Claim is `awaiting_inspection` and `closed_at is null`.

Center read projection should contain only what is necessary for inspection:

- Claim Number;
- Product name/version snapshot;
- vehicle make/model/year and only the additional vehicle identity needed to inspect the correct car;
- affected area;
- customer description;
- customer submission images;
- Warranty coverage/care information necessary for technical context;
- inspection instructions.

Do not expose:

- other Claims/customer history;
- internal Admin decision notes;
- private reassignment reasons;
- Company audit identities;
- replacement/Roll inventory information;
- decision controls.

Whether customer phone is exposed to the assigned Center should follow the existing operational need: prefer not to expose it if the customer/visit coordination can happen through the Company or already-known installer relationship. Q must not broaden PII merely for convenience.

---

# 10. Inspection submission

Named mutation/service, logically:

`submit_warranty_claim_inspection(...)`

Requirements:

- exact current assigned Center actor passes section 9;
- at least one valid private inspection image is staged;
- technical observation valid;
- Claim is still `awaiting_inspection`;
- inspection still `requested`;
- no reassignment raced and committed first.

Atomic database effects:

- inspection → `submitted`;
- technical observation/suspected cause/submitted actor/time persisted;
- evidence metadata committed;
- Claim → `under_review`;
- `inspection_submitted` Claim event appended;
- Admin notification materialization committed.

Storage compensation follows P pattern.

---

# 11. Decision persistence additions

Q extends `warranty_claims` with bounded decision projection fields:

```text
- decided_by_profile_id      UUID NULL -> profiles.id
- decision_reason            TEXT NULL
- customer_decision_message  TEXT NULL
- decided_at                 TIMESTAMPTZ NULL
```

Decision shape constraint:

- non-terminal (`submitted`, `under_review`, `awaiting_inspection`) → all decision fields null;
- `approved | rejected | cancelled` → all decision actor/time fields present and both reason/message present;
- `decision_reason`: internal/audit explanation, 5–1000 chars;
- `customer_decision_message`: bounded customer-safe explanation, 5–1000 chars;
- decision fields immutable after terminal adjudication.

Do not store price, cost, reimbursement or payer fields.

---

# 12. Final decision mutations

Use explicit mutation boundaries rather than one generic arbitrary state setter.

Recommended logical operations:

- `approve_warranty_claim(...)`;
- `reject_warranty_claim(...)`;
- `cancel_warranty_claim(...)`.

Each requires active Admin and a unique action request id.

## 12.1 Approval

Preconditions:

- Claim `status='under_review'`;
- `closed_at is null`;
- no unsubmitted requested inspection exists;
- Claim/Warranty relationship intact;
- no competing terminal decision committed.

Atomic effects:

1. Claim → `approved`;
2. decision fields set;
3. `approved` event appended;
4. `closed_at` remains null;
5. exactly one Resolution/Entitlement header created in `authorized` state;
6. notification materialization inputs written.

Natural Warranty expiry after Claim submission is **not** an approval blocker.

Approval does not change Warranty timestamps/state.

## 12.2 Rejection

Atomic effects:

1. Claim → `rejected`;
2. decision fields set;
3. `rejected` event appended;
4. `closed_at` set to authoritative decision time;
5. no Resolution row created.

## 12.3 Cancellation

Admin-only bounded path for confirmed duplicate, submitted-in-error or customer withdrawal communicated outside the platform.

Atomic effects mirror rejection with status/event `cancelled` and `closed_at` set.

Cancellation is not available after approval because the case has entered the independent Resolution lifecycle. Any future approved-resolution recovery belongs to R and must not rewrite Q adjudication.

---

# 13. Minimal Q→R Resolution handoff

Q creates a deliberately small table/interface so approval cannot become an untracked dead end.

## `warranty_claim_resolutions`

Q-owned foundation shape:

```text
warranty_claim_resolutions
- id                    UUID PRIMARY KEY
- claim_id              UUID NOT NULL UNIQUE -> warranty_claims.id
- status                TEXT NOT NULL DEFAULT 'authorized'
- authorized_by_profile_id UUID NOT NULL -> profiles.id
- authorized_at         TIMESTAMPTZ NOT NULL
- created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

At Q completion:

- only `authorized` may be created by Q;
- no performing Center;
- no remedy kind;
- no Roll;
- no money;
- no completion fields.

R may extend this table through later migrations under the frozen Master Architecture.

Direct update/delete remains denied.

---

# 14. Warranty `voided_in_error` compatibility guard

Q must extend Cube M's authoritative Admin void path so that it fails closed if:

```text
exists warranty_claims
where warranty_id = target_warranty_id
  and closed_at is null
```

Required behavior:

- no automatic Claim cancellation;
- no automatic Resolution cancellation;
- no hidden rollback of inspection;
- user receives a clear operational error explaining that the open Claim must be explicitly resolved/closed first.

Concurrency requirement:

Warranty void and Claim creation/decision must use compatible locking/order so a race cannot commit both:

- Warranty `voided_in_error`; and
- an open Claim for that Warranty.

The exact lock helper should reuse the established Cube M physical/Warranty discipline rather than introduce an unrelated mutex system.

---

# 15. Claim event catalog added by Q

Append-only Claim events include:

- `review_started`;
- `inspection_requested`;
- `inspection_reassigned`;
- `inspection_submitted`;
- `approved`;
- `rejected`;
- `cancelled`.

Every state transition and reassignment writes its matching event in the same DB transaction.

Events never become editable comments.

---

# 16. Notifications

Reuse Cube L.

## Inspection requested

Recipient: active profiles bound to assigned Center.  
Intent: action required.  
Deep link: protected Center inspection task.

## Inspection reassigned

- new Center: action-required Inbox/Push;
- old Center: its task disappears; an informational notification is optional only if operational review proves useful. Avoid noise by default.

## Inspection submitted

Recipient: active Admin profiles.  
Intent: action required.

## Final decision

Internal Inbox event may be created for relevant Admin audit/visibility; do not Push the deciding Admin about their own synchronous success unnecessarily.

Anonymous customer sees decision through the phone-verified Claim page. Q does not add SMS/email/WhatsApp.

---

# 17. Customer verified projection extension

P's verified status read extends to show:

## Under review

- Claim Number;
- status: `قيد المراجعة`.

## Awaiting inspection

- status: `مطلوب فحص بالمركز`;
- assigned Center public/customer-safe identity;
- existing public Center contact/navigation fields only when already approved and useful to reach the Center;
- no internal assignment/reassignment reason.

## Approved

- customer-safe decision message;
- status: `تم قبول المطالبة وجارٍ ترتيب المعالجة`.

Do not claim the remedy is complete.

## Rejected

- customer-safe decision message;
- status `تم رفض المطالبة`.

## Cancelled

- customer-safe message;
- status `تم إلغاء المطالبة`.

No internal decision reason or actor is public.

---

# 18. RLS / authorization

## Admin

Active Protection Giants Admin may:

- list/read all Claims;
- start review;
- request/reassign inspection;
- read all Claim/inspection evidence;
- decide Claims.

## Center

Active Center may:

- see only currently assigned pending inspection tasks;
- read the narrow inspection projection;
- upload/submit evidence for that inspection.

Center cannot:

- browse Company Claim queue;
- read other Centers' Claims;
- approve/reject/cancel;
- alter customer submission;
- create Resolution;
- see replacement inventory.

## Agent / Dealer

No Q Claim access/authority in V1.

## Anonymous

No direct Q table/storage access. Customer remains behind P's verified server projection.

---

# 19. Concurrency / hard cases

Q must test:

1. two Admins start review simultaneously;
2. decision races inspection request;
3. inspection submission races Admin reassignment;
4. two Admins decide same Claim differently;
5. approve request retried after network ambiguity → one Resolution row only;
6. reject/cancel race → one terminal outcome;
7. Warranty void races open Claim/decision → no contradictory commit;
8. Warranty expires while Claim under review → review/decision still valid;
9. original Center suspended while inspection pending → Admin can reassign; old Center loses access;
10. new Center suspended before inspection submit → submit rejected recoverably, Admin may reassign;
11. direct database/API attempt to create `approved` without decision mutation denied;
12. approved Claim remains `closed_at null` and therefore blocks second Claim until R completion.

---

# 20. Required tests

## Database/state

- allowed Claim transitions only;
- terminal decision immutability;
- decision shape constraints;
- one inspection per Claim;
- inspection status constraints;
- reassignment only while requested;
- one Resolution per approved Claim;
- rejected/cancelled set `closed_at`;
- approved leaves `closed_at null`;
- no Resolution for rejected/cancelled;
- Warranty void guard.

## Authorization

- Agent/Dealer cannot list/read/decide;
- Center only assigned inspection;
- old Center denied after reassignment;
- suspended Center denied submission;
- Admin-only decision;
- evidence signed/private access follows authorization.

## UX

- Admin queue mobile scanability;
- review detail includes correct Warranty policy snapshot;
- direct decision path;
- inspection request/reassignment path;
- Center task mobile flow with camera/gallery upload;
- inspection submission returns Claim to review;
- final decision customer message visible only after phone verification.

## Regression

- P submission/open-case invariant remains PASS;
- Cube M Warranty support remains PASS except intentional open-Claim void guard;
- Cube N public Warranty projection remains minimal;
- Cube L Inbox/Push semantics preserved;
- Center approval badge is not silently made a Claim-inspection requirement.

---

# 21. Cube Q Definition of Done

Cube Q is GO only when:

1. exact implementation base is merged Cube P `main` and P regressions PASS;
2. Admin can list/read/start review of submitted Claims;
3. Company can decide directly when evidence is sufficient;
4. Company can request one formal Center inspection when needed;
5. pending inspection can be reassigned without dead end;
6. assigned active Center can submit private technical evidence but has no decision authority;
7. final `approved | rejected | cancelled` decisions are authoritative, audited and immutable;
8. rejection/cancellation close the end-to-end Claim;
9. approval leaves Claim open and atomically creates exactly one `authorized` Resolution header;
10. no remedy/Transfer/Roll/financial work leaks into Q;
11. Cube M `voided_in_error` is blocked by any open Claim;
12. customer verified status reflects review/inspection/decision safely;
13. Q notification events use Cube L and do not create notification noise;
14. Database Quality + PR Quality + Cube P Quality + dedicated **Cube Q Claim Decision Quality** PASS on exact final SHA;
15. hosted Admin + Center mobile acceptance passes direct-decision and inspection paths;
16. independent engineering/security/operational review PASS.

Cube Q GO remains an intermediate macro milestone. Production Claims service is not end-to-end complete until Cube R fulfills approved Claims.
