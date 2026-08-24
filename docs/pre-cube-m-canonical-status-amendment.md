# Protection Giants — Pre-Cube-M Canonical Status Amendment

**Status:** Specification-stage status amendment — 2026-08-24  
**Baseline:** `main` at `31b8f6321c5d0a9b51aab29147345d96410eaf81`

## 1. Purpose and precedence

This amendment records the current repository position before implementation of the next customer lifecycle cube.

It exists because older README/roadmap/status wording still describes earlier Cubes F, J or K as current/future work.

For implementation status only, this amendment controls where that older wording is stale. Approved Product Decisions and frozen cube specifications still control their own business rules.

No application code, schema, RLS, production deployment or business-state mutation is introduced by this document.

## 2. Confirmed completed software baseline

The current merged software path includes:

- Product Foundation;
- Production Order / Lot / physical Roll Foundation;
- operational identity/users and Agent/Dealer/Center network foundation;
- Center Location / Approval / Public Directory;
- Cube D Roll Custody;
- Cube E outer Roll label/contextual Roll QR software foundation;
- Cubes F/G/H Roll Transfer, receipt, partial receipt and confirmed custody movement;
- Cube J Roll Opening / Claiming and narrow opened-Roll Recovery;
- Cube K Pre-install Roll Issue Reporting and Activation hold semantics;
- cross-cutting operational UX/timezone hardening slices;
- Cube L durable Notification Inbox, Web Push and PWA lifecycle.

Cube L is merged/closed through PR #74 at merge commit:

`31b8f6321c5d0a9b51aab29147345d96410eaf81`

Production remains outside this specification-stage change.

## 3. Current lifecycle position

The internal operational path now reaches:

`Product -> Production -> Roll -> Custody -> Transfer/Receipt -> Center Opening -> optional Pre-install Issue decision`

The next missing lifecycle fact is the customer Warranty created after an eligible opened Roll is legitimately installed/used by its current custodian Center.

## 4. Next cube candidate

The next proposed lifecycle cube is:

**Cube M — Warranty Activation**

Candidate implementation contract:

`docs/cube-m-warranty-activation-spec.md`

The specification must be Product Owner reviewed before implementation begins. Until that approval, its M-D decisions are candidate decisions and must not be appended to the approved Product Decision log as if already frozen.

## 5. Required inherited boundaries

Cube M must consume, not rebuild:

- Cube J immutable Opening;
- authoritative `roll_custody_current` confirmed custody;
- Cube K issue/Activation-hold state;
- Product warranty-policy source;
- existing contextual Roll QR parser/scanner;
- existing actor/Profile/entity lifecycle locks;
- Cube L notification infrastructure where a material asynchronous event genuinely needs it.

It must preserve:

- one PPF Roll -> at most one effective customer Warranty;
- network approval is not an Activation gate;
- customer account/OTP/evidence is not mandatory for normal V1 Activation;
- policy snapshot at Warranty creation;
- no customer PII exposure to Agent/Dealer/public roles without a later explicit decision.

## 6. Cross-domain guards that become mandatory when Warranty schema exists

Cube J and Cube K intentionally left two future handoff guards for the Warranty cube:

1. effective Warranty must block new Pre-install Issue creation;
2. effective Warranty must block Opened Roll Recovery.

Cube M must implement these as narrow integration guards under the already-established physical-Roll locking order rather than reopening J/K architecture.

## 7. Parallel/deferred work remains separate

### Cube I

Remaining Production-owned labels such as bag/case, inner Roll and ERP labels remain a separate later/parallel cube using Cube E print primitives.

They do not belong to Warranty Activation.

### Public Warranty and customer QR

Public Warranty access/verification remains after Cube M.

The future public cube owns the secure non-enumerable public token/URL. Only after that identity is frozen should the vehicle, Warranty-card and invoice QR/print slice be implemented.

No SKU, Roll serial, ERP serial, Transfer ID or non-secret Activation Code should be used as a substitute public authorization token merely to finish printing early.

### Claims / replacement

Claims and replacement/reinstall remain after Public Warranty foundations. Cube M must only leave a clean handoff and must not pre-build those workflows.

## 8. Implementation-start rule

After Product Owner approval of the Cube M specification:

1. record the approved M decisions in `docs/product-decisions.md`;
2. update canonical/README current-next-step wording;
3. fetch the latest merged `main` again;
4. verify no newer merge changed J/K/Custody/Product contracts;
5. create a fresh Cube M implementation branch from that exact `main`;
6. implement the spec in small completed increments;
7. run implementation-integrity and fresh scope/dependency reviews;
8. merge only after exact-head PR Quality, Database Quality and integrated J/K/M verification pass.

The specification branch itself must not become the implementation branch.
