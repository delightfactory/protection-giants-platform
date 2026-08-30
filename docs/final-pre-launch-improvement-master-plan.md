# Protection Giants — Final Pre-Launch Improvement Master Plan

**Date:** 2026-08-30  
**Status:** **FROZEN PRE-LAUNCH IMPROVEMENT PLAN**  
**Authoritative product baseline reviewed:** `829e716fc9d1c94177d85096fad326e519aba694`  
**Planning branch:** `audit/platform-launch-reconciliation`  
**Scope:** final improvement/hardening stage before formal Production Launch Readiness.

> This plan does not authorize Production deployment. It defines the complete bounded work that must be closed or explicitly accepted before the project enters the formal launch-readiness stage.

---

## 1. Objective

Protection Giants has completed the main V1 operational lifecycle through Products, Production, physical Roll identity, custody, Transfers, Roll Opening, pre-install quality issues, Notifications/PWA, Warranty Activation, public Warranty access, customer QR/print, Customer Claims, Admin review, Center inspection, Admin decision, Resolution, replacement/reinstall fulfillment and customer-safe final state.

The remaining goal is **not to redesign the product from zero** and not to add speculative capabilities. The goal is to make the existing platform safe, coherent, professional, internationally usable, and operationally launchable.

The final improvement stage therefore has five objectives:

1. remove release-critical technical, identity, evidence and accessibility risks;
2. finish the previously frozen Platform Experience Harmonization work that remained incomplete;
3. integrate the later Warranty/Claims/Resolution modules into one coherent role experience;
4. close public/mobile/browser/physical acceptance gaps with real evidence;
5. preserve all proven domain, security, concurrency and privacy invariants while making the product easier and safer to operate.

---

## 2. Sources reconciled into this plan

This plan is the union of all current authoritative improvement evidence, not a replacement based on one review only.

### 2.1 Existing interface foundations

- `docs/interface-audit-2026-08-07.md`
- `docs/design-system.md`
- `docs/mobile-native-interface-standard.md`
- `docs/brand-interface-reference.md`

### 2.2 Frozen Platform Experience Harmonization program

- `docs/platform-experience-harmonization-execution-spec.md`
- `docs/platform-experience-improvement-guardrails-2026-08-22.md`
- `docs/platform-role-capability-reachability-contract.md`
- `docs/platform-role-experience-inventory-2026-08-22.md`
- `docs/development-stream-separation-2026-08-22.md`

Historical execution status:

- UX-S01 — completed/merged;
- UX-S02A/B/C timestamp slices — completed/merged for their then-existing surfaces;
- UX-S03 through UX-S07 — not closed as a complete program;
- final cross-role current-product walkthrough — not yet completed after Warranty/Claims/Resolution.

### 2.3 Current independent audits

- Internal UX/Product audit — commit `52a6947db0954fc2bc9724d507cf4cd6999e53ea`;
- Codex independent platform audit — commit `82cf4bd7496935d451a13d2fffd1ea591c8c51e4`;
- reconciled audit — `docs/platform-launch-audit-reconciliation.md`;
- frozen-program reconciliation — `docs/pre-launch-frozen-ux-program-reconciliation.md`.

The two independent audits materially corroborate each other. No P0 domain-state or authorization failure was found, while a defined set of P1/P2 launch risks and structural UX debt was confirmed.

---

## 3. Non-negotiable preservation contract

The improvement stage must not damage the strongest parts of the product.

The following are treated as protected invariants unless a separately approved Product decision explicitly changes them:

- database-owned authoritative business state;
- Roll custody truth and immutable custody history;
- Transfer reservation/receipt/custody atomicity;
- Roll Opening immutability;
- Pre-install Issue hold/decision semantics;
- Warranty issuance/correction/void/reactivation history;
- customer Warranty privacy projection;
- one-open-Claim and Claims state-machine contracts;
- Center inspection assignment/privacy boundary;
- Admin adjudication authority;
- Resolution/remedy/material reservation truth;
- replacement Roll concurrency and locking;
- customer-safe Resolution/service-history projection;
- idempotent retry behavior;
- bounded Admin recovery paths;
- RLS/role/entity scope boundaries;
- private evidence Storage boundaries;
- Cube L durable Inbox as canonical notification state;
- Push as best-effort transport, never canonical business truth.

A visually cleaner interface that hides a valid capability, changes authority, or introduces a dead end is a regression.

---

## 4. Work-stream boundary

The improvement program keeps the existing distinction between **Product behavior** and **Experience presentation**.

### Product/security/data work

A work item belongs to the Product/security/data track when it changes:

