# Protection Giants Platform

Official repository for the Protection Giants warranty, roll tracking, installation-center, and public product platform.

## Development approach

The platform is developed incrementally in small, complete, testable building blocks. Each block must be stable before the next layer is added.

Start every development/review session with:
- `docs/post-cube-o-canonical-status-amendment.md` — latest authoritative implementation/status boundary after Cube O software delivery;
- `docs/cube-o-customer-warranty-qr-roll-print-pack-spec.md` — frozen Customer Warranty QR / Roll Print Pack contract;
- `docs/post-cube-n-canonical-status-amendment.md` — durable Public Warranty access boundary consumed by Cube O;
- `docs/cube-n-public-warranty-access-verification-spec.md` — frozen Public Warranty access contract;
- `docs/cube-m-warranty-activation-spec.md` — durable Warranty Activation lifecycle reference;
- `docs/canonical-project-context.md` — durable project context, decision precedence and historical supersession notes;
- `docs/product-decisions.md` — approved business decisions through Cube O decisions PD-057–PD-062;
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

**Cube O — Customer Warranty QR & Unified Roll Print Pack is implemented through PR #79.** It reuses the permanent Cube N Public Code, produces three identical customer Warranty QR stickers per Roll, and groups the current approved physical set as one five-piece Roll Print Pack: Outer ×2 + Warranty ×3. The durable contract is `docs/cube-o-customer-warranty-qr-roll-print-pack-spec.md`; the latest status/release handoff is `docs/post-cube-o-canonical-status-amendment.md`.

Cube O software completion does **not** authorize Production customer QR printing by itself. Production printing remains gated by the official `protectiongiants.com/w/<PUBLIC-CODE>` HTTPS route plus the real printer/media/cut profile and physical printed-QR validation. Those release checks are deliberately isolated from the stable Roll/Public-Code/Pack model.

Cube I — Remaining Production-owned Label Package remains valid later/parallel work. Claims/replacement/reinstall also remain later lifecycle work. Neither should create a second print engine or another customer Warranty identity.

Older documents such as `docs/post-cube-n-canonical-status-amendment.md`, `docs/pre-cube-n-public-warranty-status-amendment.md`, `docs/post-cube-m-canonical-status-amendment.md`, `docs/pre-cube-m-canonical-status-amendment.md`, `docs/scope-guardrails.md`, pre-F Transfer context/specification documents, older post-Transfer immediate-next-step wording, earlier pre-Cube-K status wording, older roadmap status sections, and draft studies remain useful for their original scope and design history, but any wording superseded by a later Product Decision, normative amendment, canonical-context note, latest canonical-status amendment, or current frozen cube specification must not be treated as current status authority.

## Current implementation scope

The first production scope targets Protection Giants paint-protection film operations only. Additional brands or product families are not part of the initial implementation unless explicitly approved through the decision log.
