# Protection Giants Platform

Official repository for the Protection Giants warranty, roll tracking, installation-center, and public product platform.

## Development approach

The platform is developed incrementally in small, complete, testable building blocks. Each block must be stable before the next layer is added.

Start every development/review session with:
- `docs/post-cube-m-canonical-status-amendment.md` — latest authoritative implementation/status boundary after Cube M;
- `docs/cube-m-warranty-activation-spec.md` — frozen Product-Owner-approved Cube M contract and durable Warranty Activation reference;
- `docs/canonical-project-context.md` — durable project context, decision precedence and historical supersession notes;
- `docs/product-decisions.md` — approved business decisions, including Cube M PD-041 through PD-050;
- `docs/development-governance.md` — mandatory engineering/closure rules;
- `docs/gap-closure-roadmap.md` — dependency boundaries and historical sequencing baseline, subject to later status amendments;
- the applicable current spec/amendment for the cube being changed;
- `CONTRIBUTING.md`.

For completed Transfer behavior, the merged implementation on `main` is authoritative. Cube F, Cube G, and Cube H are no longer future work. The Roll Custody & Transfers software macro-capability is closed after merge commit `26ab4d0700610a87552db2972ec0a98c58fb4f12`.

For completed Cube E print/QR behavior, also read:
- `docs/outer-roll-label-print-foundation-amendment.md`;
- `docs/cube-e-outer-roll-label-print-foundation-spec.md`;
- `docs/cube-e-pending-physical-print-validation.md`.

**Cube J — Roll Opening / Claiming is complete on `main`.** Its frozen contract remains in `docs/cube-j-roll-opening-claiming-spec.md`.

**Cube K — Pre-install Roll Issue Reporting is implemented and closed on `main`.** Its frozen contract remains in `docs/cube-k-pre-install-roll-issue-spec.md`.

**Cube L — Notifications + Web Push + PWA is implemented and merged through PR #74.** The merged baseline is `31b8f6321c5d0a9b51aab29147345d96410eaf81`.

**Cube M — Warranty Activation is implemented through PR #76.** Its durable contract is `docs/cube-m-warranty-activation-spec.md`, and the post-implementation status/handoff is recorded in `docs/post-cube-m-canonical-status-amendment.md`.

**The next critical lifecycle cube is Public Warranty Access / Verification.** It must introduce the secure non-enumerable public Warranty identity and customer-safe public projection before any customer Warranty QR/vehicle-card/invoice label slice is implemented.

Cube I — Remaining Production-owned Label Package remains valid later/parallel work, but it is not the current critical operational step. Customer Warranty QR/vehicle-card-invoice labels wait for the secure Public Warranty identity. Claims/replacement/reinstall remain later lifecycle work.

Older documents such as `docs/pre-cube-m-canonical-status-amendment.md`, `docs/scope-guardrails.md`, pre-F Transfer context/specification documents, older post-Transfer immediate-next-step wording, earlier pre-Cube-K status wording, older roadmap status sections, and draft studies remain useful for their original scope and design history, but any wording superseded by a later Product Decision, normative amendment, canonical-context note, latest canonical-status amendment, or current frozen cube specification must not be treated as current status authority.

## Current implementation scope

The first production scope targets Protection Giants paint-protection film operations only. Additional brands or product families are not part of the initial implementation unless explicitly approved through the decision log.