- persistent state;
- database schema;
- security or identity semantics;
- RLS/RPC authority;
- canonical data normalization;
- lifecycle or cleanup behavior;
- cross-role event semantics.

Such work requires the normal small-spec/small-PR discipline and full database/regression qualification.

### Experience work

A work item belongs to the UX track when it can preserve existing Product behavior while improving:

- navigation;
- information architecture;
- discoverability;
- role Home/workbench composition;
- contextual continuity;
- terminology;
- form hierarchy;
- responsive behavior;
- accessibility presentation;
- feedback and states;
- public/auth presentation.

No UX slice may silently invent a new workflow or grant new authority.

---

## 5. Global implementation rules

### 5.1 Small increments only

Do not create a single “final redesign” branch.

Every work item below is independently reviewable and should normally be one focused PR or one small sequence of clearly bounded PRs.

### 5.2 Fresh-main sequencing

After each accepted merge:

1. fetch current `main` again;
2. confirm the exact new baseline;
3. create the next implementation branch from that baseline;
4. do not reuse stale implementation branches merely because they already exist.

### 5.3 Exact-head qualification

No item is considered closed based on tests from an earlier SHA.

Qualification must apply to the exact candidate HEAD.

### 5.4 No speculative architecture

Do not introduce:

- a generic RBAC engine;
- a generic workflow engine;
- a generic notification preferences/rules engine;
- a generic analytics dashboard;
- a generic print-template designer;
- arbitrary design-system replacement;
- customer accounts/OTP unless separately approved;
- public data fields simply because they may be useful in the future.

### 5.5 Mobile is primary operational acceptance

Any changed operational interaction must be checked at:

- 320px;
- 360px;
- 390px;
- 430px;
- representative desktop width.

Where applicable also check reduced-height/landscape/software-keyboard behavior.

### 5.6 Role × Capability non-regression

For every navigation/Home/journey slice, record before/after reachability for:

- Admin / Company;
- Country Agent;
- Dealer / Distributor;
- Installation Center.

Confirm separately:

- Authorization;
- Discoverability;
- Flow reachability.

---

# 6. Final execution sequence

The sequence below is mandatory by dependency unless a later evidence-based reason justifies a bounded reorder.

---

## Phase A — Baseline Security & Data Safety

These items come first because later UX should not be qualified on a dependency/data model that immediately needs to change.

### SEC-01 — Dependency Security Acceptance

**Priority:** P1 / release blocker  
**Decision dependency:** none.

#### Scope

- upgrade Next.js from the affected baseline to the smallest suitable patched release;
- update `package-lock.json` through the real Node 22/npm toolchain;
- re-run production dependency audit;
- inspect any transitive security changes rather than accepting a version bump blindly;
- verify no generated Next config drift;
- qualify the entire existing platform on the patched dependency head.

#### Explicit non-goals

- no UI redesign;
- no business workflow change;
- no schema/RLS change;
- no unrelated package modernization.

#### Acceptance

- dependency audit has no unresolved launch-blocking advisory in the deployed execution path;
- TypeScript PASS;
- production build PASS;
- PR Quality PASS;
- Database Quality PASS;
- permanent Cube L through Cube R gates PASS where applicable;
- QR/PDF/print software contracts PASS;
- tracked configuration clean.

---

### UX-DATA-01 — Operational Evidence Lifecycle

**Priority:** P1 / release blocker  
**Decision dependency:** bounded technical spec before implementation.

#### Problem

Inspection, Center Resolution Completion and Admin Recovery evidence can be uploaded to private Storage before the durable business submission is finalized. If the browser/session is abandoned after upload, client-only removal handles can be lost and private objects can become operational orphans.

#### Scope

Create one bounded server-owned staging lifecycle for operational evidence:

- durable staged-object registry or equivalent authoritative staging record;
- uploader/flow ownership;
- creation timestamp;
- explicit remove;
- finalize/consume transition;
- expiry/cleanup eligibility;
- cleanup must never remove evidence already committed to immutable business truth;
- retry/idempotency behavior;
- privacy and RLS/service-boundary tests.

Apply only where the current direct-upload lifecycle lacks durable staging ownership.

#### Reuse

Customer Claim draft evidence already has stronger reconciliation behavior and should be used as a functional reference where compatible, not copied blindly.

#### Acceptance

- abandonment is recoverable/cleanable without relying on browser memory;
- committed evidence is permanently excluded from orphan cleanup;
- cross-profile/cross-Center object deletion is impossible;
- repeated finalize/remove/cleanup calls are safe;
- Storage and metadata cannot diverge silently;
- full DB/Storage regression passes.

---

### UX-EVID-01 — Evidence Review Before Irreversible Submission

**Priority:** P1  
**Dependency:** UX-DATA-01 where the same upload lifecycle is touched.

