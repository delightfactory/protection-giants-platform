# Protection Giants — Frozen UX Program Reconciliation Before Launch

Baseline reviewed: `829e716fc9d1c94177d85096fad326e519aba694`

Status: audit / planning reconciliation only. No Product behavior, schema, RLS, deployment, or release state is changed by this document.

## 1. Purpose

Before the final pre-launch improvement program is frozen, reconcile the previously approved **Platform Experience Harmonization** plan with the platform that now exists after Cube L and Warranty/Claims P/Q/R.

This prevents two failure modes:

1. forgetting previously approved UX work merely because later Product Cubes were completed;
2. blindly implementing an old UX plan whose assumptions predate Notifications, Warranty, Claims, and Resolution.

The historical UX program remains governed by its original non-regression rule: a cleaner interface is a regression if it removes, hides, dead-ends, or materially obstructs an already-authorized capability.

## 2. Historical UX authority reviewed

The prior frozen program was recorded on the evidence-only `audit/platform-role-experience` stream and included:

- `docs/platform-experience-harmonization-execution-spec.md`
- `docs/platform-experience-improvement-guardrails-2026-08-22.md`
- `docs/platform-role-capability-reachability-contract.md`
- `docs/platform-role-experience-inventory-2026-08-22.md`
- `docs/development-stream-separation-2026-08-22.md`

Its implementation units were **UX Slices**, not Product Cubes.

## 3. Frozen slice status

| Historical slice | Original purpose | Current status | Current interpretation |
| --- | --- | --- | --- |
| Baseline rendered role walkthrough | Evidence before broad UX changes | Completed for the then-current pre-Warranty/Claims product; no longer sufficient as final acceptance | Preserve historical evidence but repeat after final improvements on current product |
| UX-S01 — Access Correctness & Reachability | Fix role/page contradictions and mobile shell reservation | **Completed / merged** | Preserve regression contracts; do not reopen unless a new access mismatch is found |
| UX-S02 — Cross-cutting Presentation Correctness | Shared time/date plus terminology/status/feedback consistency | **Partially completed** | Time slices A/B/C were completed; later P/Q/R/print introduced new timestamp drift. Terminology/status/feedback were never globally closed |
| UX-S03 — Role Navigation Architecture | Role-frequency navigation, More/Operations, notifications, coherent desktop/mobile mental model | **Open** | Still required and broader now because Warranty/Claims/Resolution were added later |
| UX-S04 — Center Physical Roll Journey | Make physical Center journey continuous and understandable | **Partially covered by later Cubes, not programmatically closed** | Must be updated to include Warranty Activation, Claim inspection, and Claim fulfillment rather than the old pre-Warranty boundary |
| UX-S05 — Role Home / Attention-first Workbenches | Home answers “what needs me now?” using real task state | **Open** | Current Home remains primarily a role-specific module directory |
| UX-S06 — Dense Forms / Progressive Disclosure | Reduce cognitive density while preserving actions | **Open / partial local improvements only** | Must be applied selectively after security/data contracts are settled |
| UX-S07 — Shared State & Visual Polish | Cross-platform state, hierarchy, gallery, focus, copy and public/auth polish | **Open / partial local improvements only** | Becomes the final structural-polish layer, not a substitute for S03–S06 |
| Final cross-role regression walkthrough | Prove reachability, journeys, mobile/desktop and no authority regressions | **Not completed for current post-P/Q/R product** | Mandatory final acceptance before launch-readiness stage |

## 4. What is genuinely complete and should be preserved

### 4.1 Early mobile/design foundation

The merged early interface work established:

- P.G black/red/white visual identity;
- Arabic-first Cairo typography and RTL/LTR handling;
- reusable `components/ui` primitives;
- mobile app header and bottom navigation;
- safe-area handling;
- sticky mobile task actions;
- structured Record patterns;
- semantic feedback/status/empty states;
- confirmation pattern for sensitive actions;
- 320/360/390/430 responsive stress expectations.

The final program must refine this system, not replace it with a new design language.

### 4.2 UX-S01

Merged UX-S01 established:

- real read-only Product Reference reachability for active Agent/Dealer/Center while Admin retains Product management;
- mobile bottom-navigation content reservation including safe area;
- role/access regression coverage;
- rendered checks across Admin/Agent/Dealer/Center at 320, 390 and 1440.

