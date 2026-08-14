# Protection Giants Platform

Official repository for the Protection Giants warranty, roll tracking, installation-center, and public product platform.

## Development approach

The platform is developed incrementally in small, complete, testable building blocks. Each block must be stable before the next layer is added.

Start every development/review session with:
- `docs/canonical-project-context.md` — durable project context, decision precedence and historical supersession notes;
- `docs/post-cube-e-canonical-status-amendment.md` — latest post-Cube-E implementation status and Transfer-context reconciliation; this controls where older status/Cube-E wording is stale;
- `docs/product-decisions.md` — approved business decisions;
- `docs/development-governance.md` — mandatory engineering/closure rules;
- `docs/gap-closure-roadmap.md` — dependency boundaries and current cube status;
- the applicable current spec/amendment for the cube being changed;
- `CONTRIBUTING.md`.

For the current next cube, read both:
- `docs/cube-f-pre-design-context-review.md` — implementation-aware Transfer constraints and discovered cross-module risks;
- `docs/cube-f-roll-transfer-state-reservation-spec.md` — frozen Cube F state/reservation/authorization/concurrency implementation contract after its documentation PR is merged.

For completed Cube E print/QR behavior, also read:
- `docs/outer-roll-label-print-foundation-amendment.md`;
- `docs/cube-e-outer-roll-label-print-foundation-spec.md`;
- `docs/cube-e-pending-physical-print-validation.md`.

The current next software cube is **Cube F — Roll Transfer State & Reservation Engine**. Its implementation must start from fresh `main` only after the Cube F specification/decision documentation is merged. Do not implement it from older roadmap wording or from the legacy repository.

Older documents such as `docs/scope-guardrails.md` remain useful for their high-level scope limits, but any wording superseded by a later Product Decision, normative amendment, roadmap correction, canonical-context note, or latest canonical-status amendment must not be treated as current authority.

## Current implementation scope

The first production scope targets Protection Giants paint-protection film operations only. Additional brands or product families are not part of the initial implementation unless explicitly approved through the decision log.