#### Affected flows

- Customer Claim evidence;
- Center Claim Inspection evidence;
- Center Resolution Completion evidence;
- Admin Recovery Completion evidence.

#### Scope

- local visual thumbnails/previews;
- remove before submission;
- replace/reselect safely;
- clear selected-image count;
- clear validation feedback;
- final review state before immutable/authoritative submission;
- responsive gallery behavior;
- full-size review where useful;
- preserve private Storage and signed-read boundaries.

#### Proven reference

Reuse the successful Pre-install Issue preview pattern rather than inventing a separate visual interaction system.

#### Acceptance

- operator can visually verify the actual evidence before final submit;
- file controls meet mobile touch-target rules;
- no public URL exposure of private evidence;
- interrupted/retry behavior remains safe;
- 320–430px rendered acceptance passes.

---

# Phase B — Cross-Role Responsibility Handoff & Accessibility

### UX-HANDOFF-01 — Claim / Resolution Notification Handoff

**Priority:** P1  
**Decision dependency:** none beyond exact role/route contract verification.

#### Problem

Some `action_required` notifications for Claim/Resolution work can materialize with `action_path = null`, leaving the user in Inbox without a direct way to open the work that requires action.

#### Scope

- Claim submitted notification gets an authorized destination;
- Resolution assigned notification gets an exact Center task destination;
- Resolution reassigned notification gets an exact current task destination;
- define safe queue fallback if a formerly exact task is no longer actionable for the current recipient;
- preserve authorization on deep links;
- add current Warranty/Claim/Resolution source-domain presentation labels;
- ensure Push click and Inbox action resolve consistently.

#### Acceptance

- every current `action_required` event has an understandable action destination or explicit safe reason why not;
- stale assignment does not expose the previous Center’s task;
- Push fallback does not create a dead end;
- duplicate event materialization remains idempotent;
- notification privacy remains PII-safe.

---

### UX-A11Y-01 — Accessible Dialog / Sheet Primitive

**Priority:** P1 accessibility gate  
**Decision dependency:** none.

#### Problem

Multiple custom modal/sheet overlays declare modal semantics and implement Escape/body-scroll behavior but lack a clearly reusable focus-entry, focus-containment and focus-restore contract.

#### Scope

Establish one shared accessible interaction primitive or converge on the existing semantic/native dialog pattern for:

- QR scanner sheet;
- Transfer decision sheets;
- Transfer receipt/send overlays;
- unresolved-resolution overlays;
- any equivalent custom modal touched by the migration.

Required behavior:

- initial focus;
- focus containment while modal is active;
- focus restoration to the trigger;
- Escape behavior where cancellation is permitted;
- busy/disabled semantics during in-flight submit;
- background content not operable while modal is active;
- accessible title/description association;
- safe mobile bottom-sheet geometry and keyboard behavior.

#### Acceptance

- keyboard-only walkthrough PASS;
- automated accessibility/axe checks for representative dialogs PASS;
- focus restoration PASS;
- screen-reader semantics manually sampled during final ACC phase;
- no business-flow behavior change.

---

# Phase C — Identity, Account Governance & International Contracts

These items require explicit product/security decisions before coding because the correct behavior cannot be inferred from presentation alone.

## ID-01 — Account Security, Credential Ownership & Sensitive-Change Audit

**Priority:** P1 before broad partner/international rollout.

### Required decisions before implementation

Freeze the intended V1 account ownership model:

- invite/setup-password vs Admin-generated temporary credential;
- whether Admin may ever set a replacement live password directly;
- recovery path;
- first-login/takeover expectation;
- re-authentication requirement for sensitive Admin actions;
- treatment of email change;
- offboarding/suspension interaction.

### Minimum implementation direction

- eliminate unnecessary Admin knowledge/control of a user’s long-lived secret;
- immutable audit event for sensitive account changes;
- audit actor, target, change kind, before/after non-secret fields and timestamp;
- never log password material;
- explicit confirmation/review for role/entity-binding change;
- explicit confirmation for email/security reset where approved;
- preserve self-demotion/self-suspension safety;
- preserve operational Profile as authorization truth.

### UX dependency

Dense account-form progressive disclosure under UX-S06 happens **after** this security contract is stable.

### Acceptance

- account owner can obtain/recover access under the approved model;
- Admin actions are attributable and reviewable;
- role/binding changes cannot be mistaken for harmless profile edits;
- no credential is exposed to browser logs, audit history or normal UI after setup;
- auth/profile rollback/compensation remains safe.

---

## INTL-01 — International Phone Identity

**Priority:** P1 international-launch gate.

### Problem

