# UX-00 — Full Experience Audit

Baseline: `829e716fc9d1c94177d85096fad326e519aba694`

Status: audit-only. This document records findings and remediation direction. It does not authorize or implement product behavior changes.

## Audit objective

Review the platform as a product experience rather than as a collection of working screens. The audit covers role reachability, end-to-end task journeys, cross-role handoffs, information architecture, content design, recovery states, responsive behavior, accessibility foundations, operational timestamps, public warranty/claim flows, production/roll custody/transfer workflows, and PWA/notification interaction.

Roles reviewed:

- Admin
- Country Agent
- Dealer / Distributor
- Installation Center
- Public Customer

Primary journeys reviewed:

- Public home, products, centers, warranty verification, warranty claim intake/follow-up
- Login, center onboarding, access-denied and operational recovery states
- Operational users and entity lifecycle
- Production order creation, roll registry/opening, print pack origin generation
- Roll transfer send / receive / partial receipt
- Warranty activation and internal warranty registry/detail
- Claim intake, Admin review/decision, Center inspection, Admin resolution, Center resolution completion
- Notifications, push routing and PWA update lifecycle

## Evidence model and limitation

Findings below are source/contract-level findings on the exact baseline SHA. Prior UX-S01 rendered acceptance at 320 px, 390 px and 1440 px remains useful evidence for the shell that existed at that time. UX-S02 timestamp contracts were also reviewed.

The current tool path did not expose an executable browser/screenshot session for the deployed application, so this document does **not** claim that a fresh rendered multi-role visual/keyboard acceptance has been completed for the post-P/Q/R product. Any finding that specifically depends on focus movement or rendered geometry is marked accordingly and must be validated in the rendered acceptance gate before closure.

Severity:

- **P0** — blocks a core task or materially misleads the user in a way that creates severe operational risk.
- **P1** — high error/lockout risk or a broken critical handoff.
- **P2** — significant friction, discoverability, cognitive-load or consistency problem.
- **P3** — visual/content polish with low task risk.

Confidence:

- **High** — directly proven by source/contracts.
- **Medium** — strong source signal but rendered interaction should confirm the impact.

## Executive result

- P0: **0**
- P1: **2**
- P2: **multiple integration and professionalism gaps**, concentrated in shared product edges added after the earlier UX pass.

The core business screens are generally careful and safe. The highest UX debt is not inside the claim/transfer state machines themselves; it is at the boundaries between modules and roles: notification routing, phone identity formatting, persistent navigation, recovery paths, timestamp policy, and user-facing terminology.

---

## P1 findings

### UX00-F01 — Action-required Claim / Resolution notifications can dead-end in Inbox

**Severity:** P1  
**Confidence:** High

Evidence:

- `supabase/migrations/20260826122000_cube_q_claim_cube_l_notification_materialization.sql`
  - `warranty.claim_submitted` is materialized as `action_required` with `action_path = null`.
- `supabase/migrations/20260827092000_cube_r_completion_notification_materialization.sql`
  - Center resolution assignment/reassignment notifications are `action_required` while their `action_path` is null.
- `lib/notifications/push-worker-contract.ts`
  - null action paths fall back to `/operations/notifications`.
- `app/operations/notifications/page.tsx`
  - a notification with no `action_path` has no task-opening action; the user can only mark it read.

Impact:

An Admin can receive “new warranty claim needs review” and a Center can receive a resolution assignment push, tap it, land in Inbox, and still have no direct route from that notification to the task. Recovery is possible by manually rediscovering the relevant queue, but the action-required handoff itself is broken.

Minimal remediation direction:

Materialize stable, role-correct deep links for each action-required event. Keep authorization server-side and do not expose forbidden object identifiers to roles that cannot open the target. Add regression tests that assert every `action_required` notification resolves to an actionable route.

### UX00-F02 — Equivalent phone formats can lock a legitimate customer out of the Claim journey

**Severity:** P1  
**Confidence:** High

Evidence:

- `supabase/migrations/20260825013000_cube_m_warranty_activation_engine.sql`
  - warranty activation stores the entered customer phone after trimming; it does not canonicalize the country code.
