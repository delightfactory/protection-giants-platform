# Protection Giants — Platform Launch Audit Reconciliation

Baseline: `829e716fc9d1c94177d85096fad326e519aba694`

Status: audit/reconciliation only. No product code, schema, policy, workflow, or UI behavior is changed by this document.

## Sources reconciled

1. Internal independent UX/Product audit — commit `52a6947db0954fc2bc9724d507cf4cd6999e53ea`.
2. Codex independent full-platform audit — commit `82cf4bd7496935d451a13d2fffd1ea591c8c51e4`.
3. Direct source verification on the exact baseline for evidence upload lifecycle, operational account lifecycle, navigation/mobile CSS, notifications, claims/resolution projectors, and package versions.
4. Current upstream security advisories were checked separately for dependency-release ordering. They are not used to alter historical source facts, only to set release priority.

## Reconciliation result

The two audits materially corroborate each other. They independently converged on the same core weaknesses in phone identity, time presentation, notification handoffs, notification taxonomy, custom modal accessibility, public recovery/copy, navigation integration, and implementation-language leakage.

Codex additionally identified three important areas that were not elevated enough in the UX audit:

- operational evidence uploads can become abandoned private Storage objects without a durable staging/cleanup registry;
- privileged account credential/role/binding changes lack a production-grade ownership/audit model;
- the production dependency tree contains known security advisories and the direct Next.js version is patchable without a major-version jump.

No P0 application-state or authorization defect was found by either audit. Core custody, warranty, claim, resolution, privacy, idempotency, and bounded-recovery contracts remain strengths that remediation must preserve.

## Master finding disposition

### ML-001 — Production dependency security acceptance

- Severity: **P1 / release blocker**
- Source: Codex CX-AUD-008; independently rechecked against `package.json` and current upstream advisories.
- Status: **CONFIRMED**
- Evidence: baseline pins `next@16.2.11`. A patched `16.3.3` is available for current advisories.
- Decision: first implementation cube. Do not combine with UX work.

### ML-002 — Operational evidence staging / orphan cleanup

- Severity: **P1 / release blocker**
- Source: Codex CX-AUD-001.
- Status: **CONFIRMED HIGH-CONFIDENCE RISK**
- Evidence: inspection/completion/Admin-recovery uploads write directly to private Storage; successful upload paths are retained by client state and explicit remove calls, but there is no durable staged-object registry/expiry lifecycle comparable to Customer Claim draft evidence. Reload/abandonment can lose the only removal handle.
- Constraint: committed evidence must never be cleaned as if it were abandoned.
- Direction: one small server-owned staging registry/lease/expiry/finalization pattern reused across operational evidence flows.

### ML-003 — Evidence preview before immutable workflow truth

- Severity: **P1**
- Source: Codex CX-AUD-002; corroborates the UX audit's image-review concern.
- Status: **CONFIRMED**
- Affected: Customer Claim, Center inspection, Center completion, Admin recovery.
- Positive reference: pre-install issue already implements local image previews and review guidance.
- Direction: shared preview/remove/replace/final-review component without weakening private Storage or signed-read boundaries.

### ML-004 — Privileged account credential ownership and immutable sensitive-change audit

- Severity: **P1 before broad partner/international rollout**
- Source: Codex CX-AUD-003.
- Status: **CONFIRMED GOVERNANCE/SECURITY RISK**
- Evidence: Admin creates confirmed users with an Admin-entered live password; Admin can directly replace email/password and alter role/entity binding. Current action paths do not append an immutable application audit event describing actor/target/before/after for these sensitive changes.
- Important nuance: this is not evidence of an authorization bypass. It is an identity-governance and repudiation weakness.
- Product decision required: credential takeover/invite/reset model and re-auth policy.

### ML-005 — International time/date contract

- Severity: **P1 for international launch; P2 for controlled Egypt-only staging**
- Source: Codex CX-AUD-004; UX audit F03/F04.
- Status: **CONFIRMED**
- Evidence: viewer-local `LocalDateTime`, explicit `Africa/Cairo`, UTC public date formatting, Cairo-derived production default, and separate `en-GB` formatting coexist.
- Direction: distinguish business date from instant; approve organization/business timezone and display policy; centralize formatting and midnight/DST tests.

### ML-006 — International phone identity contract

- Severity: **P1**
- Source: Codex CX-AUD-005; UX audit F02.
- Status: **CONFIRMED**
- Evidence: activation stores trimmed free-form phone; Claim normalization intentionally does not rewrite country code; `01…`, `+20…`, and `0020…` can compare unequal; public prompt is Egypt-specific.
- Constraint: no unsafe country guessing and no public enumerable lookup.
- Direction: country-aware canonical value plus explicit display/input contract and explicit repair strategy for existing rows.

### ML-007 — Action-required Claim/Resolution notifications without destination