Warranty Activation accepts/stores a loosely formatted phone while Claim verification performs conservative normalization without country-code guessing. Equivalent real-world numbers such as local, `+CC`, and `00CC` forms can therefore compare unequal. Current customer guidance is Egypt-specific.

### Required decisions before implementation

Freeze:

- canonical phone representation;
- required country context;
- international input/display pattern;
- how country is obtained for Warranty Activation;
- normalization library/helper boundary if any;
- existing Warranty data repair/migration strategy;
- Admin correction behavior.

### Safety rule

Do not guess a country code from an ambiguous local number during Claim verification.

### Scope

Apply one canonical contract consistently to:

- Warranty Activation;
- Admin Warranty customer-phone correction;
- current Warranty phone persistence;
- Claim access verification;
- public/customer phone prompt and errors;
- tests for Arabic/Persian digits, spaces, punctuation, `+`, `00`, local forms and country mismatch.

### Acceptance

- same legitimate international number compares equal under the approved country context;
- ambiguous input fails with explicit guidance rather than unsafe guessing;
- public verification remains non-enumerable;
- existing records receive a deliberate repair path rather than silent reinterpretation.

---

## INTL-02 — Time, Timezone & Business-Date Contract

**Priority:** P1 international-launch gate.

### Existing proven foundation

Historical UX-S02A/B/C already established a strong viewer/device-local `LocalDateTime` pattern for operational instants on Transfers, Roll custody/opening and Center histories.

Later modules reintroduced mixed handling: explicit Cairo, UTC-derived public dates, separate locale formatters and business-date defaults.

### Required decisions before implementation

Classify each temporal field as either:

1. **Instant** — an absolute event timestamp;
2. **Business date** — a calendar date owned by an operational/business timezone;
3. **Coverage date** — customer-facing policy date with explicit contract.

Freeze:

- company/business timezone strategy;
- viewer-local presentation policy for instants;
- production business-date generation policy;
- Warranty/public coverage date policy;
- audit/print display policy;
- DST behavior for countries where it applies.

### Scope

- central helpers/components by semantic type, not one formatter for everything;
- remove accidental hardcoded `Africa/Cairo` from viewer-local event displays;
- remove one-off `en-GB`/UTC presentation drift;
- align Claims/Resolution/Warranty/print surfaces;
- midnight and DST boundary tests;
- preserve stored timestamps.

### Acceptance

- same instant is internally stable and displays consistently according to the approved viewer rule;
- business dates do not shift when viewed from another country;
- public Warranty dates cannot disagree with operational truth because of UTC/Cairo conversion differences;
- printed audit dates use the approved policy.

---

# Phase D — Structural Product Experience Harmonization

This phase completes the previously frozen UX work using the now-complete V1 capability set.

## UX-S03R — Role Navigation Architecture, Revised for Current Product

**Priority:** P1 structural UX  
**Dependencies:** UX-HANDOFF-01; notification capabilities already exist. Prefer after major account/phone/time route semantics are stable.

### Objective

Make persistent navigation reflect each role’s real work rather than historical module implementation order.

### Required destination taxonomy

Every route family must be classified as:

- Primary destination;
- Attention queue;
- Contextual task;
- Reference / Settings / Administration.

### Scope

- create one typed role/module/navigation registry where practical, rather than disconnected Home/mobile/desktop arrays;
- Admin navigation must make Claims, Resolution, Warranty, Issues, Transfers and physical operations discoverable without forcing module hunting;
- Agent/Dealer/Center Transfers must remain appropriately discoverable on mobile;
- integrate Notifications as attention/reference without displacing primary physical tasks;
- introduce a controlled `More` / `Operations` destination if required instead of expanding bottom navigation indefinitely;
- make mobile task-mode hiding explicit by route classification rather than fragile pathname suffix heuristics;
- desktop and mobile follow the same role mental model even when layouts differ;
- retain all valid lower-frequency capabilities through a clear path;
- solve bottom-nav typography/density as an IA problem, not by shrinking text further.

### Non-regression rule

Removing an item from persistent navigation is allowed only when another obvious and tested discovery path exists.

### Acceptance

- no valid role loses a capability;
- no unauthorized role gains a route/action;
- primary role tasks require minimal navigation steps;
- no mobile bottom-nav label violates the Design System minimum;
- task routes do not show irrelevant persistent navigation;
- 320/360/390/430 + desktop role walkthrough passes.

---

## UX-S04R — Center End-to-End Physical & Service Journey

**Priority:** P1 structural UX  
**Dependencies:** UX-EVID-01, UX-HANDOFF-01, INTL-01/02 where affected.

### Current complete Center journey