- `supabase/migrations/20260825231000_cube_p_claim_intake_engine.sql`
  - claim phone normalization converts Arabic/Persian digits and removes whitespace/parentheses/hyphens, but explicitly does not guess/rewrite country codes.
- `components/warranties/warranty-activation-flow.tsx`
  - the Center phone input does not establish a canonical international format.
- `app/(public)/w/[publicCode]/claim/claim-client.tsx`
  - customer verification hints an Egyptian local form: `01xxxxxxxxx`.

Impact:

The same real phone number can compare unequal if activation stored `+20…`, `0020…` or a local `01…` form and the customer enters another equivalent form. That can deny a legitimate customer access to submit/follow a warranty claim. This is especially material because the platform supports country agents and is not architecturally Egypt-only.

Minimal remediation direction:

Define one explicit phone identity contract before coding. Prefer country-aware canonical storage/verification (for example an E.164-equivalent canonical value), preserve a display value if needed, update both Center capture and Customer verification guidance, and design backward compatibility for existing warranty rows. This requires a narrow data/contract cube, not a cosmetic input patch.

---

## P2 findings

### UX00-F03 — Post-UX-S02 operational screens regress the timestamp presentation contract

**Severity:** P2  
**Confidence:** High

The established UX-S02 contract in `scripts/verify-platform-datetime-presentation.mjs` requires operational timestamps to reuse `LocalDateTime` and follow the browser/device timezone rather than hard-code Cairo.

Later Claim screens bypass that contract:

- `app/operations/claim-inspections/[id]/page.tsx` hard-codes `Africa/Cairo` in the PageHeader timestamp.
- `app/operations/claim-resolution-tasks/[id]/page.tsx` hard-codes `Africa/Cairo` in the PageHeader timestamp.
- `components/rolls/roll-opening-flow.tsx` uses a parallel `en-GB` formatter rather than the shared operational component.

Impact:

The same operational event can be displayed using different timezone/locale rules across queue/detail/workflow screens, especially for users outside Egypt.

Direction:

Restore one operational timestamp policy and enforce it for all newer modules through a repository verifier, including Claims and Roll Opening.

### UX00-F04 — Customer/public warranty date policy is inconsistent

**Severity:** P2  
**Confidence:** High

- `app/(public)/w/[publicCode]/page.tsx` formats activation/coverage dates with `timeZone: "UTC"`.
- Customer Claim surfaces use Cairo-oriented formatting.
- Operational surfaces generally follow device-local time under UX-S02.

Impact:

Near a date boundary the public warranty page can display a different calendar date for the same timestamp than another surface.

Direction:

Define the semantic type of each value: business date vs timestamp. Date-only customer facts should be derived consistently from the intended business timezone/contract, not incidentally from UTC on one page and Cairo/device time elsewhere.

### UX00-F05 — Admin persistent navigation did not absorb newer operational modules

**Severity:** P2  
**Confidence:** High

`app/operations/page.tsx` exposes Admin modules for pre-install issues, warranties, claims and claim resolutions, but `components/operations-nav-links.tsx` does not include those modules in Admin persistent navigation. Mobile Admin navigation is even narrower.

Impact:

Newer high-value workflows are discoverable from the dashboard but disappear from the persistent information architecture. This increases rediscovery cost and amplifies F01 when a notification does not deep-link correctly.

Direction:

Do not simply add every route to the existing bar. Define a small grouped Admin IA (for example core entities, material flow, warranty/claims) with an intentional mobile overflow/more pattern.

### UX00-F06 — Claim → Resolution continuation is asymmetric

**Severity:** P2  
**Confidence:** High

- Resolution detail links back to the Claim record.
- `app/operations/claims/[id]/page.tsx` shows resolution id/status but does not provide a direct link to `/operations/claim-resolutions/<id>`.

Impact:

An Admin reviewing an approved Claim must leave the record and rediscover the execution queue to continue the workflow.

Direction:

Expose a status-aware “continue to resolution” affordance when a resolution exists and the role is authorized.

### UX00-F07 — Notification source taxonomy has drifted

**Severity:** P2  
**Confidence:** High

`app/operations/notifications/page.tsx` recognizes older source domains, while `warranty`, `warranty_claim` and `warranty_claim_resolution` fall through to the generic label `تنبيه تشغيلي`.

