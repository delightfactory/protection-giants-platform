# Protection Giants Platform

Official repository for the Protection Giants warranty, roll tracking, installation-center, and public product platform.

## Development approach

The platform is developed incrementally in small, complete, testable building blocks. Each block must be stable before the next layer is added.

Start every development/review session with:
- `docs/post-cube-j-canonical-status-amendment.md` — latest authoritative implementation status after completion of Cube J; this controls where older immediate-next-step wording is stale;
- `docs/post-transfer-stage-canonical-status-amendment.md` — authoritative status after completion of the Transfer stage and historical boundary before Cube J;
- `docs/canonical-project-context.md` — durable project context, decision precedence and historical supersession notes;
- `docs/product-decisions.md` — approved business decisions;
- `docs/development-governance.md` — mandatory engineering/closure rules;
- `docs/gap-closure-roadmap.md` — dependency boundaries and historical sequencing baseline, subject to later status amendments;
- the applicable current spec/amendment for the cube being changed;
- `CONTRIBUTING.md`.

For completed Transfer behavior, the merged implementation on `main` is authoritative. Cube F, Cube G, and Cube H are no longer future work. The Roll Custody & Transfers software macro-capability is closed after merge commit `26ab4d0700610a87552db2972ec0a98c58fb4f12`.

For completed Cube E print/QR behavior, also read:
- `docs/outer-roll-label-print-foundation-amendment.md`;
- `docs/cube-e-outer-roll-label-print-foundation-spec.md`;
- `docs/cube-e-pending-physical-print-validation.md`.

**Cube J — Roll Opening / Claiming is complete on `main`** after merge commit `e4554be58cac3f0fb1add40ef4a3448d65333d55`. Its frozen contract remains in `docs/cube-j-roll-opening-claiming-spec.md`, and the current status/next-step boundary is recorded in `docs/post-cube-j-canonical-status-amendment.md`.

The current next critical software design/specification step is **Pre-install Roll Issue Reporting**. It must remain a separate lifecycle cube after Roll Opening and before customer Warranty Activation.

Cube I — Remaining Production-owned Label Package remains valid later/parallel work, but it is not the current critical operational step. Activation/Warranty labels remain blocked on their own identity/lifecycle decisions.

Older documents such as `docs/scope-guardrails.md`, the pre-F Transfer context/specification documents, the post-Transfer immediate-next-step wording, and older roadmap status sections remain useful for their original scope and design history, but any wording superseded by a later Product Decision, normative amendment, canonical-context note, latest canonical-status amendment, or current frozen cube specification must not be treated as current status authority.

## Current implementation scope

The first production scope targets Protection Giants paint-protection film operations only. Additional brands or product families are not part of the initial implementation unless explicitly approved through the decision log.