`Incoming Transfer → Receive → Custody → Open Roll → Pre-install Quality → Warranty Activation → Customer Warranty → assigned Claim Inspection → Admin Decision → assigned Resolution Fulfillment → Completion`

The user does not perform every stage on every Roll, but the product must explain the transitions when they occur.

### Scope

- contextual “next action” from each authoritative state;
- preserve exact Roll/Claim/Warranty context between screens;
- improve return/back behavior so the user does not reset to Home unnecessarily;
- explicit blocked/waiting state and reason;
- physical-language instructions instead of Cube/PD/backend vocabulary;
- distinguish “do not use”, “await company decision”, “return required”, “assignment changed”, “replacement reserved”, “ready to complete” correctly;
- inspection and fulfillment evidence final review;
- scanner/manual fallback consistency;
- offline/network/retry guidance where the workflow already supports retry;
- avoid implying custody movement until the authoritative custody event occurs;
- ensure reassignment immediately removes obsolete actionable UI.

### Acceptance

A trained Center user should be able to narrate the next physical step without knowing internal module names.

Rendered acceptance must cover representative normal and exception paths at supported phone widths.

---

## UX-S05R — Role Home / Attention-First Workbenches

**Priority:** P1/P2  
**Dependencies:** S03R navigation model and stable authoritative queues.

### Core rule

Home answers **“what needs me now?”** before **“which modules exist?”**.

Home is not the only navigation method and is not an analytics dashboard.

### Admin workbench

Use current authoritative data for bounded groups such as:

1. Claims/inspection/Resolution decisions or exceptions requiring Company action;
2. physical operations attention such as unresolved Transfer/quality/material states;
3. Center/network/account attention;
4. management/reference destinations.

### Country Agent workbench

1. scoped Center approval/setup attention;
2. incoming/partial Transfer attention;
3. custody/physical operations;
4. own network management/reference.

### Dealer workbench

1. incoming Transfer/receipt attention;
2. direct Centers;
3. custody;
4. Product reference.

### Center workbench

1. incoming receipt/action;
2. physical Roll/opening work;
3. assigned Claim inspections;
4. assigned Resolution fulfillment;
5. Warranty/issue state relevant to current work;
6. location/reference.

### Rules

- current task-state queues are authoritative;
- unread notification count may complement but never replace task truth;
- no fake metrics;
- no speculative BI;
- avoid broad multi-domain queries if a bounded existing queue/read contract can be reused;
- if a useful attention group requires a new persistent cross-domain engine, escalate instead of hiding it inside UX.

### Acceptance

- a user can identify current actionable work from Home without browsing every module;
- zero-state Home remains useful without fake numbers;
- lower-frequency valid destinations remain discoverable through S03R navigation.

---

## UX-S06R — Dense Forms & Progressive Disclosure

**Priority:** P2  
**Dependencies:** related security/data contracts must be stable first.

### Candidate surfaces

Only apply where walkthrough evidence shows real cognitive density:

- Admin operational account edit/security/lifecycle;
- Center administration and onboarding/location/approval relationships;
- Product edit/publication/assets;
- Admin Claim detail/decision context;
- Admin Resolution detail/actions;
- long audit/support records.

### Scope

- separate identity, status, security, location, approval and support concepts visually;
- reveal secondary/advanced information without hiding required data;
- summarize current state before change controls;
- use before/after review for sensitive edits;
- keep the primary action obvious;
- avoid Card-inside-Card noise unless information hierarchy requires it;
- reduce raw implementation metadata from the primary task layer while retaining support/audit access where authorized.

### Acceptance

- no field/action becomes practically hidden;
- no permission changes;
- primary task is obvious at first scan;
- mobile keyboard/sticky-action behavior remains usable;
- long names/emails/IDs remain readable.

---

## UX-S07R — Shared States, Vocabulary & Final Visual Polish

**Priority:** P2/P3  
**Dependency:** structural slices complete.

### Scope

#### Shared state presentation

- empty/no-results distinction;
- loading;
- success;
- recoverable error;
- terminal/blocked state;
- disabled action explanation;
- stale assignment/state refresh guidance.

#### Vocabulary

Replace primary user-facing implementation language where business language is clearer, including families such as:

- Cube identifiers;
- PD identifiers;
- raw state names;
- `Snapshot`;
- `Resolution` where a clearer Arabic business term is intended;
- `Timeline` where “سجل الأحداث” is clearer;
- `Admin recovery`;
- `Supabase Auth` / provider terminology;
- `checkpoint` / `increment`;
- prototype print vocabulary such as V1/Preflight/Pack where inappropriate for final operators.

Internal codes remain available in logs/support diagnostics where useful.

#### Visual consistency

