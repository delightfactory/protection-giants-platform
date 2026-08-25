# Protection Giants Platform

Official repository for the Protection Giants warranty, roll tracking, installation-center, and public product platform.

## Development approach

The platform is developed incrementally in small, complete, testable building blocks. Each block must be stable before the next layer is added.

Start every development/review session with:
- `docs/post-cube-n-canonical-status-amendment.md` — latest authoritative implementation/status boundary after Cube N;
- `docs/cube-n-public-warranty-access-verification-spec.md` — frozen Product-Owner-approved Public Warranty access contract;
- `docs/cube-m-warranty-activation-spec.md` — durable Warranty Activation lifecycle reference consumed by Cube N;
- `docs/canonical-project-context.md` — durable project context, decision precedence and historical supersession notes;
- `docs/product-decisions.md` — approved business decisions, including Cube M and Cube N decisions through PD-056;
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

**Cube M — Warranty Activation is implemented and closed on `main`.** Its durable contract is `docs/cube-m-warranty-activation-spec.md`, and the historical post-implementation status/handoff remains recorded in `docs/post-cube-m-canonical-status-amendment.md`.

**Cube N — Public Warranty Access / Verification is implemented through PR #78.** Its durable contract is `docs/cube-n-public-warranty-access-verification-spec.md`, and its post-implementation status/handoff is `docs/post-cube-n-canonical-status-amendment.md`. The permanent customer Warranty identity is Roll-owned and the canonical production URL contract is `https://protectiongiants.com/w/<PUBLIC-CODE>`.

**The next critical customer-Warranty slice is Customer Warranty QR / Print.** It must reuse the frozen Cube N `/w/<PUBLIC-CODE>` identity for the three approved physical copies — vehicle, Warranty card/certificate, and invoice — plus every reprint. It must not invent another customer Warranty identity.

Cube I — Remaining Production-owned Label Package remains valid later/parallel work. Claims/replacement/reinstall remain later lifecycle work after the customer Warranty verification/print path is complete.

Older documents such as `docs/pre-cube-n-public-warranty-status-amendment.md`, `docs/post-cube-m-canonical-status-amendment.md`, `docs/pre-cube-m-canonical-status-amendment.md`, `docs/scope-guardrails.md`, pre-F Transfer context/specification documents, older post-Transfer immediate-next-step wording, earlier pre-Cube-K status wording, older roadmap status sections, and draft studies remain useful for their original scope and design history, but any wording superseded by a later Product Decision, normative amendment, canonical-context note, latest canonical-status amendment, or current frozen cube specification must not be treated as current status authority.

## Current implementation scope

The first production scope targets Protection Giants paint-protection film operations only. Additional brands or product families are not part of the initial implementation unless explicitly approved through the decision log.