Impact:

The Inbox loses information scent exactly where the platform now has multiple warranty/claim workstreams.

Direction:

Centralize notification source/event labels and add the newer domains with user-oriented names.

### UX00-F08 — Invalid/old public warranty URLs fall to an unbranded default 404

**Severity:** P2  
**Confidence:** High

- `app/(public)/w/[publicCode]/page.tsx` calls `notFound()` for an unresolved public code.
- There is no `app/not-found.tsx` or `app/(public)/not-found.tsx` in the baseline.

Impact:

A damaged, mistyped or obsolete QR/link can terminate the core public warranty journey without branded explanation or a safe recovery path.

Direction:

Add a generic non-enumerating public recovery state: explain that verification could not be completed, offer re-scan / warranty guidance / support paths, and do not disclose whether a specific code ever existed.

### UX00-F09 — Login has no password-recovery guidance although Admin reset exists

**Severity:** P2  
**Confidence:** High

- `app/login/page.tsx` contains email/password and a link back to the public site, with no “forgot password” or support instruction.
- `app/operations/users/[id]/edit/page.tsx` already allows Admin to set a new password.

Impact:

A user who forgets a password reaches a dead end even though the organization already has a supported recovery mechanism.

Direction:

If self-service recovery is intentionally out of scope, state the actual supported path (“contact your platform administrator to reset access”) rather than adding unnecessary auth complexity.

### UX00-F10 — Custom Transfer dialogs lack visible focus-management logic

**Severity:** P2  
**Confidence:** Medium — rendered keyboard validation required

`components/transfers/transfer-send-flow.tsx` and `components/transfers/transfer-receipt-flow.tsx` implement custom modal sheets with `role="dialog"` and `aria-modal="true"`, body scroll locking and Escape handling. In the reviewed source there is no focus-on-open, focus trap, or explicit focus restoration to the trigger.

Impact:

Keyboard/screen-reader users can potentially remain focused behind a modal or tab into background controls.

Direction:

Prefer the already-proven native/shared confirmation dialog pattern or add complete dialog focus management. Validate Tab / Shift+Tab / Escape / focus restoration in rendered acceptance.

### UX00-F11 — Mobile operational navigation labels are too small for a polished Arabic UI

**Severity:** P2  
**Confidence:** High for source values; rendered acceptance required for final visual sign-off

The mobile shell CSS resolves to roughly 9 px label text at common narrow widths (with variants around that range), while touch targets themselves remain appropriately large.

Impact:

Touchability is acceptable, but Arabic label readability and hierarchy are below a professional operational UI standard.

Direction:

Keep ≥44 px target geometry, reduce density through IA rather than typography compression, and retest at 320/390 widths.

### UX00-F12 — Internal implementation terminology leaks into user-facing content

**Severity:** P2  
**Confidence:** High

Examples across operational surfaces include `Supabase Auth`, `Auth`, `Snapshot`, `Resolution`, raw enum/status values, `Timeline`, and `Undo`. Technical identifiers such as VIN, SKU, Lot and QR are domain-appropriate; implementation vocabulary is not.

Impact:

The interface reads like an engineering console in places rather than a finished Arabic operations product.

Direction:

Create a lightweight domain terminology dictionary and migrate user-facing labels incrementally. Do not rename database enums/contracts solely for UX copy.

### UX00-F13 — Public Center directory discovers a center but does not complete the “go/contact” task

**Severity:** P2  
**Confidence:** High

The public directory exposes center name/city/country/classification and map coordinates. Cards/popups provide map selection, but no directions action and no contact/address action.

Impact:

A customer can find that a Center exists without an obvious next step to reach it.

Direction:

At minimum, provide a directions link from existing coordinates. Add phone/address only if the approved public data policy supports them.

### UX00-F14 — Public homepage contains development-stage copy that is now stale

**Severity:** P2  
**Confidence:** High

The homepage still uses language such as services being available “عند تفعيل النشر العام” / “عند اكتمال دورة التفعيل”, while products, centers, warranty verification and claims are already implemented.

Impact:

The public brand experience communicates unfinished roadmap language instead of current customer value.

Direction:

Rewrite homepage copy around what customers can do now: verify authenticity/warranty, find centers, understand products and request warranty service.