- status badge semantics;
- icon consistency;
- evidence gallery consistency;
- long text expand/truncate behavior;
- focus/hover/touch feedback;
- spacing/hierarchy;
- mobile target conformance;
- reduced-motion behavior;
- RTL/LTR identifiers;
- public/auth visual consistency.

### Acceptance

- Design System conformance pass;
- no primary interactive target below the accepted mobile minimum unless explicitly justified;
- no route depends on default framework error UI where a product-safe state is required;
- terminology describes the user’s task/result rather than architecture.

---

# Phase E — Public Experience & Launch Content

## PUB-01 — Public Recovery, Trust Copy & Launch Content

**Priority:** P2 / public launch gate  
**Dependencies:** INTL-01/02 where public Warranty/Claim wording depends on them.

### Scope

#### Invalid/damaged QR recovery

- branded `/r/...` failure experience instead of raw `Not Found` text;
- branded root public 404;
- Warranty invalid-link state gets a clear safe next action;
- re-scan guidance;
- governed support/contact path;
- preserve generic errors so public existence is not leaked.

#### Warranty entry

- `/warranty` should accurately explain QR-based access and available recovery/support without inventing public searchable lookup;
- no Warranty/VIN/phone enumeration endpoint.

#### Public copy

Remove stale development-stage language from:

- home;
- footer;
- metadata;
- login/supporting public surfaces where applicable.

Correct `registered` vs `approved` Center language consistently.

#### Product content gate

Before Production launch:

- no TEST/demo public Products;
- public Arabic/approved-market content complete;
- approved Product images/assets present where required by launch standard;
- Warranty/care/technical content reviewed;
- legal/trust/support content approved.

### Explicit V1 boundary

Do not add public Center phone/address/directions merely as a UX “fix”. Current public Center projection remains authoritative unless a separate Product/public-data decision changes it.

### Acceptance

- invalid public URLs fail safely and professionally;
- no framework-default English 404 on primary public routes;
- no development/test copy or fixtures in launch data;
- public content owner signs off before launch readiness.

---

# Phase F — Technical Acceptance & Real-World Qualification

## ACC-01 — Browser, Mobile & Accessibility Acceptance

**Priority:** mandatory technical acceptance gate.

This is not a new feature and not evidence that a bug exists by itself. It is the final proof layer.

### Automated/repeatable layer

Build a deliberately bounded representative acceptance harness, not a giant brittle E2E suite.

Cover representative actors and state fixtures for:

- Admin;
- Agent;
- Dealer;
- Center;
- public/customer.

Required technical scenarios:

- login/access-denied;
- role navigation/reachability;
- Transfer send/receive representative path;
- Roll Opening/scanner manual fallback;
- Pre-install Issue representative state;
- Warranty Activation representative success/blocked path;
- customer Warranty/Claim path;
- Claim inspection;
- Admin decision/Resolution;
- Center fulfillment;
- notification deep link;
- public invalid QR/404;
- stale assignment/retry state.

### Viewports

- 320;
- 360;
- 390;
- 430;
- desktop.

### Accessibility acceptance

- keyboard-only critical tasks;
- focus order;
- modal/sheet focus containment/restoration;
- visible focus;
- labels/names/roles;
- automated axe-style pass on representative pages;
- manual screen-reader sample of critical login, form, modal and public Warranty/Claim surfaces.

### Device/manual acceptance

Use real devices for the capabilities that browser automation cannot prove adequately:

- camera QR scan;
- image capture/upload;
- iOS PWA install/push guidance where supported;
- Android/desktop push representative behavior;
- software keyboard/sticky controls;
- network interruption/retry;
- back/forward/navigation behavior.

### Exit

No visual or accessibility PASS may be claimed solely from source inspection.

---

## PHY-01 — Physical Print / Media / RIP / Cutter / Scan Acceptance

**Priority:** mandatory physical release gate for production labels and customer Warranty QR printing.

Software PDF/vector tests remain necessary but are not sufficient.

### Freeze the target physical profile

Record the actual:

- printer;
- RIP/software/version where relevant;
- media/label stock;
- cutter/finishing process;
- DPI/profile/scaling settings;
- approved physical dimensions;
- gaps/bleed/registration constraints.

### Physical acceptance matrix

Print representative:

- outer Roll labels;
- customer Warranty QR labels;
- Master Pack / grouped production output.

Verify:

- physical dimensions;
- cut accuracy;
- front/back consistency;
- text legibility;
- GTIN/barcode decoding where applicable;
- QR decoding with normal phone cameras;
- multiple Android/iOS representative devices;
- curved/carton application where physically relevant;
- reprint identity stability;
- no raw secret/public-code leakage beyond the approved QR encoding contract;
- wear/handling sufficient for intended operational use.

