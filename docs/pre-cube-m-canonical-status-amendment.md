# Protection Giants — Pre-Cube-M Canonical Status Amendment

**Status:** APPROVED / FROZEN pre-implementation status amendment — 2026-08-25  
**Baseline:** `main` at `31b8f6321c5d0a9b51aab29147345d96410eaf81`

## 1. Purpose and precedence

This amendment records the authoritative repository position immediately before implementation of Cube M — Warranty Activation.

It exists because older README/roadmap/status wording still describes earlier Cubes F, J or K as current/future work.

For implementation status, this amendment controls where that older wording is stale. Approved Product Decisions, the frozen Cube M specification, merged implementation contracts and later normative amendments retain their normal precedence under `docs/canonical-project-context.md`.

No application code, schema, RLS, Production deployment or business-state mutation is introduced by this document.

## 2. Confirmed completed software baseline

The merged software path includes:

- Product Foundation;
- Production Order / Lot / physical Roll Foundation;
- operational identity/users and Agent/Dealer/Center network foundation;
- Center Location / Approval / Public Directory;
- Cube D Roll Custody;
- Cube E outer Roll label/contextual Roll QR software foundation;
- Cubes F/G/H Roll Transfer, receipt, partial receipt and confirmed custody movement;
- Cube J Roll Opening / Claiming and narrow opened-Roll Recovery;
- Cube K Pre-install Roll Issue Reporting and Activation-hold semantics;
- cross-cutting operational UX/timezone hardening slices;
- Cube L durable Notification Inbox, Web Push and PWA lifecycle.

Cube L is merged/closed through PR #74 at merge commit:

`31b8f6321c5d0a9b51aab29147345d96410eaf81`

Production remains untouched by this specification-stage work.

## 3. Current lifecycle position

The internal operational path now reaches:

`Product -> Production -> Roll -> Custody -> Transfer/Receipt -> Center Opening -> optional Pre-install Issue decision`

The next missing lifecycle fact is the customer Warranty created after an eligible opened Roll is legitimately installed/used by its current custodian Center.

## 4. Next cube — approved

The next critical lifecycle cube is:

**Cube M — Warranty Activation**

Frozen implementation contract:

`docs/cube-m-warranty-activation-spec.md`

Product Owner approval was completed on 2026-08-25. The approved Cube M decisions are recorded in `docs/product-decisions.md` as PD-041 through PD-050.

Cube M implementation must start only after this specification PR is merged, from a fresh branch created from then-current `main`.

## 5. Frozen Cube M identity boundary

Cube M creates the internal/customer Warranty business record and allocates its stable non-secret **Warranty Number**.

V1 Warranty Number family:

`PG-W-NNNNNNNN`

The Warranty Number:

- is globally unique;
- is never reused;
- remains permanently reserved after `voided_in_error`;
- is not the future QR/public-access credential.

The term “Activation Code” in older planning material must not be interpreted as a competing public-security identifier. PD-041 supersedes that generic wording for the human-facing Warranty-instance identity.

The later Public Warranty cube owns the cryptographically strong/non-enumerable public token and URL.

## 6. Frozen Activation data boundary

Normal V1 Activation collects only the customer/vehicle data justified by the Warranty lifecycle.

Required customer data:

- full name;
- phone.

Optional customer data:

- email.

Required vehicle data:

- make;
- model;
- VIN/chassis.

Optional vehicle data:

- model year;
- plate;
- color.

Legacy postal address, country, state and ZIP fields are deliberately not carried forward because the current lifecycle does not justify them.

The Center is never entered as free text. Installing Center identity is derived from the authenticated current-custodian Center and both its stable party id and issuance-time name snapshot are stored.

Warranty coverage starts at authoritative successful Activation time in V1; the Center does not enter/backdate an installation date.

## 7. Required inherited boundaries

Cube M must consume, not rebuild:

- Cube J immutable Opening;
- authoritative confirmed Roll custody;
- Cube K issue/Activation-hold state;
- Product warranty-policy source;
- immutable Production Order Product identity snapshot;
- existing contextual Roll QR parser/scanner;
- existing actor/Profile/entity lifecycle rules;
- Cube L notification infrastructure only where a material asynchronous support event genuinely needs it.

It must preserve:

- one PPF Roll -> at most one effective customer Warranty;
- network approval is not an Activation gate;
- customer account/OTP/evidence is not mandatory for normal V1 Activation;
- policy snapshot at Warranty creation;
- no customer PII exposure to Agent/Dealer/public roles without a later explicit decision.

## 8. Cross-domain guards mandatory with Warranty schema

Cube J and Cube K intentionally left two future handoff guards for the Warranty cube:

1. effective Warranty must block new Pre-install Issue creation;
2. effective Warranty must block Opened Roll Recovery.

Cube M must implement these as narrow integration guards under the established physical-Roll locking discipline rather than reopening J/K architecture.

The frozen concurrency outcome is one valid winner from the same pre-state:

- Issue vs Activation cannot both commit;
- Recovery vs Activation cannot both commit;
- concurrent Activations cannot create two effective Warranties.

## 9. Mistaken Activation closure

A wrong/false Activation must never force deletion or permanently strand a Roll.

Active Admin receives a narrow audited `voided_in_error` correction. History and the old Warranty Number remain retained.

Any legitimate later reactivation requires:

- a new request;
- full current eligibility revalidation;
- a new Warranty row;
- a new Warranty Number.

No automatic Transfer, Recovery, replacement or reactivation occurs as a side effect of voiding.

## 10. Parallel/deferred work remains separate

### Cube I

Remaining Production-owned labels such as bag/case, inner Roll and ERP labels remain a separate later/parallel cube using Cube E print primitives.

They do not belong to Warranty Activation.

### Public Warranty and customer QR

Public Warranty access/verification remains after Cube M.

The future public cube owns the secure non-enumerable public token/URL. Only after that identity is frozen should the vehicle, Warranty-card and invoice QR/print slice be implemented.

No SKU, Roll serial, ERP serial, Transfer ID or non-secret Warranty Number may be used as a substitute public authorization token merely to finish printing early.

### Claims / replacement

Claims and replacement/reinstall remain after Public Warranty foundations. Cube M must only leave a clean handoff and must not pre-build those workflows.

## 11. Implementation-start rule

After this specification PR is merged:

1. fetch the latest merged `main` again;
2. verify no newer merge changed J/K/Custody/Product contracts;
3. create a fresh Cube M implementation branch from that exact `main`;
4. implement the frozen spec in small completed increments;
5. run implementation-integrity and fresh scope/dependency reviews;
6. merge only after exact-head PR Quality, Database Quality and integrated J/K/M verification pass.

The specification branch itself must **not** become the implementation branch.
