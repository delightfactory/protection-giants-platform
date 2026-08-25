# Cube P — Customer Warranty Claim Intake

**Status:** DRAFT FOR FINAL PRODUCT / ENGINEERING REVIEW — product decisions are APPROVED/FROZEN  
**Version:** 1.0  
**Planning baseline:** `main` at `53125d64091f64366cd111ef4b4b7eb9e53a49b4`  
**Must be rebased/revalidated before implementation:** yes  
**Depends on:** Cube M Warranty Activation, Cube N Public Warranty Access / `/w/[publicCode]`, Cube L Notifications/PWA, existing private Storage orchestration patterns  
**Consumes but does not redefine:** `docs/claims-product-decisions-amendment.md`, `docs/claims-pqr-master-architecture.md`  
**Primary responsibility:** create one secure, evidence-backed customer Warranty Claim from the existing permanent Warranty URL and expose a narrow verified customer status without implementing adjudication or fulfillment.

---

# 1. Purpose

Cube P creates the customer entry door for post-install Warranty service.

A customer who possesses the existing Warranty QR opens the same permanent Roll-owned Warranty identity, verifies the phone already registered on the effective Warranty, submits a bounded problem report with required private image evidence, and receives a stable Claim Number.

Cube P must end with one durable fact:

> **Protection Giants received one valid Claim for this exact effective Warranty while coverage was active.**

It must not decide whether the Claim is covered and must not promise or execute replacement.

---

# 2. Inherited rules that P must preserve

1. Customer does not need a platform account.
2. Public Warranty identity remains the existing Roll-owned `/w/<PUBLIC-CODE>`.
3. Public Code is not changed, copied into a new Claim credential or exposed through broad Data API reads.
4. Warranty Number and Claim Number are references, not secrets.
5. Effective Warranty Product/Center/policy snapshots remain authoritative historical facts.
6. Claims do not change Warranty coverage timestamps or `record_state`.
7. New Claim eligibility is determined at authoritative submit time, not form-render time.
8. Legacy defect examples are functional reference only; they do not override current Warranty policy snapshots or current Center rules.

---

# 3. Cube P scope

## In scope

- Claim persistence foundation;
- Claim Number generator;
- one-open-Claim-per-Warranty invariant;
- frozen V1 issue taxonomy;
- exact effective-Warranty binding from Public Code;
- registered-phone match verification;
- private required image evidence;
- customer Claim form;
- authoritative Claim submit mutation;
- initial `submitted` event/timeline fact;
- narrow verified customer Claim projection;
- active-Warranty Claims affordance on the public Warranty experience;
- durable Admin Inbox notification for new Claim;
- P-specific database/storage/security/UX tests.

## Explicitly out of scope

- Admin review queue/detail beyond a notification/deep-link placeholder owned by future Q;
- `under_review` transitions;
- physical inspection;
- approve/reject/cancel decision UI;
- Resolution/Entitlement;
- performing Center assignment;
- replacement Roll selection/transfer/allocation;
- reinstall completion;
- accounting/financial fields;
- customer OTP/account;
- public Claim Number search;
- chat/comments;
- SLA/priority/escalation system;
- video evidence.

P must not add fake disabled controls for Q/R features.

---

# 4. Public route and UX contract

## 4.1 Existing Warranty route remains authoritative

Keep:

`/w/[publicCode]`

Cube P adds a Claims affordance only to effective Warranty customer states where that action has meaning.

Recommended nested route:

`/w/[publicCode]/claim`

No Claim Number appears in the public route.

## 4.2 Active Warranty

For `active` Warranty state, the page may show a concise action such as:

**طلب خدمة الضمان**

Entering the Claim surface first asks for the registered phone number.

After successful verification:

- if no open Claim exists → show submission form;
- if one open Claim exists → show its narrow status instead of another form.

## 4.3 Expired Warranty

No new Claim form is offered.

A customer may still enter the Claims surface to follow an already-open Claim submitted before expiry. Phone verification remains required.

If no such Claim exists, use a neutral customer message; do not create a manual expired-Warranty claim exception.

## 4.4 Other Cube N public states

`not_activated`, `no_current_warranty_after_void`, `unavailable_for_warranty`, invalid link or internal inconsistency do not allow new Claim submission.

Do not expose historical/internal Claim details merely because the public Roll identity exists.

## 4.5 Mobile-first form

The form is Arabic/RTL first and uses the existing public design system.

It must:

- explain that the phone must match the number registered on the Warranty;
- display Product/vehicle-safe context already approved for the public Warranty projection rather than asking the customer to retype it;
- keep category selection simple;
- provide clear affected-area field;
- provide one human description field;
- guide image upload with a useful example: one overall image plus close detail when possible;
- show upload progress/errors per image;
- prevent accidental duplicate submission after success;
- show Claim Number clearly on confirmation.

---

# 5. Phone verification contract

## 5.1 Why verification is separate from Cube N read access

Cube N bearer-link possession permits the minimal Warranty projection only. A Claim is a state-changing sensitive action and therefore adds registered-phone verification.

## 5.2 Comparison

The browser submits the Public Code and customer-entered phone to a narrow server boundary.

The authoritative boundary:

1. resolves the Public Code to the physical Roll;
2. resolves the single effective issued Warranty;
3. normalizes both phone representations for **format-only comparison**;
4. compares against `warranties.customer_phone` without returning the stored phone to the client.

V1 comparison normalization may remove benign formatting differences such as whitespace, hyphen, parentheses and common digit presentation, but must **not** guess country codes or rewrite `+20...` into `0...` through country-specific business inference.

If formats are semantically different after bounded format normalization, verification fails and ordinary support may correct Warranty customer details through the existing audited Cube M support path when justified.

## 5.3 Failure behavior

Invalid Public Code, no effective Warranty and phone mismatch must not become a general identity oracle.

Return a generic verification failure at the Claim boundary without exposing:

- stored phone;
- customer name;
- VIN;
- whether another phone would match;
- Claim IDs;
- internal UUIDs.

The existing public Warranty route may continue to show only its already-approved anonymous projection.

## 5.4 No persistent customer session system

P does not build customer accounts.

Implementation may use a short-lived same-origin server-issued verification context to support secure staged evidence upload, but it must be:

- scoped to one Public Code / effective Warranty;
- short-lived;
- non-reusable for another Warranty;
- HttpOnly/server-controlled where a cookie is used;
- not a new printed/public credential;
- not a durable customer identity table.

Exact framework mechanism is an implementation detail to be revalidated against current hosting/Supabase behavior immediately before coding.

---

# 6. Claim data contract

Use a dedicated bounded context.

## 6.1 `warranty_claims`

Required logical shape at P completion:

```text
warranty_claims
- id                    UUID PRIMARY KEY
- request_id            UUID NOT NULL UNIQUE
- warranty_id           UUID NOT NULL -> warranties.id
- claim_number          TEXT NOT NULL UNIQUE
- category              TEXT NOT NULL
- affected_area         TEXT NOT NULL
- description           TEXT NOT NULL
- status                TEXT NOT NULL DEFAULT 'submitted'
- submitted_at          TIMESTAMPTZ NOT NULL
- closed_at             TIMESTAMPTZ NULL
- created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
- updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
```

P freezes the complete Claim status domain for P/Q compatibility even though P itself may create only `submitted`:

```text
submitted
under_review
awaiting_inspection
approved
rejected
cancelled
```

Constraints:

- `claim_number` matches `^PG-C-[0-9]{8,}$`;
- `category` is one of the eight PD-067 values;
- `affected_area` is trimmed, non-empty and bounded; implementation target 2–160 characters;
- `description` is trimmed, non-empty and bounded; implementation target 10–3000 characters;
- P-created Claim has `status='submitted'` and `closed_at is null`;
- `warranty_id`, Claim identity, category, affected area, description and `submitted_at` are immutable after successful submission;
- future Q/R status/closure mutations are named controlled operations only.

### One-open-case invariant

A partial unique index or equivalent authoritative rule enforces:

```text
UNIQUE (warranty_id) WHERE closed_at IS NULL
```

This is intentional even though Q/R are not yet implemented. It is the durable cross-cube contract.

## 6.2 Claim Number source

Use a private sequence analogous to Cube M Warranty Number generation.

Requirements:

- private schema;
- callers cannot manipulate/reset it;
- gaps accepted;
- number allocated inside the authoritative Claim submit mutation;
- retry with the same `request_id` must return the same committed Claim, not allocate a second business record.

## 6.3 `warranty_claim_events`

P creates the append-only event foundation:

```text
warranty_claim_events
- id                UUID PRIMARY KEY
- claim_id          UUID NOT NULL -> warranty_claims.id
- action_request_id UUID NOT NULL UNIQUE
- event_kind        TEXT NOT NULL
- actor_profile_id  UUID NULL
- actor_kind        TEXT NOT NULL
- reason            TEXT NULL
- event_data        JSONB NULL
- created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

P event:

- `submitted`

Because the customer is anonymous, `actor_profile_id` is null for customer submission and `actor_kind='customer_verified_phone'` (or an equivalently narrow frozen code). Do not create a fake Auth/Profile row for the customer.

Q/R may extend the allowed event catalog through later migrations; P event rows remain immutable.

Event data must not duplicate unnecessary customer PII or raw Public Code.

---

# 7. Claim evidence contract

## 7.1 `warranty_claim_evidence`

Logical shape:

```text
warranty_claim_evidence
- id               UUID PRIMARY KEY
- claim_id         UUID NOT NULL -> warranty_claims.id
- evidence_kind    TEXT NOT NULL DEFAULT 'customer_submission'
- storage_path     TEXT NOT NULL UNIQUE
- mime_type        TEXT NOT NULL
- size_bytes       BIGINT NOT NULL
- created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
```

Customer has no Profile, so P must not invent `uploaded_by_profile_id`. Ownership is the verified Claim intake context and becomes the committed `claim_id`.

Metadata becomes immutable after Claim submission.

## 7.2 Private bucket

Use a dedicated private bucket, logically:

`warranty-claim-evidence`

Reuse the proven Cube K evidence bounds unless implementation review finds a concrete hosting incompatibility:

- **minimum 1 image** per submitted Claim;
- maximum 5 images;
- maximum 8 MiB per image;
- JPEG, PNG, WebP initially;
- server validates MIME and size rather than filename extension;
- no video.

The UI should recommend both overall and close-up views without making two separate mandatory evidence slots.

## 7.3 Storage paths

Paths must use random/internal identifiers only.

Do not place in object path:

- Public Code;
- phone;
- customer name;
- VIN;
- plate;
- Warranty Number;
- Claim Number if avoidable.

## 7.4 Upload orchestration

Browser cannot receive permissive anonymous Storage insert rights.

Use server-controlled staged upload authorization following the existing private-evidence compensation pattern.

Final Claim submit validates every staged object and then atomically creates Claim + evidence metadata + submitted event + notification materialization input.

If Storage upload succeeds and the database Claim mutation fails, perform compensation deletion. A successful Claim must never reference a missing required image.

---

# 8. Authoritative Claim submission mutation

Provide one named mutation/service boundary, logically:

`create_customer_warranty_claim(...)`

Inputs are internal/server validated and include only:

- request id/idempotency key;
- verified Public Code/Warranty context, not arbitrary client-owned warranty UUID;
- category;
- affected area;
- description;
- validated staged evidence references.

At commit time it must re-resolve/revalidate:

1. Public Code still maps to the expected physical Roll;
2. exactly one effective Warranty exists;
3. Warranty `record_state='issued'`;
4. authoritative `now()` is before `coverage_expires_at`;
5. registered-phone verification context is valid for this exact Warranty and not expired;
6. no Claim for this Warranty has `closed_at is null`;
7. evidence count is within 1–5;
8. every evidence object belongs to this verified intake and passes type/size checks;
9. no contradictory Warranty state exists.

The mutation then creates in one database transaction:

- Claim row;
- Claim Number;
- evidence metadata rows;
- `submitted` event;
- durable notification materialization/source record required by Cube L pattern.

Do not trust a UI check for coverage or duplicate Claim prevention.

---

# 9. Customer Claim read boundary

Provide a narrow verified read, logically:

`get_verified_customer_claim_status(...)`

It requires the exact Public Code + registered phone verification.

P projection may contain:

- Claim Number;
- customer-facing derived status;
- submitted date/time;
- category label;
- affected area;
- customer description;
- a count/confirmation that evidence was received.

P must not expose:

- internal UUIDs;
- raw evidence storage paths;
- signed evidence URLs to anonymous customer unless a later explicit need is approved;
- Admin/internal notes;
- Warranty policy internals beyond the existing public projection;
- notification records;
- future inspection/decision internal fields.

When Q/R add states, this read contract may extend only with the narrow customer-facing projection frozen in PD-075.

---

# 10. Admin notification contract

Successful Claim submission creates one durable operational notification for active Protection Giants Admin profiles using Cube L materialization conventions.

Recommended event semantics:

- severity: `action_required`;
- title: concise Arabic new-Claim message;
- body: Claim Number + safe Product/vehicle context only;
- action path: future/current Admin Claim detail route under `/operations/claims/...` once Q exists.

During P-only implementation, do not ship a dead deep link. Either:

- link to a minimal authorized P Claim receipt/read surface if built; or
- omit the action path until Q creates the Admin detail route.

Push may be enabled because new customer Claim requires timely Company attention, but durable Inbox truth remains canonical and Push failure cannot affect Claim creation.

Do not notify the anonymous customer through Web Push.

---

# 11. RLS, grants and API boundary

P must follow the established Supabase discipline:

- Claims/events/evidence metadata have RLS enabled;
- anonymous role has no direct table read/write;
- authenticated ordinary users have no generic Claim mutation rights;
- Agents/Dealers/Centers receive no P Claim table access merely because they belong to the network;
- Admin internal read may be added narrowly if needed for notification support, but Q owns the professional Admin review read model;
- lifecycle mutation occurs through explicit server/private database boundary;
- `SECURITY DEFINER`, if used, has fixed `search_path`, explicit authorization/inputs, and no PUBLIC execute grant;
- service-role access stays server-only and must not replace database invariant checks.

Storage bucket is private and has no broad anonymous/authenticated insert/select policy.

---

# 12. Warranty / Cube N integration

## Public Warranty UI

Add Claims affordance without widening the Cube N anonymous projection.

## Caching

Claim eligibility is time/state sensitive. Do not cache Claim create/manage state in a way that can show stale active/expired or duplicate-Claim eligibility.

## Public identity

Do not log or store raw Public Code in Claim events/evidence paths merely for convenience. Persist the authoritative `warranty_id`; Public Code remains in Cube N private identity boundary.

---

# 13. Error semantics

Customer errors should be recoverable and non-technical.

Required cases:

- phone verification failed;
- Warranty no longer active at submission;
- another Claim is already open;
- image count/type/size invalid;
- image upload failed;
- final submit temporarily failed;
- idempotent retry after network ambiguity;
- invalid/unknown Warranty link;
- internal contradictory state.

Never surface raw SQL, UUIDs, Storage paths or security details.

If the final request outcome is ambiguous due network loss, retry by `request_id` must resolve to the already-created Claim when it committed.

---

# 14. Required tests

## Database

- Claim Number format/uniqueness;
- `request_id` idempotency;
- category constraints;
- description/area bounds;
- one-open-Claim partial uniqueness;
- immutable submitted/event/evidence identity fields;
- direct anonymous/authenticated mutations denied;
- expired Warranty rejected at mutation time;
- `voided_in_error`/no effective Warranty rejected;
- evidence count 0 rejected;
- >5 rejected;
- invalid MIME/oversize rejected before commit;
- retry returns same Claim;
- simultaneous submit requests yield exactly one open Claim.

## Security

- wrong phone cannot create/read Claim;
- phone endpoint does not reveal stored phone/customer PII;
- Claim Number cannot be used for unauthorized lookup;
- public Warranty route does not leak Claim private data;
- evidence bucket/object enumeration denied;
- forged warranty UUID from client is ignored/rejected;
- Public Code is not persisted into public Claim tables/evidence paths.

## Application/UX

- active Warranty → phone verify → claim form;
- wrong phone → safe error;
- required image UX;
- upload retry/compensation;
- successful submission → Claim Number confirmation;
- double click/network retry does not duplicate Claim;
- existing open Claim → status, not second form;
- expired Warranty → no new form;
- previously submitted Claim remains followable after expiry;
- mobile Arabic/RTL layout, keyboard, focus, labels and touch targets.

## Regression

- Cube N Warranty states unchanged except intentional Claim affordance;
- Warranty anonymous projection remains minimal;
- Cube M Warranty correction/void behavior remains unchanged in P except P must not introduce a contradictory Claim on already voided Warranty;
- Cube L Inbox/Push failures do not roll back domain Claim truth after notification materialization transaction semantics are satisfied.

---

# 15. Cube P Definition of Done

Cube P is GO only when all are true:

1. approved Claim Product Decisions and Master Architecture are unchanged or explicitly amended;
2. Claim Number and persistence foundation exist;
3. one-open-Claim database invariant is enforced;
4. new Claim requires effective active Warranty at authoritative submit time;
5. phone match verification works without account/OTP;
6. customer cannot choose arbitrary Warranty identity;
7. at least one valid private image is mandatory;
8. no successful Claim can reference missing evidence;
9. Claim submit is idempotent and concurrency-safe;
10. customer receives stable Claim Number and narrow verified status;
11. Admin receives durable new-Claim Inbox notification;
12. anonymous/direct table and Storage access is denied;
13. no Q/R/finance/ticketing scope leaked into P;
14. Database Quality + PR Quality + dedicated **Cube P Claim Intake Quality** gate PASS on the exact final SHA;
15. hosted mobile acceptance passes for active, wrong-phone, open-Claim, expiry and network retry cases;
16. independent engineering/security second review returns PASS.

**Important:** Cube P GO is a software-cube milestone. It is not permission to launch the full customer Claims service in Production before Q and R complete the approved macro lifecycle.