### Exit

Printer/RIP/media geometry must not be called “final” until this acceptance is signed off.

---

# 7. Cross-cutting acceptance required for every implementation item

Every implementation PR must have the relevant subset of the following.

## 7.1 Code quality

- exact-head TypeScript;
- exact-head production build;
- `git diff --check` / tracked-config cleanliness;
- no temporary tooling/markers in product diff.

## 7.2 Database/security

When schema/RPC/RLS/Storage changes:

- fresh database rebuild from all migrations;
- DB lint;
- explicit grants check;
- generated types exact-match;
- relevant RLS/role isolation;
- relevant concurrency/idempotency tests;
- no service-role widening solely to simplify tests.

## 7.3 Product regressions

Run all affected Cube gates, plus upstream/downstream gates when the change crosses boundaries.

High-risk changes may require the full Cube L–R matrix.

## 7.4 UX/reachability

When navigation/journey/UI changes:

- before/after Role × Capability matrix;
- direct route authorization smoke;
- contextual next-step links;
- no dead controls;
- loading/empty/error/success checks;
- supported mobile widths;
- desktop check;
- no horizontal overflow;
- touch target check;
- keyboard/focus check where applicable.

## 7.5 Evidence

Record exact:

- HEAD SHA;
- tests/workflows run;
- rendered evidence or manual acceptance performed;
- unresolved limitations;
- whether Production was touched.

---

# 8. Recommended merge/order map

The default implementation order is:

1. `SEC-01` — dependency security;
2. `UX-DATA-01` — operational evidence lifecycle;
3. `UX-EVID-01` — evidence review;
4. `UX-HANDOFF-01` — Claim/Resolution notifications;
5. `UX-A11Y-01` — accessible Dialog/Sheet;
6. `ID-01` — account security/credential ownership;
7. `INTL-01` — international phone identity;
8. `INTL-02` — time/business-date contract;
9. `UX-S03R` — role navigation architecture;
10. `UX-S04R` — Center end-to-end journey;
11. `UX-S05R` — attention-first role workbenches;
12. `UX-S06R` — dense forms/progressive disclosure;
13. `PUB-01` — public recovery/content/trust;
14. `UX-S07R` — shared states/vocabulary/final polish;
15. `ACC-01` — full current-product browser/mobile/accessibility acceptance;
16. `PHY-01` — physical print/media/RIP/cut/scan acceptance.

### Decision preparation may run ahead, implementation may not

While SEC/evidence/handoff/accessibility items are being implemented, the product owner and reviewer may freeze the decisions required for:

- ID-01;
- INTL-01;
- INTL-02.

But implementation of those items should start only after their decision documents are frozen and from then-current `main`.

---

# 9. Why this order

### Security first

Dependency/security and data-lifecycle changes can invalidate later qualification if postponed.

### Evidence before evidence polish

A preview component is not enough if the underlying staged object can become orphaned. Lifecycle truth therefore precedes visual review.

### Handoff/accessibility before broad IA

Navigation should be built around working responsibility links and accessible interaction primitives, not around known broken edges.

### Identity/phone/time before final journey design

Account, international phone and temporal contracts affect wording, forms, validation, support and history. Structural UX should consume stable contracts rather than be rewritten after them.

### Navigation before Home

A task-first Home cannot compensate for incoherent persistent navigation. Home must not become the only route map.

### Journey before dense-form polish

Cross-screen continuity matters more than polishing individual pages while the journey remains fragmented.

### Final polish after structure

S07R intentionally comes late so effort is not wasted styling structures that are still being reorganized.

### Acceptance last

ACC-01 validates the final integrated software candidate. PHY-01 validates the real-world print system that software alone cannot prove.

---

# 10. Role-specific final acceptance criteria

## Admin / Company

Before launch readiness, Admin must be able to:

- understand what needs Company action now;
- navigate network/account, production/custody, warranty/claims and exception work without hidden modules;
- make sensitive decisions with clear consequence and confirmation;
- distinguish customer-safe data from operational/admin internals;
- audit privileged account/support changes;
- move from Claim to authorized Resolution context cleanly;
- recover from errors without internal Cube/PD knowledge.

## Country Agent

Agent must be able to:

- manage own Dealer/Center network within scope;
- understand Center approval/setup attention;
- send/receive Transfers and see physical custody;
- access Product reference;
- use exceptional opened-Roll Recovery only when enabled;
- never see Company-global Claims/Admin authority outside scope.

## Dealer

Dealer must be able to:

- manage direct Centers;
- find incoming/outgoing Transfer work quickly on phone;
- understand own custody;
- access Product reference;
- complete onboarding-related Center administration without Company-only controls.