Do not spend a new slice rebuilding this capability unless current tests expose a regression.

### 4.3 UX-S02A/B/C timestamp work

The historical timestamp program deliberately established browser/device-local presentation for operational instants using shared `LocalDateTime`, and closed:

- Transfer timestamps;
- Center location timestamp;
- Roll custody/opening timestamps;
- Admin Center location/approval history timestamps.

The current international-time finding is therefore a **new regression/expanded-scope problem**, mainly from later Claim/Resolution/production/print surfaces. The prior work should be treated as a proven pattern, not discarded.

### 4.4 Cube-specific strong UX patterns

Later Product Cubes also produced patterns that the final UX program should reuse:

- Pre-install Issue image preview/full-size review;
- Transfer staged send/receipt review and interruption recovery;
- Production irreversible preflight/confirmation;
- Warranty activation blocked-state guidance;
- Claim inspection role boundary;
- PWA update Now/Later and multi-tab coordination;
- private evidence and narrow customer projections.

## 5. Frozen open work that still matters

### 5.1 UX-S03 — Role Navigation Architecture remains materially open

The historical requirements remain valid:

- classify destinations as Primary / Attention / Contextual / Reference-Settings;
- persistent navigation should follow role work frequency, not module creation order;
- introduce an explicit More/Operations surface where five bottom-nav slots are insufficient;
- keep Transfers persistently discoverable for Agent/Dealer/Center;
- make Admin physical operations and exception queues discoverable without repeated Home hunting;
- integrate Notifications without displacing primary work;
- desktop and mobile should represent the same role mental model.

Current evidence confirms the slice was not completed:

- Admin mobile navigation still contains Home, Accounts, Dealers, Centers and Products only;
- Admin desktop navigation omits Warranty, Claims, Claim Resolution, Pre-install Issues and Notifications;
- Agent/Dealer/Center expose Transfers on desktop but omit it from mobile persistent navigation;
- task-route hiding still depends on an incomplete pathname heuristic;
- current mobile bottom-nav density has driven labels below the Design System minimum on narrow widths.

This slice must therefore be retained in the final plan and expanded for post-P/Q/R modules.

### 5.2 UX-S04 — Center Physical Journey must be rewritten for the completed lifecycle

The old slice stopped before Warranty Activation. The actual Center-facing lifecycle now spans:

`Incoming Transfer → Receipt → Custody → Roll Opening → Pre-install Quality → Warranty Activation → Claim Inspection when assigned → Approved Claim Fulfillment when assigned → Completion`

The final Center journey review should preserve the strong individual task screens but remove module-knowledge dependence between them.

It should include:

- contextual next action / “what happens next” at state transitions;
- stable back/context behavior;
- correct waiting/blocked states;
- physical-language copy rather than Cube/PD/internal terminology;
- evidence preview/review in Inspection and Resolution Completion;
- notification handoffs into the exact Center task;
- scanner/manual fallback and keyboard/mobile interaction quality;
- no implication that custody changed before the authoritative business event.

No new business state should be invented by this UX slice.

### 5.3 UX-S05 — Role Home / Attention-first Workbenches remains open

Current `/operations` is still fundamentally a `ModuleCard` directory per role. It does not yet implement the historical frozen rule that Home answers **“what needs me now?”** before **“which modules exist?”**.

The final plan should retain the old role-specific intent, updated for the complete product:

**Admin**
- Claims/inspection/Resolution decisions and exceptions;
- physical operations attention;
- network/account attention;
- then management/reference modules.

**Country Agent**
- network approval/setup attention;
- incoming/partial Transfer attention;
- custody/physical operations;
- network/reference.

**Dealer**
- incoming Transfer/receipt attention;
- Centers;
- custody;
- Product reference.

**Center**
- incoming receipt;
- physical Roll tasks;
- assigned inspections;
- assigned claim fulfillment;
- Warranty work;
- issue state/result;
- location/reference.

Use existing authoritative queues/current state only. Notification history can complement a workbench but must not replace current task truth. Do not create fake analytics or decorative metrics.

### 5.4 UX-S06 — Dense Forms / Progressive Disclosure remains open

The final review should target only demonstrably dense surfaces. Current candidates include:

