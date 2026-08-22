# Protection Giants — Pre-Cube-K Canonical Status Amendment

**Status:** Authoritative planning/status amendment — 2026-08-22  
**Baseline:** `main` after Cube J post-merge hardening commit `382aecbebb53a52f6f6be75defd01cd78ff6975d`

## 1. Purpose and precedence

This amendment records the repository state after the Cube J post-merge audit/hardening and after product-owner approval of the complete Cube K product boundary.

For current sequencing, this document supersedes older wording that still describes **Pre-install Roll Issue Reporting** as awaiting product/design decisions.

Cube J remains closed software scope. Its implementation and frozen contract are not reopened by Cube K.

## 2. Cube J post-merge audit is closed

PR #60 was merged to `main` as `382aecbebb53a52f6f6be75defd01cd78ff6975d` after a clean post-merge audit and successful PR Quality.

The hardening was deliberately bounded to generated RPC typing, Cube-J-specific inactive-actor error mapping, visible acting-Center identity during irreversible Opening confirmation, and permanent structural regression checks. No Cube J schema or approved lifecycle rule changed.

## 3. Cube K product decisions are approved

The product owner approved all seven previously open Cube K questions on 2026-08-22.

The resulting normative decisions are recorded in `docs/product-decisions.md` as PD-037 through PD-040 and in the frozen specification `docs/cube-k-pre-install-roll-issue-spec.md`.

The core approved behavior is:

- valid issue submission immediately creates a temporary Warranty Activation hold;
- submission is not itself a defect verdict;
- Company/Admin alone makes the V1 final quality decision;
- quality outcomes are `cleared_for_use` or `return_required`;
- Admin may use the separate audited `reported_in_error` correction for accidental reports;
- V1 categories are manufacturing defect, physical damage, contamination/packaging, or other;
- image evidence is optional and private; video is excluded;
- no formal in-system request-more-evidence / Center-response workflow exists in V1;
- issue handling does not create Warranty state or move custody automatically.

## 4. Frozen implementation boundary

`docs/cube-k-pre-install-roll-issue-spec.md` is the implementation contract for Cube K.

It freezes:

- persistence and immutable event history;
- Center submission eligibility;
- Company/Admin resolution authority;
- private evidence Storage boundaries;
- idempotency and concurrency behavior;
- RLS/read privacy;
- Center/Admin mobile UX;
- the future Warranty Activation handoff;
- the minimum Cube J Recovery integration needed to avoid contradictory custody/quality state.

The draft study in PR #61 is historical design work and is superseded by the frozen specification. It must not be merged as a competing source of truth.

## 5. Current next software step

The current next critical software step is now **implementation of Cube K — Pre-install Roll Issue Reporting** from the frozen specification.

Implementation should begin from the latest `main` only after this specification/status change is merged.

The implementation branch must remain a complete but bounded vertical slice: database, service/actions, private evidence handling, Center UX, Admin review UX, generated types, permanent tests, and double review.

## 6. Explicit exclusions remain

Cube K implementation must not pull forward:

- customer/VIN Warranty Activation;
- public Warranty URL/token/QR;
- customer Claims;
- replacement/reinstall;
- generic ticketing/QMS;
- accounting/write-off/credit workflows;
- Cube I remaining Production-owned labels.

## 7. Sequence after Cube K

After Cube K software closure, the next critical lifecycle cube is **Warranty Activation**, which must consume Cube J Opening and Cube K issue-hold state atomically rather than duplicating either domain.
