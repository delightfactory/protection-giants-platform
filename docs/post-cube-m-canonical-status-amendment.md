# Protection Giants — Post-Cube-M Canonical Status Amendment

**Status:** CUBE M IMPLEMENTATION CLOSURE — becomes merged status with PR #76  
**Implementation base:** `main` at `c0f539a3ae3437f762c08f2fec79700963a40d00`  
**Frozen contract:** `docs/cube-m-warranty-activation-spec.md`

## 1. Purpose and precedence

This amendment supersedes `docs/pre-cube-m-canonical-status-amendment.md` for current implementation status once PR #76 is merged.

The pre-Cube-M amendment remains valid historical evidence of the state immediately before implementation. Approved Product Decisions PD-041 through PD-050 and the frozen Cube M specification remain the business/functional authority for Warranty Activation.

## 2. Cube M delivered boundary

Cube M — Warranty Activation now provides the internal operational path from an eligible opened physical PPF Roll to a durable customer Warranty.

Delivered responsibilities:

- durable `warranties` persistence and append-only `warranty_events` audit history;
- stable globally unique non-secret Warranty Number, retained permanently even after `voided_in_error`;
- one effective `issued` Warranty per physical Roll;
- Product identity snapshot from the immutable Production Order Product snapshot;
- current Product warranty-policy snapshot captured atomically at Activation;
- authoritative coverage start at successful Activation time and calendar-month expiry;
- customer snapshot: required name + phone, optional email;
- vehicle snapshot: required make + model + VIN/chassis, optional year + plate + color;
- Center-only Activation by the active current custodian of an eligible opened Roll;
- network approval remains explicitly outside the Activation gate;
- no mandatory customer account, OTP, photo/video evidence or invoice upload;
- deterministic request idempotency and database-level race protection;
- effective Warranty blocks new Pre-install Issue creation and opened-Roll Recovery;
- internal Warranty Registry and Detail for Center/Admin with Center isolation and no Agent/Dealer/Public PII exposure;
- mobile-first Center Activation flow using the existing contextual Roll QR parser/scanner plus manual serial entry;
- Admin-only bounded customer/vehicle correction with mandatory reason and immutable before/after audit;
- Admin-only irreversible `voided_in_error` for a demonstrably mistaken Activation, retaining history and the old Warranty Number;
- legitimate reactivation after `voided_in_error` only by a new request and full current eligibility revalidation;
- bounded Cube L materialization for Admin support events only: correction is Inbox-only informational state, while `voided_in_error` is a privacy-safe warning eligible for Push;
- successful normal Activation itself remains intentionally notification-silent.

## 3. Preserved lifecycle invariants

Cube M consumes rather than rebuilds earlier lifecycle domains.

The authoritative operational path is now:

`Product -> Production -> Roll -> Custody -> Transfer/Receipt -> Center Opening -> optional Pre-install Issue -> Warranty Activation`

Preserved invariants include:

- Production Order -> current Roll custody lock ordering for competing physical-Roll lifecycle writes;
- one valid winner for Activation vs Issue, Activation vs Recovery, and concurrent Activation races;
- Cube J Opening remains immutable;
- Activation does not move custody;
- Product publication/archive state does not retroactively rewrite an issued Warranty;
- later Center network approval/location/status changes do not rewrite the issued Warranty or silently cancel customer coverage;
- wrong-Roll support correction never mutates `roll_id`; the only V1 path is audited `voided_in_error` followed, where legitimate, by a new Activation;
- direct Data API mutation of Warranty persistence remains denied.

## 4. Security and privacy boundary

Internal Warranty PII remains private operational data.

V1 access boundary after Cube M:

- active Center: activate eligible Rolls and read Warranties issued by its own Center party;
- active Admin: read all internal Warranties and use the two bounded support actions;
- Agent/Dealer: no customer Warranty PII access;
- anonymous/public: no direct Warranty read or lookup.

The human-facing Warranty Number is not a public authorization credential and must never be treated as one.

## 5. Explicitly not delivered by Cube M

The following remain separate future work:

- Public Warranty access / verification;
- non-enumerable public Warranty token and stable public URL;
- customer-facing Warranty QR;
- vehicle / Warranty-card / invoice label-print slice;
- Claims;
- replacement/reinstall lifecycle;
- customer accounts or OTP login.

Cube I remaining Production-owned labels also remain a separate later/parallel workstream.

## 6. Next critical cube

The next critical lifecycle cube is:

**Public Warranty Access / Verification**

It must own:

- a strong non-enumerable public Warranty token;
- a stable public URL;
- a customer-safe public projection rather than direct Warranty-table exposure;
- active / expired / voided public behavior;
- anti-enumeration controls;
- a clean future Claims entry point without requiring a customer account.

Only after that public identity is frozen should customer Warranty QR/print assets be implemented.

## 7. Closure evidence rule

PR #76 is the implementation delivery vehicle for Cube M. Its final exact-head PR Quality, Database Quality and Cube M Warranty Quality results are the merge gate. The PR body records the exact qualified implementation head used for closure.

Production deployment is not part of this Cube M merge and remains a separate explicitly controlled release action.