### UX00-F15 — Login copy says only “approved” Centers can enter, contradicting platform semantics

**Severity:** P2  
**Confidence:** High

`app/login/page.tsx` says login is for “مراكز التركيب المعتمدة”, while the operational model explicitly separates Center operational status from network approval and allows a registered non-approved Center to perform eligible operations.

Impact:

The login mental model contradicts the actual authorization model.

Direction:

Use “مراكز التركيب المسجلة/المصرح لها” or equivalent approved product terminology.

### UX00-F16 — Public Warranty entry has no QR-loss recovery guidance

**Severity:** P2  
**Confidence:** High

`app/(public)/warranty/page.tsx` correctly states that the official route is the warranty QR, but does not explain what to do if the physical QR is damaged or unavailable.

Direction:

Add a safe support/recovery instruction without creating a public code-enumeration or search oracle.

---

## Positive findings to preserve

### Center Claim inspection boundary

The Center task clearly states that the Center supplies evidence/technical observation and does not decide acceptance/rejection. Customer contact data is not exposed. Submission requires evidence and acknowledgement.

### Center Claim resolution execution

The task shows only the assigned remedy and, for replacement, the exact assigned roll. Opening/quality blockers are surfaced before completion. Completion requires evidence and acknowledgement.

### Admin Claim/Resolution risk controls

High-risk actions are separated, reasons are captured, confirmations are explicit, Customer withdrawal is distinguished from Claim rejection/Warranty voiding, and Admin recovery is clearly exceptional.

### Production Order creation

The form explains atomic generation, summarizes product/date/Lots/roll count, enforces limits, and requires confirmation before an immutable creation step.

### Roll Transfer send/receive

The flows provide scan plus manual fallback, recipient verification, explicit review, partial receipt semantics, idempotent retry messaging, and receipt-selection session recovery.

### Public Warranty status model

Active, expired, not activated, unavailable and void/no-current-warranty states have distinct customer-friendly messages. The public detail avoids exposing customer PII and routes active/expired warranties to Claim follow-up appropriately.

### Shared accessibility and error foundations

The shared system provides visible `:focus-visible`, 44 px controls, labeled forms, semantic record lists, live feedback roles, safe loading/error states, and a native/shared confirmation dialog pattern.

### PWA lifecycle

The update experience explains that an update is available, supports “now/later”, coordinates tabs and avoids uncontrolled reload behavior.

### Print/QR origin safety

Roll print-pack generation uses `getPublicSiteOrigin()` and refuses to generate public QR content when `NEXT_PUBLIC_SITE_URL` is absent/invalid, rather than silently encoding the current preview host.

---

## Recommended remediation sequence

Do not open one giant “UI redesign” branch. Use small cubes in risk order.

1. **UX-01A — Claim notification handoff closure**  
   Fix action paths + notification taxonomy + regression contracts. No visual redesign.

2. **UX-01B — Customer phone identity contract**  
   Define canonical phone model, compatibility/migration strategy and UI guidance before implementation. This is a data-contract cube with UX impact.

3. **UX-02 — Navigation and workflow continuation**  
   Admin IA for warranty/claims/issues and Claim → Resolution continuation; keep mobile density controlled.

4. **UX-03 — Date/time presentation contract extension**  
   Bring Claims/Roll Opening/public warranty date semantics under explicit shared contracts.

5. **UX-04 — Recovery and accessibility hardening**  
   Public warranty not-found/QR-loss recovery, login recovery guidance, transfer-dialog focus behavior, mobile nav readability.

6. **UX-05 — Content and public professionalism**  
   Terminology dictionary, remove implementation language, refresh homepage/login copy, improve Center directory next actions.

7. **UX Final Rendered Acceptance**  
   Fresh role-by-role browser acceptance at minimum 320 px, 390 px and 1440 px, plus keyboard focus/dialog checks and the cross-role Customer → Admin → Center → Admin → Center/Customer Claim journey.

## Closure rule for UX-00

UX-00 can be considered source-audit complete when this evidence document is reviewed and the two P1 items are accepted as the first remediation priorities. Product UX is **not** production-ready until the remediation cubes and final rendered acceptance are completed.