- Admin operational-account edit/security/lifecycle;
- Center administration where identity, hierarchy, location, approval and onboarding are adjacent concerns;
- Product edit/publication/assets;
- Admin Claim/Resolution detail/action surfaces;
- long operational detail pages with secondary audit/support data.

The slice must preserve all authorized data/actions. Progressive disclosure is allowed only where the primary task and reveal path remain explicit.

Some current findings cannot be solved by presentation alone and must remain separate Product/security work first, especially account credential ownership/audit and sensitive-change confirmation.

### 5.5 UX-S07 — Shared State & Visual Polish remains the final polish layer

Still relevant current targets include:

- empty/loading/error/success consistency;
- branded public/root error and not-found states;
- notification source labels;
- status/remedy vocabulary;
- elimination of Cube/PD/vendor/backend terms from primary UI;
- evidence gallery consistency;
- long-text behavior;
- focus/hover/touch feedback;
- public/auth copy consistency;
- login wording/recovery guidance;
- mobile target/typography regressions;
- final spacing/hierarchy/icon/badge consistency.

This should run **after** navigation/journey/security/data structure is settled.

## 6. Historical requirements that now map to newer launch findings

| Frozen UX concern | Current reconciled finding / workstream |
| --- | --- |
| S02 time consistency | `INTL-02` — Time & Business Date contract; later-route regression over the previously completed pattern |
| S02 terminology/status/feedback | `IA-01` / final vocabulary and state-presentation work |
| S03 notification navigation | `UX-HANDOFF-01` + navigation architecture |
| S03 role navigation | `IA-01` / updated UX-S03 |
| S04 evidence gallery | `UX-EVID-01` |
| S04 Center next-step continuity | updated UX-S04 + `UX-HANDOFF-01` |
| S05 attention workbenches | updated UX-S05 using current Claims/Warranty/Resolution queues |
| S06 account form density | `ID-01` first for security contract, then S06 presentation |
| S07 modal/touch/focus | `UX-A11Y-01` plus final visual polish |
| S07 public/auth states | `PUB-01` |
| Final rendered walkthrough | `ACC-01` browser/mobile/accessibility acceptance |

## 7. Current launch-hardening work that was not owned by the old UX program

The final pre-launch program must include these alongside S03–S07; they cannot be dropped simply because they were not in the 2026-08-22 UX freeze:

1. **SEC-01 — Dependency Security Acceptance**
2. **UX-DATA-01 — Operational Evidence Staging/Cleanup Lifecycle**
3. **ID-01 — Credential Ownership + Sensitive Account Audit**
4. **INTL-01 — International Phone Identity**
5. **INTL-02 — Time / Business Date Contract**
6. **UX-HANDOFF-01 — Claim/Resolution Notification Destinations**
7. **UX-A11Y-01 — Accessible Dialog/Sheet Primitive**
8. **PUB-01 — Public Recovery / Launch Content / Trust Contact**
9. **ACC-01 — Repeatable Browser/Mobile/Accessibility Acceptance**
10. **PHY-01 — Physical Print/RIP/Media/Scan Acceptance**

These are not excuses for a mega-PR. They remain separately qualifiable small work items.

## 8. Items deliberately not promoted into the final backlog

- A public Center phone/address/directions expansion is **not** treated as a confirmed defect because the current V1 public projection deliberately excludes broader contact/directions behavior. Any change requires a separate approved product/public-data decision.
- No generic analytics dashboard.
- No generic RBAC engine.
- No arbitrary design-system rewrite.
- No customer account/OTP invention.
- No generalized notification rules/preferences engine beyond current product requirements.
- No new workflow state simply to make a screen look cleaner.

## 9. Final planning consequence

The pre-launch improvement plan must **not** be only the 12-item launch-reconciliation list, and it must **not** simply restart the old UX-S01–S07 plan.

The correct final plan is the union of:

1. completed UX foundations that must be preserved and regression-tested;
2. unfinished frozen structural UX work — especially updated S03, S04, S05, S06 and S07;
3. the newer security/data/international/notification/accessibility findings from the two independent audits;
4. explicit browser/device/physical/content acceptance gates.

Implementation should remain incremental. The final plan should be frozen only after this reconciliation is accepted, and each implementation item should start from current `main`, preserve the Role × Capability reachability contract, and have explicit rendered/mobile acceptance where user interaction is affected.