- Severity: **P1**
- Source: Codex CX-AUD-006; UX audit F01.
- Status: **CONFIRMED DEFECT**
- Evidence: Claim submitted and Resolution assignment/reassignment can materialize `action_required` notifications with `action_path = null`; Inbox then offers no task-opening action.
- Direction: safe exact-detail or queue fallback deep links with stale-recipient authorization tests.

### ML-008 — Custom modal/sheet focus lifecycle

- Severity: **P1 accessibility launch gate**
- Source: Codex CX-AUD-007; UX audit F10.
- Status: **CONFIRMED STATIC ACCESSIBILITY DEFECT; rendered acceptance still required**
- Evidence: repeated ARIA-modal sheets have Escape/scroll locking but no evident focus entry/trap/restore.
- Direction: one shared accessible Dialog/Sheet primitive or native dialog pattern, then keyboard/AT tests.

### ML-009 — Physical printer/material/RIP/cut/scan acceptance

- Severity: **P1 physical release blocker**
- Source: Codex CX-AUD-009; previously documented project acceptance debt.
- Status: **CONFIRMED ACCEPTANCE BLOCKER**
- Direction: target-equipment protocol; freeze physical profile only after real printer/media/cutter/device evidence passes.

### ML-010 — Public invalid/damaged QR recovery

- Severity: **P2 / public launch gate**
- Source: Codex CX-AUD-010; UX audit F08/F16.
- Status: **CONFIRMED**
- Constraint: do not add public Warranty/VIN/serial/phone lookup or existence oracle.
- Direction: branded generic recovery, re-scan guidance, governed support path, root public not-found/error treatment.

### ML-011 — Public development-stage copy and governed contact

- Severity: **P2 / launch content gate**
- Source: Codex CX-AUD-011; UX audit F14.
- Status: **CONFIRMED**
- Direction: replace roadmap/development language with current customer value/trust copy; populate approved support/contact details; market/legal content remains acceptance work.

### ML-012 — Notification source taxonomy drift

- Severity: **P2**
- Source: Codex CX-AUD-012; UX audit F07.
- Status: **CONFIRMED**
- Evidence: Warranty/Claim/Resolution domains fall back to generic `تنبيه تشغيلي`.
- Direction: typed presentation dictionary for current source domains/events.

### ML-013 — Operations navigation/task-shell integration debt

- Severity: **P2**
- Source: Codex CX-AUD-013; UX audit F05.
- Status: **CONFIRMED IA INCONSISTENCY**
- Runtime collision severity: **needs browser validation**.
- Direction: one typed role/module registry and explicit mobile overflow/task-shell policy; do not simply add every module to the bottom bar.

### ML-014 — User-facing implementation vocabulary leakage

- Severity: **P2**
- Source: Codex CX-AUD-014; UX audit F12.
- Status: **CONFIRMED**
- Examples: Cube/PD identifiers, Resolution/Snapshot/raw state vocabulary, Supabase Auth/provider terminology.
- Direction: small business-language presentation dictionary; keep internal codes in logs/support diagnostics.

### ML-015 — Browser/mobile/accessibility acceptance gap

- Severity: **P2 technical acceptance blocker**
- Source: Codex CX-AUD-015; current audit limitation.
- Status: **CONFIRMED ACCEPTANCE GAP, NOT A PRODUCT DEFECT BY ITSELF**
- Direction: deliberately small seeded E2E/browser acceptance layer for representative roles, required viewports, focus/axe, manual scanner fallback, stale/retry/public invalid states.

### ML-016 — Login copy says approved Centers only

- Severity: **P3**
- Source: Codex CX-AUD-016; UX audit F15.
- Status: **CONFIRMED COPY/CONTRACT DEFECT**
- Direction: role-neutral or registered/operational Center terminology; reserve `معتمد` for network trust state.

### ML-017 — Claim → Resolution continuation is asymmetric

- Severity: **P2**
- Source: UX audit F06 only.
- Status: **ACCEPTED UNIQUE FINDING**
- Evidence: Claim detail exposes Resolution identity/status but does not provide the reciprocal continuation affordance that Resolution provides back to Claim.
- Direction: status-aware authorized `continue to resolution` action.

### ML-018 — Login password-recovery guidance is absent

- Severity: **P2**
- Source: UX audit F09 only.
- Status: **ACCEPTED UNIQUE FINDING**
- Nuance: self-service password recovery is not required merely to fix the UX. Current organization-owned reset path can be stated explicitly until credential-ownership redesign is approved.

### ML-019 — Mobile nav label typography is compressed

- Severity: **P2/P3 polish depending rendered acceptance**
- Source: UX audit F11 only.
- Status: **CONFIRMED SOURCE VALUE; visual severity pending**
- Evidence: mobile nav labels are `8px`, dropping to `7.5px` at `<=390px`, while target geometry remains large.
- Direction: solve density through IA before increasing item count; validate Arabic readability at required widths.

## Rejected / removed findings

### R-001 — Public Center directory must add phone/address/directions

- Prior source: UX audit F13 / earlier observation.
- Disposition: **REJECTED AS A DEFECT**.
- Reason: current V1 public-data contract intentionally limits exposed Center data. Phone/address/directions must not be added merely as UX polish without an approved public-data/product decision. Existing map discovery remains within scope.