## Installation Center

Center must be able to:

- receive physical Rolls;
- confirm custody;
- open exact Roll;
- report pre-install problem;
- understand use/hold/return state;
- activate Warranty using internationally correct customer identity inputs;
- see and execute only currently assigned Claim inspection/fulfillment work;
- review evidence before irreversible submission;
- understand the next physical task without knowing internal module architecture;
- lose obsolete actions immediately after reassignment/state change.

## Public / Customer

Customer must be able to:

- understand Product and Warranty public surfaces;
- use permanent Warranty QR safely;
- understand invalid/damaged-link recovery without an existence oracle;
- verify Claim access with an internationally correct phone contract;
- submit/review evidence safely;
- understand Claim/Resolution status without implementation terminology;
- see current service history without private Roll/Admin internals.

---

# 11. Explicit launch gates after improvement implementation

Completion of implementation PRs does **not** itself authorize Production launch.

Before entering formal Production Launch Readiness, all of the following must be true:

### Repository

- all planned P1 items closed;
- accepted P2 launch gates closed;
- exact final candidate SHA identified;
- PR Quality green;
- Database Quality green;
- relevant Cube quality gates green;
- no unresolved blocking review threads;
- dependency/security acceptance green.

### Hosted application

- clean staging/production-candidate deployment for the exact SHA;
- no test fixtures on public launch data;
- correct Production domain routing/HTTPS;
- Auth Site URL/redirect/invite configuration finalized;
- production notification worker/scheduler configuration finalized where required;
- SMTP/email configuration finalized where required by approved account flow;
- required Storage buckets/policies present;
- public signup remains intentionally disabled;
- secrets/environment variables verified without exposure.

### Product/content

- public Product content approved;
- support/contact details approved;
- legal/privacy/customer trust copy approved where required;
- no stale development language;
- no `TEST` customer-visible records;
- approved logo/brand asset decision resolved or current intentional fallback explicitly accepted.

### Browser/device

- ACC-01 signed PASS;
- camera/upload/manual fallback evidence recorded;
- accessibility acceptance recorded;
- no unresolved critical mobile overflow/touch/focus issue.

### Physical

- PHY-01 signed PASS;
- actual production printer/media/RIP profile frozen;
- customer Warranty QR scans successfully from real output;
- outer label physical acceptance signed.

Only after these gates are satisfied should the project begin the separate **Production Launch Readiness / Cutover Plan** covering backup, deployment order, migration execution, DNS/domain cutover, smoke tests, rollback criteria and launch monitoring.

---

# 12. Definition of Done for the entire improvement stage

The final pre-launch improvement stage is complete only when:

1. no unresolved P0/P1 launch blocker remains;
2. dependency and platform security baseline is qualified;
3. evidence uploads have a durable safe lifecycle;
4. users can visually review evidence before irreversible submission;
5. operational notifications reliably hand responsibility to an actionable destination;
6. critical modal/sheet flows meet accessibility focus requirements;
7. operational account ownership and sensitive-change auditing meet the approved governance model;
8. phone identity works under the approved international contract;
9. time/business-date semantics are consistent across countries and outputs;
10. navigation reflects role work and all valid capabilities remain reachable;
11. Center physical/service journey is coherent end to end;
12. Home surfaces actionable work before module inventory without fake analytics;
13. dense administrative screens are understandable without hiding valid actions;
14. public recovery and launch content are professional and safe;
15. shared vocabulary/states/visual details conform to the Design System;
16. final current-product browser/mobile/accessibility acceptance passes;
17. physical print/cut/scan acceptance passes;
18. full affected Product/database/concurrency regressions remain green;
19. `main` remains free of temporary audit/evidence tooling not intended for Product;
20. a final exact SHA is ready to enter the separate Production Launch Readiness stage.

---

# 13. Immediate next implementation action

After this plan is accepted, the first implementation branch must be created fresh from current `main` for:

**SEC-01 — Dependency Security Acceptance**

No other UX or Product behavior should be bundled into that first patch.

After SEC-01 is qualified and merged, proceed sequentially according to the order in Section 8 while freezing ID-01 / INTL-01 / INTL-02 decisions in parallel as documentation-only planning work.

---

## Final planning verdict

This document supersedes using either of the following in isolation as the pre-launch improvement roadmap:

- the historical UX-S01–S07 plan by itself;
- the newer launch-audit finding list by itself.

The authoritative final direction is their reconciled union as defined here: **preserve completed foundations, finish the unfinished structural UX program, close the newly discovered security/data/international/accessibility risks, and then prove the integrated product on real browsers/devices and physical print output before launch readiness begins.**