## Severity reconciliation notes

- Time inconsistency is promoted from UX P2 to **P1 for the stated international launch goal** because production business-date defaults and audit timestamps cross country boundaries.
- Dialog focus lifecycle is promoted from medium/static UX concern to **P1 accessibility gate** because the modal contract is repeatedly declared with `aria-modal` across critical Transfer/scanner workflows and no source evidence of focus containment exists.
- Login `approved Centers` wording is reduced to **P3** because it does not alter authorization; it is misleading contract copy rather than a task-state defect.
- Browser E2E absence is not counted as a code defect. It is an acceptance requirement.

## Current release blockers

Before broad Production/international launch, the reconciled blockers are:

1. dependency security patch/qualification;
2. operational evidence staging/cleanup;
3. evidence review before immutable submission;
4. privileged credential ownership/audit decision and implementation;
5. international phone contract;
6. international time/business-date contract;
7. accessible shared dialog qualification;
8. browser/mobile/accessibility representative acceptance;
9. public recovery/content/contact sign-off;
10. physical print/material/RIP/cut/scan acceptance;
11. complete database/RLS/RPC/concurrency qualification on the exact implementation heads.

The notification handoff defect is not a state-integrity blocker, but should be fixed before operational volume because it breaks responsibility transfer at the Inbox boundary.

## Implementation ordering — bounded cubes

Do not combine these into a redesign branch.

### SEC-01 — Dependency Security Acceptance

Scope only:
- patch Next.js to the smallest qualified patched release;
- regenerate lockfile;
- re-run production dependency audit;
- run Node 22 typecheck/build and full existing PR/DB/QR/PDF/cube gates.

No UI redesign or workflow changes.

### UX-DATA-01 — Operational Evidence Lifecycle

Scope only:
- durable staged-evidence registry/lease for Center inspection and Resolution completion/Admin recovery;
- explicit remove/consume/finalize/expiry cleanup contract;
- no changes to immutable committed evidence semantics.

### UX-EVID-01 — Evidence Review

Scope only:
- preview/remove/replace/final review for Customer Claim, inspection, Center completion, Admin recovery;
- reuse proven pre-install preview pattern;
- preserve private Storage and signed-access rules.

### UX-HANDOFF-01 — Notification Handoff

Scope only:
- Claim submitted deep link;
- Resolution assigned/reassigned safe task destination;
- Warranty/Claim/Resolution source labels;
- event/action-path and stale-recipient tests.

### UX-A11Y-01 — Shared Dialog/Sheet

Scope only:
- one accessible primitive;
- scanner and Transfer overlays;
- focus entry, containment, restore, Escape/busy semantics;
- keyboard/axe acceptance.

### ID-01 — Account Security & Ownership

Requires approved credential-ownership decision first.

Scope:
- one-time setup/takeover or invite/reset model;
- sensitive-action confirmation/re-auth as approved;
- immutable actor/target/before/after audit events excluding password material;
- recovery/offboarding behavior.

### INTL-01 — Phone Identity

Requires approved canonical phone decision first.

Scope:
- explicit country context;
- canonical comparison/storage contract;
- existing-data repair strategy;
- activation/Admin correction/Claim verification UX and tests.

### INTL-02 — Time & Business Date

Requires approved timezone/business-date policy first.

Scope:
- shared formatter/business-date helper;
- remove accidental Cairo/browser/UTC drift;
- print labels where audit-significant;
- midnight/DST tests.

### PUB-01 — Public Recovery & Launch Content

Scope:
- branded invalid/damaged QR recovery;
- root public error/not-found;
- governed support/contact;
- replace stale development copy;
- correct approved-vs-registered wording.

### IA-01 — Navigation & Vocabulary

Scope:
- typed role/module registry;
- mobile overflow/task-shell policy;
- Claim→Resolution continuation;
- business-language presentation dictionary;
- mobile nav typography addressed as part of density redesign.

### ACC-01 — Browser/Mobile Acceptance

Scope:
- seeded isolated representative role journeys;
- 320/360/390/430 + desktop;
- keyboard/axe/focus;
- scanner manual fallback;
- stale/retry/public invalid states.

### PHY-01 — Physical Print Acceptance

Execute only after software print identity/profile is stable:
- target printer/RIP/cutter/media;
- QR/barcode scanning on representative devices;
- cut/bleed/registration/curvature/wear;
- duplicate/reprint identity stability;
- signed acceptance evidence.

## Immediate next action

Start **SEC-01 — Dependency Security Acceptance** before any UX remediation cube. It is the smallest high-confidence release-risk reduction, requires no product decision, and prevents UX work from being qualified on a dependency head that must immediately change.

After SEC-01 is green, proceed to UX-DATA-01 and UX-EVID-01, then UX-HANDOFF-01 and UX-A11Y-01 while the product decisions for ID-01, INTL-01, and INTL-02 are finalized.
