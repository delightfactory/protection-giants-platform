# Protection Giants — Independent Full Platform Audit

## 1. Executive summary

This report is an independent product, code, data-contract, security-UX, accessibility, international-readiness, and launch-readiness audit of Protection Giants at the exact requested baseline. It treats the repository as a production platform, not a demo, and follows the system from public discovery through product, production, physical identity, custody, transfer, opening, pre-install quality, warranty, claim, inspection, decision, resolution, material allocation, completion, and customer-visible history.

The platform has evidence-backed strengths in database-owned state transitions, idempotency, immutable custody and warranty/claim history, narrow public projections, active-role/entity authorization, retry messaging, QR identity separation, and PWA multi-tab resilience. Those controls should be preserved.

No P0 defect was found. The audit records **16 deduplicated findings: 0 P0, 9 P1, 6 P2, and 1 P3**. The principal launch concerns are: unregistered abandoned operational evidence objects; lack of visual evidence review before irreversible submissions; an administrator-owned credential lifecycle without forced user takeover or an immutable application audit trail; inconsistent Cairo/browser/UTC time presentation; a phone capture contract that permits format mismatch and presents an Egypt-specific claim prompt; action-required notifications without action destinations; keyboard-incomplete custom modal dialogs; three high-severity production dependency advisories with a non-major fix available; and the explicitly outstanding physical printer/material acceptance.

All code gates that could safely run on this host passed. Local database migration/RLS/RPC gates could not run because Docker Desktop's Linux engine was unavailable. Browser, authenticated multi-role, assistive-technology, real camera, push-device, low-network, and physical print acceptance were not claimed from static inspection.

## 2. Exact reviewed baseline

| Item | Reviewed value |
| --- | --- |
| Repository | `delightfactory/protection-giants-platform` |
| Commit | `829e716fc9d1c94177d85096fad326e519aba694` |
| Audit branch | `agent/codex-independent-platform-audit` |
| Worktree | Dedicated isolated worktree; the user's pre-existing dirty checkout was not used or modified |
| Product-code changes | None |
| Report | `docs/codex-independent-platform-audit.md` only |
| Independence | No prior UX/Audit report was opened, searched within, quoted, or used before finalization |

Environment note: the repository declares Node `>=22` and `.nvmrc` selects Node 22; this host ran Node `v24.16.0` and npm `11.13.0`. CI remains the authoritative Node 22 execution environment.

## 3. Audit methodology

The review used the model `Role → Journey → Screen → State → User Task → Decision → Feedback → Next Action` and combined:

1. A tracked-file and App Router inventory, including pages, layouts, route handlers, loading/error/not-found boundaries, print endpoints, API endpoints, shared navigation, dialogs, scanners, forms, uploads, notification/PWA surfaces, and CSS modules.
2. Static tracing from UI entry points through Server Actions, server libraries, generated Supabase types, SQL migrations, RLS/RPC contracts, event projectors, and state guards.
3. End-to-end state tracing across Product → Production → Roll/Print → Custody/Transfer → Opening → Pre-install Issue → Warranty → Claim → Review/Inspection/Decision → Resolution/Material → Completion → Customer history.
4. Explicit review of irreversible actions, retry/request identifiers, stale/race behavior, evidence privacy and cleanup, role/entity suspension, public anti-enumeration, international assumptions, RTL/LTR, mobile CSS, custom dialogs, push/PWA, QR, and physical printing.
5. Quality-gate execution without product-code changes.

### Executed gates

| Gate | Result |
| --- | --- |
| `npm ci` | Passed; also reported three high-severity advisories |
| `npm run typecheck` | Passed |
| `npx vitest run --config vitest.config.mjs` | Passed: 7 files, 41 tests |
| `npm run build` | Passed; Next.js compiled and generated the expected route manifest |
| PR static contracts | Passed: role reachability, timestamp presentation, contextual Roll QR, pre-install flow, Warranty Center/Admin UI, claim client, Notification Inbox/Push/PWA/device, Transfer Send/Receipt, and outer-label plan/request/layout/vector renderer |
| Cube O unit contracts | Passed: Warranty QR, print-plan, and PDF tests (included in Vitest run) |
| `npm audit --omit=dev --json` | Completed; 3 high, 0 critical (see CX-AUD-008) |
| `git diff --check` | Passed |
| Local Supabase start/reset/lint/RLS/RPC suite | Not run: Docker Linux engine unavailable; `supabase status` could not inspect its container |
| Independent QR decode using CI's `zbarimg` | Not run: `zbarimg` unavailable; vector/dimension/quiet-zone contracts passed |
| Lint | No lint script or configured lint gate exists in `package.json` |

Static contracts are useful regression evidence, but source-string assertions are not a substitute for browser or database execution. Findings explicitly distinguish observed code from runtime or physical validation.

## 4. Sources of truth

The following approved/current repository sources were consulted. No other auditor's report was used.

| Source | Purpose in this audit |
| --- | --- |
| `README.md`, `CONTRIBUTING.md`, `package.json`, `.nvmrc`, `.github/workflows/*.yml` | Repository scope, supported toolchain, and actual gates |
| `docs/canonical-project-context.md`, `docs/scope-guardrails.md`, `docs/repository-reference-policy.md`, `docs/development-governance.md` | Current-repository and source-precedence rules |
| `docs/product-decisions.md`, `docs/claims-product-decisions-amendment.md` | Binding cross-domain product decisions |
| `docs/products-data-model.md`, `docs/production-foundation.md`, `docs/data-foundation.md` | Product/publication, production, data, and historical snapshot contracts |
| `docs/identity-foundation.md`, `docs/operational-access.md`, `docs/users-admin.md` | Role/binding/account lifecycle and authorization contracts |
| `docs/distribution-network-flow-spec.md`, `docs/cube-f-roll-transfer-state-reservation-spec.md`, `docs/cube-g-transfer-send-ux-spec.md`, `docs/cube-h-transfer-receipt-resolution-spec.md` | Custody and Transfer truth/recovery |
| `docs/cube-j-roll-opening-claiming-spec.md`, `docs/cube-k-pre-install-roll-issue-spec.md` | Opening and pre-install quality |
| `docs/cube-m-warranty-activation-spec.md`, `docs/cube-n-public-warranty-access-verification-spec.md` | Warranty activation, public privacy, and lifecycle states |
| `docs/cube-p-customer-warranty-claim-intake-spec.md`, `docs/claims-pqr-master-architecture.md`, `docs/cube-q-pd078-pending-inspection-reopen-clarification.md`, `docs/cube-r-claim-resolution-replacement-reinstall-spec.md` | Claim through completion state machine |
| `docs/cube-l-notification-pwa-professional-quality-amendment-2026-08-23.md` | Notification and PWA contract |
| `docs/qr-foundation-reliability-contract.md`, `docs/cube-e-outer-roll-label-print-foundation-spec.md`, `docs/cube-o-customer-warranty-qr-roll-print-pack-spec.md`, `docs/cube-e-pending-physical-print-validation.md` | QR, print pack, and physical acceptance |
| `docs/design-system.md`, `docs/mobile-native-interface-standard.md`, `docs/brand-interface-reference.md` | UI, mobile, interaction, touch, and brand standards |
| `app/**`, `components/**`, `lib/**`, `supabase/migrations/**`, `lib/supabase/database.types.ts`, `public/sw.js`, `public/manifest.webmanifest` | Implemented behavior and current database/API contracts |

Where prose and implementation diverged, an approved decision/contract outranked descriptive or stale status prose. Legacy repositories were not used as architecture references.

## 5. Role inventory

| Role | Reviewed tasks and boundaries | Result summary |
| --- | --- | --- |
| Public visitor/customer | Home, products, product detail, Centers, contextual Roll QR, permanent Warranty QR, all public warranty states, phone verification, claim creation/evidence, open/historical claim and service history, invalid/recovery states | Privacy/anti-enumeration are strong. Recovery, international phone/time behavior, evidence preview, and launch copy need closure. |
| Installation Center | Login/onboarding, location, reference products, custody, opening, quality issue, Transfers, Warranty activation/history, claim inspection, resolution fulfillment/material dependency/completion, notifications | State authorization and task scoping are strong. Evidence staging/preview, dialog focus, notification routing, and mobile navigation need closure. |
| Dealer | Login, home, Centers, products, custody, Transfers, notifications, scoped account lifecycle | Scope predicates are present. Credential ownership/audit and discoverability need closure. |
| Country Agent | Login, home, Dealers, Centers, custody, Transfers, notifications, permitted opened-Roll recovery, Center approval/location oversight | Hierarchy and exceptional permissions are bounded. Shared account/navigation findings apply. |
| Admin/Company operations | Accounts/roles/bindings; Agents/Dealers/Centers; approval/location; products/publication/assets; production/Lots/Rolls/print; custody/Transfers/recovery; pre-install quality; warranties/support; Claims/review/inspection/decision; Resolution/replacement/reassignment/recovery/completion; notifications | Broad surface is implemented with strong state contracts. Credential/audit, terminology, notification handoffs, and acceptance gates remain. |

## 6. Route coverage matrix

Every user-facing App Router surface at the reviewed baseline is classified below. API-only routes are included separately because they affect user-facing Push and print flows.

| Route | Role(s) | Primary task/state reviewed |
| --- | --- | --- |
| `/` | Public | Brand entry, discovery, launch copy |
| `/products` | Public | Active+published catalogue, empty and asset states |
| `/products/[slug]` | Public | Product content, public assets, unknown slug |
| `/centers` | Public | Registered/approved directory, search, load error |
| `/warranty` | Public | Secure-entry explanation and QR-only access |
| `/w/[publicCode]` | Public/customer | Not activated, active, expired, void-derived, unavailable, temporary failure, unknown |
| `/w/[publicCode]/claim` | Customer | Phone verification, current/history, draft evidence, submit/retry |
| `/r/[serial]` | Public/operational camera | Contextual Roll QR redirect, malformed/unknown/void/nonpublic 404 |
| `/login` | All operational roles | Credential entry and error state |
| `/auth/confirm` | Invited Center | Invite exchange and invalid-link redirect |
| `/onboarding/center` | Invited Center | Protected first-user completion and blocked states |
| `/access-denied` | Authenticated blocked user | Explanation and sign-out recovery |
| `/operations` | All active operational roles | Role-specific module hub and cross-module discoverability |
| `/operations/notifications` | All active operational roles | Inbox, unread/read, action, Push/device/PWA settings |
| `/operations/location` | Center | Own current location capture/update |
| `/operations/agents` | Admin | Country Agent lifecycle list |
| `/operations/agents/new` | Admin | Agent creation |
| `/operations/agents/[id]/edit` | Admin | Agent edit and exceptional recovery permission |
| `/operations/dealers` | Admin/Agent | Scoped Dealer lifecycle list |
| `/operations/dealers/new` | Admin/Agent | Scoped Dealer creation |
| `/operations/dealers/[id]/edit` | Admin/Agent | Dealer edit, account create/reset/status |
| `/operations/centers` | Admin/Agent/Dealer | Hierarchy-scoped Center list/status |
| `/operations/centers/new` | Admin/Agent/Dealer | Center creation |
| `/operations/centers/[id]/edit` | Admin/Agent/Dealer | Center data and invitation lifecycle/recovery |
| `/operations/centers/[id]/approval` | Admin/Agent | Network approval/revocation and prerequisites |
| `/operations/centers/[id]/location` | Admin/Agent/Dealer | Location correction and immutable event history |
| `/operations/users` | Admin | Global user search/filter/status |
| `/operations/users/new` | Admin | Trusted role/account provisioning |
| `/operations/users/[id]/edit` | Admin | Profile, role/binding, email, password, status |
| `/operations/products` | All roles; mutations Admin | Reference catalogue and lifecycle/publication visibility |
| `/operations/products/new` | Admin | Product creation |
| `/operations/products/[id]/edit` | Admin | Product/publication/policy/assets/delete |
| `/operations/production-orders` | Admin | Order queue/filter/history |
| `/operations/production-orders/new` | Admin | Irreversible identity generation review/confirm |
| `/operations/production-orders/[id]` | Admin | Order/Lot/Roll facts, eligibility, void audit |
| `/operations/production-orders/[id]/outer-roll-labels` | Admin | Label selection, preflight, chunks, duplicate/reprint intent |
| `/print/production-orders/[id]` | Admin | Browser print pack summary/table and print CSS |
| `/print/production-orders/[id]/outer-roll-labels` | Admin | Bounded PDF generation/download and preflight errors |
| `/operations/rolls` | Role-scoped | Custody/search/status and Admin audit scope |
| `/operations/rolls/open` | Center | Scan/manual resolve, custody/state recheck, irreversible opening |
| `/operations/rolls/recovery` | Admin/permitted Agent | Opened-Roll recovery without rewriting custody truth |
| `/operations/rolls/issues` | Center/Admin | Quality issue queue and states |
| `/operations/rolls/issues/new` | Center | Scan/manual report, previews, submit/hold |
| `/operations/rolls/issues/[id]` | Owner Center/Admin | Private evidence and final quality decision/correction |
| `/operations/transfers` | All operational parties | Incoming/outgoing hub, search, empty/pagination |
| `/operations/transfers/new` | All eligible parties | Recipient/roll selection, scan, lot expansion, review/send |
| `/operations/transfers/[transferId]` | Participants/Admin | Timeline, cancel/reject, unresolved recovery |
| `/operations/transfers/[transferId]/receive` | Recipient | Expected scans, partial receipt, review/confirm/retry |
| `/operations/warranties` | Center/Admin | Role-bounded history/search |
| `/operations/warranties/activate` | Center | Scan/manual resolve, details, review, atomic activation |
| `/operations/warranties/[id]` | Center/Admin | Issuance facts; Admin correction/void/audit |
| `/operations/claims` | Admin | Claim queue/filter/pagination |
| `/operations/claims/[id]` | Admin | Full Claim/evidence/timeline/Resolution context |
| `/operations/claims/[id]/review` | Admin | Start review/request/reassign/cancel inspection |
| `/operations/claims/[id]/decision` | Admin | Accept/reject/cancel and bounded correction |
| `/operations/claim-inspections` | Center | Exact assigned pending tasks |
| `/operations/claim-inspections/[id]` | Assigned Center | Evidence context and irreversible inspection submit |
| `/operations/claim-resolutions` | Admin | Authorized/assigned/completed Resolution queue |
| `/operations/claim-resolutions/[id]` | Admin | Assign/reassign/remedy/material/withdrawal/recovery/completion history |
| `/operations/claim-resolution-tasks` | Center | Exact assigned fulfillment tasks |
| `/operations/claim-resolution-tasks/[id]` | Performing Center | Context/evidence, replacement dependency, completion |

### API/route-handler surfaces

| Route | Consumer | Boundary reviewed |
| --- | --- | --- |
| `/api/notifications/push-subscription` | Authenticated operational browser | Request shape, same-origin protections, authenticated register/state/disable RPCs |
| `/api/internal/push-worker` | Scheduled internal worker | Bearer secret validation, timing-safe comparison, no-store errors |

Route-specific boundaries present: operations has `loading.tsx`, `error.tsx`, and `not-found.tsx`; public Centers has `error.tsx`; public Warranty code has `not-found.tsx`. The public root/products surfaces do not have their own branded error or root not-found boundary; this is included in CX-AUD-010 rather than duplicated.

## 7. State coverage matrix

| State family | Reviewed examples | Assessment |
| --- | --- | --- |
| Empty | Products, Centers, entity lists, production, custody, Transfers, Warranties, Claims, inspections, Resolutions, notifications | Reusable empty-state language is generally actionable; public recovery is the main exception. |
| Loading/pending | Operations route loading, form pending flags, upload states, Transfer/scan fetch states, Push repair, PWA update | Strong disable/live feedback in critical flows; no authenticated runtime timing was available. |
| Success | Creation redirects, banners, Transfer receipts, Warranty activation review/result, Claim and Resolution mutation feedback | Success generally identifies the new state and refreshes authoritative server data. |
| Error | Form validation, RPC code mapping, ambiguous uploads, Push/PWA, page errors, print preflight | Domain-specific errors are strong; public root recovery and backend vocabulary are inconsistent. |
| Blocked | Inactive profile/entity, access denied, custody/eligibility, pending quality, material allocation, unavailable Warranty states | Usually explains why and the valid next step; strong pattern to preserve. |
| Pending business state | Transfer pending, inspection requested, Resolution authorized/assigned, quality submitted, Claim open | Database state and role queue projections are explicit; some handoff notifications have no destination. |
| Stale/race | Request IDs, same-key/different-payload conflicts, post-upload reauthorization, router refresh on state races | Strong implementation; DB execution was not repeated locally. |
| Retry/ambiguous network | Transfer, evidence, claim, inspection, completion, Push subscription | Same request ID is retained where required; abandoned operational evidence is not registered for cleanup. |
| Suspended/deactivated | Profile, bound entity, recipient/owner, performing Center, Admin recovery | Layout and mutation guards revalidate; role/entity transitions remain credential/audit-sensitive. |
| Invalid/not-found | Warranty code, contextual Roll QR, dynamic operational records, auth invite | Anti-enumeration is strong; public recovery/brand guidance is incomplete. |
| Historical/terminal | Voided production, custody history, Warranty correction/void, rejected/cancelled Claim, completed/withdrawn Resolution | Immutable history and bounded corrections are a major strength. |

## 8. Component/shared-surface coverage

| Shared surface | Reviewed components | Repeated impact |
| --- | --- | --- |
| Shell/navigation | `SiteHeader`, `SiteFooter`, `OperationsNav`, `OperationsNavLinks`, role dashboard, notification shell | Role visibility, touch targets, safe areas, discoverability, task-route behavior |
| Form primitives | `FormField`, feedback/status/empty banners, record lists, pagination, native `ConfirmSubmitButton` | Labels, LTR inputs, errors, confirmation, mobile stacking |
| Custom overlays | QR scanner sheet; Transfer send/receipt/detail/recovery sheets | Scroll lock/Escape are present; focus lifecycle is not |
| Scanner/manual fallback | Roll opening, pre-install report, Warranty activation, Transfer send/receipt | Camera fallback and serial normalization are present; device runtime remains unvalidated |
| Evidence | Customer Claim, Center inspection, Center completion, Admin recovery, pre-install issue, evidence readers | Strong MIME/size/privacy checks; inconsistent preview and cleanup registration |
| Status/timeline | badges, Claim/Resolution timelines, Warranty audit, custody/Transfer history, `LocalDateTime` | Strong non-color labels/history; inconsistent time-zone contract and internal terminology |
| Notifications/PWA | Inbox, badge sync, Push device settings, lifecycle coordinator, service worker | Strong safety/recovery; incomplete source labels/action paths |
| Print/labels | selection preview, plan/source/layout/PDF/QR/barcode generators, print CSS | Deterministic software preflight; physical acceptance outstanding |
| Responsive CSS | global/operations/public/module CSS at 340/360/390/520/560/600/700/900 breakpoints | Good `dvh`, safe-area, 44/48 px controls, wrapping and mobile stacking; runtime visual acceptance not available |

## 9. Findings by severity

### Severity roll-up

| Severity | Count | IDs |
| --- | ---: | --- |
| P0 — Critical | 0 | — |
| P1 — High | 9 | CX-AUD-001 through CX-AUD-009 |
| P2 — Medium | 6 | CX-AUD-010 through CX-AUD-015 |
| P3 — Polish | 1 | CX-AUD-016 |

### CX-AUD-001 — Abandoned operational evidence can remain unregistered in private Storage

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-001 |
| 2. Severity | P1 — High |
| 3. Classification | High-confidence Risk |
| 4. Role(s) | Installation Center; Admin recovery operator |
| 5. Journey | Claim inspection evidence; Resolution completion evidence; exceptional Admin completion evidence |
| 6. Route | `/operations/claim-inspections/[id]`; `/operations/claim-resolution-tasks/[id]`; `/operations/claim-resolutions/[id]` |
| 7. File/component | `app/operations/claim-inspections/actions.ts`; `app/operations/claim-resolutions/actions.ts`; `app/operations/claim-resolutions/recovery-actions.ts`; the three matching client forms |
| 8. Exact evidence | Inspection uploads write directly to `inspections/{inspectionId}/{slot}-{digest}` and return the path (`claim-inspections/actions.ts:155-188`); removal is invoked only with a path retained by the current client (`:208-223`). Completion does the same under `resolutions/{resolutionId}/completion` (`claim-resolutions/actions.ts:163-196`, `:216-230`), and Admin recovery shares that namespace (`recovery-actions.ts:185-218`). Unlike public Claim draft evidence, none of these operational uploads creates a durable staged-object registry or bounded expiry cleanup candidate. Client state starts as an empty in-memory array (`center-claim-inspection-form.tsx:72`; `center-claim-resolution-completion-form.tsx:85`); closing/reloading the page loses the only remove handle. |
| 9. Relevant state | Image successfully uploaded; inspection/resolution still pending/assigned; user closes, navigates away, loses the tab, or never submits |
| 10. Why it matters | A private customer/vehicle evidence object can persist without immutable evidence metadata, workflow visibility, or a deterministic cleanup job. |
| 11. User/operational impact | Privacy-retention ambiguity, storage growth, support inability to enumerate the evidence from business records, and possible namespace collisions with later attempts. |
| 12. Security/business-contract constraint | Evidence is private and should be retained only as durable workflow truth or a bounded, recoverable draft. Cleanup must never delete committed evidence or trust a stale browser. |
| 13. Recommended design/product direction | Reuse a small server-only staged-evidence registry/lease pattern per inspection/resolution, with submit consumption, explicit removal, bounded expiry claim, and post-Storage-delete finalization. Keep current hash/path/reauthorization controls. |
| 14. Evidence type | Static code; security/data lifecycle inference. The public Claim registry in `20260825232000_cube_p_claim_evidence_staging_registry.sql:389-480` is a positive in-repository reference, not proof of runtime leakage. |
| 15. Confidence | High. The upload and client lifecycle are explicit; actual orphan count requires Storage inspection. |

### CX-AUD-002 — Critical evidence submissions show filenames, not image previews

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-002 |
| 2. Severity | P1 — High |
| 3. Classification | UX/Product Gap |
| 4. Role(s) | Customer; Installation Center; Admin recovery operator |
| 5. Journey | Customer Claim creation; formal inspection; physical remedy completion; exceptional completion |
| 6. Route | `/w/[publicCode]/claim`; `/operations/claim-inspections/[id]`; `/operations/claim-resolution-tasks/[id]`; `/operations/claim-resolutions/[id]` |
| 7. File/component | `claim-client.tsx`; `center-claim-inspection-form.tsx`; `center-claim-resolution-completion-form.tsx`; `admin-claim-resolution-actions.tsx` |
| 8. Exact evidence | Customer upload state stores only `fileName/status/evidence` (`claim-client.tsx:25-31`) and renders only filename/status/remove (`:431-447`). Inspection does the same (`center-claim-inspection-form.tsx:18-24`, `:312-334`). Completion uses the same filename-only model (`center-claim-resolution-completion-form.tsx:18-25`) and list; Admin recovery repeats it. No object URL, `<img>`, signed preview, or final evidence gallery is presented before these irreversible submissions. By contrast, pre-install issue correctly creates local image previews and tells the user to review them (`roll-preinstall-issue-flow.tsx:304-319`). |
| 9. Relevant state | One or more images selected/uploaded and the user is about to submit a Claim, inspection, or completion record |
| 10. Why it matters | A filename cannot show that the photo is the intended vehicle/area, correctly oriented, readable, non-duplicated, or safe to disclose. |
| 11. User/operational impact | Wrong evidence can drive a rejection, incorrect remedy, false completion record, customer rework, privacy exposure, or support dispute. |
| 12. Security/business-contract constraint | Evidence becomes immutable workflow truth after submit; preview must not weaken the private bucket or signed-URL boundary. |
| 13. Recommended design/product direction | Add bounded local previews before upload where possible and short-lived authorized previews after upload; show slot, duplicate warning, replace/remove, upload state, and a final review summary. Reuse the pre-install preview pattern without exposing public URLs. |
| 14. Evidence type | Static code; UX/error-prevention analysis |
| 15. Confidence | High |

### CX-AUD-003 — Privileged account lifecycle leaves permanent credentials administrator-owned and changes unaudited in application truth

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-003 |
| 2. Severity | P1 — High |
| 3. Classification | High-confidence Risk |
| 4. Role(s) | Admin; Agent managing Dealer users; every provisioned operational user |
| 5. Journey | Account creation, first login, password reset, email change, role/entity rebinding, suspend/reactivate |
| 6. Route | `/operations/users/new`; `/operations/users/[id]/edit`; `/operations/dealers/[id]/edit`; `/login` |
| 7. File/component | `app/operations/users/new/actions.ts`; `app/operations/users/[id]/edit/actions.ts`; `app/operations/users/actions.ts`; Dealer account actions/pages |
| 8. Exact evidence | Admin creates an already-confirmed Auth user with a password entered by the Admin (`users/new/actions.ts:116-119`). Admin password reset directly replaces the secret (`users/[id]/edit/actions.ts:151-173`); email is changed and immediately confirmed (`:119-148`). Profile/role/entity changes directly update `profiles` (`:81-116`), while status coordinates Auth ban and Profile state (`users/actions.ts:17-72`). These action bodies write no immutable actor/before/after application event. The edit UI uses ordinary submit buttons for profile, email, and password changes (`users/[id]/edit/page.tsx:95-173`), not a review of the target identity and effect. No first-login rotation/recovery flag is set in the creation path. |
| 9. Relevant state | New trusted user; forgotten/compromised password; email, role, binding, or access change |
| 10. Why it matters | An administrator can know and later replace another user's live password, and the business audit trail cannot independently answer who changed credentials/role/binding, from what, to what, and why. Auth-provider logs alone are not the platform's immutable operating record. |
| 11. User/operational impact | Impersonation/repudiation risk, weak offboarding/incident investigation, accidental cross-entity authority, and manual secret distribution at international scale. |
| 12. Security/business-contract constraint | Server-only Admin credentials and self-demotion/self-suspension guards must remain. Any new flow must preserve exact role/entity binding and active-entity enforcement. |
| 13. Recommended design/product direction | Decide and implement a bounded credential-ownership cube: invite or one-time setup/reset link, mandatory first-user takeover/rotation, targeted re-auth/confirmation for sensitive changes, and immutable application events for role/binding/email/status/reset initiator (never password material). Preserve compensating cleanup and ban/profile coordination. |
| 14. Evidence type | Static code; security/operational risk; product decision required for the ownership model |
| 15. Confidence | High for the implemented lifecycle; exploit/abuse was not attempted. |

### CX-AUD-004 — Event times use conflicting Cairo, browser-local, and UTC presentation contracts

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-004 |
| 2. Severity | P1 — High |
| 3. Classification | High-confidence Risk |
| 4. Role(s) | Customer; Center; Admin; Agent/Dealer audit readers |
| 5. Journey | Claim/service history, inspection assignment, Resolution assignment, production/print history, notification and general timelines |
| 6. Route | Public Warranty/Claim and multiple `/operations/**`/`/print/**` records |
| 7. File/component | `components/ui/local-date-time.tsx`; Claim client; inspection/task pages; production order/print pages |
| 8. Exact evidence | Shared `LocalDateTime` formats in the browser's current timezone with no explicit zone (`local-date-time.tsx:10-18`). Public Claim history is forced to `Africa/Cairo` (`claim-client.tsx:40-45`), as are inspection assignment (`claim-inspections/[id]/page.tsx:83`), Resolution assignment (`claim-resolution-tasks/[id]/page.tsx:97`), production detail (`production-orders/[id]/page.tsx:26-29`), and print (`print/production-orders/[id]/page.tsx:17-21`). Warranty date-only facts use UTC (`w/[publicCode]/page.tsx:28-36`). New production's default calendar day is Cairo-derived (`production-orders/new/page.tsx:24-29`). No product/org/user timezone contract identifies which behavior is authoritative. |
| 9. Relevant state | Cross-country users inspect the same timestamp; event is near midnight/DST boundary; printed and on-screen records are compared |
| 10. Why it matters | The same event can display as different local times/days, while a production date can default to Cairo's day for a non-Cairo operator. Audit and SLA interpretation becomes ambiguous. |
| 11. User/operational impact | Incorrect sequence assumptions, disputed deadlines, wrong production date entry, support confusion, and unreliable international handoffs. |
| 12. Security/business-contract constraint | Stored `timestamptz` truth must remain UTC/absolute; date-only business fields must not be silently converted as instants. |
| 13. Recommended design/product direction | Approve one compact time contract: explicit organization/business timezone for date-only defaults and prints, viewer-local or explicitly labeled organization time for instants, shared formatter, and visible zone where audit significance exists. Add midnight/DST tests. |
| 14. Evidence type | Static code; international/data-presentation risk |
| 15. Confidence | High that presentations conflict; the intended business timezone is not documented. |

### CX-AUD-005 — Warranty phone capture can create format-equivalent but verification-incompatible values, while Claim UX assumes Egypt

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-005 |
| 2. Severity | P1 — High |
| 3. Classification | High-confidence Risk |
| 4. Role(s) | Installation Center; Customer; Admin support |
| 5. Journey | Warranty activation → later customer phone verification → Claim creation |
| 6. Route | `/operations/warranties/activate`; `/w/[publicCode]/claim`; Warranty admin correction |
| 7. File/component | `warranty-activation-flow.tsx`; Warranty activation/support SQL; `claim-client.tsx`; Claim normalization SQL |
| 8. Exact evidence | Activation validates only trimmed length 5–32 (`warranty-activation-flow.tsx:84-90`) and sends the raw entered phone (`:282`); its input has no country/canonical-format guidance (`:471`). SQL stores `btrim` only (`20260825013000_cube_m_warranty_activation_engine.sql:289-295`, `:525-551`). Claim verification intentionally converts Arabic/Persian digits and removes spaces/parentheses/hyphens but **does not guess/rewrite country codes** (`20260825231000_cube_p_claim_intake_engine.sql:5-30`), then requires equality to the normalized stored phone (`:72-96`). The customer placeholder is Egypt-specific `01xxxxxxxxx` (`claim-client.tsx:309-318`). Therefore `01…`, `+20…`, and `0020…` are distinct even when they represent the same number. |
| 9. Relevant state | Center records local format; customer later uses E.164/international prefix, or vice versa; Arabic/Persian digits and punctuation vary |
| 10. Why it matters | The security comparison correctly avoids unsafe guessing, but capture provides no contract that makes later exact normalized comparison predictable. |
| 11. User/operational impact | Legitimate customers can be locked out of Claim creation and require Admin correction; Egypt-specific guidance misleads other markets. |
| 12. Security/business-contract constraint | Do not introduce country-code guessing or a public enumerable lookup. Phone remains a Warranty-scoped verification factor with freshness checks and throttling. |
| 13. Recommended design/product direction | Capture explicit country context and a canonical international representation at activation/correction; display a normalization preview; accept `+`/`00`/Arabic digits safely; use country-neutral customer guidance. Migrate/repair existing values explicitly rather than guessing. |
| 14. Evidence type | Static code; SQL contract; international/security UX risk |
| 15. Confidence | High |

### CX-AUD-006 — Some action-required Claim/Resolution notifications have no action destination

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-006 |
| 2. Severity | P1 — High |
| 3. Classification | Confirmed Defect |
| 4. Role(s) | Admin; performing Installation Center |
| 5. Journey | Customer submits Claim → Admin review; Admin assigns/reassigns physical fulfillment → Center task |
| 6. Route | `/operations/notifications`; expected targets `/operations/claims`/detail and `/operations/claim-resolution-tasks`/detail |
| 7. File/component | Claim and Resolution notification materialization SQL; Notification Inbox page/action |
| 8. Exact evidence | Claim submission inserts `attention_level='action_required'` but `action_path=null` (`20260826122000_cube_q_claim_cube_l_notification_materialization.sql:64-86`). Initial Resolution assignment does the same (`20260826161000_cube_r_initial_resolution_assignment.sql:58-88`), and the latest replacement projector preserves null for assignment/reassignment (`20260827092000_cube_r_completion_notification_materialization.sql:183-205`). The Inbox renders its open-action button only when `notification.action_path` exists (`notifications/page.tsx:143-155`). Exact Admin Claim and Center Resolution task routes already exist. The approved Inbox UX calls for one obvious primary deep link/action where applicable (`docs/cube-l-notification-pwa-professional-quality-amendment-2026-08-23.md:94-109`). |
| 9. Relevant state | New action-required Inbox row, especially on mobile Push entry or busy multi-role Admin queue |
| 10. Why it matters | The system says an action is required but offers no next action, breaking the handoff model at the point responsibility changes. |
| 11. User/operational impact | Slower response, missed Claims/tasks, manual rediscovery through the home hub/queues, and higher error risk under volume. |
| 12. Security/business-contract constraint | Action paths must remain same-origin, allowlisted/safe, and authorization must be rechecked at destination; stale historical rows should fail safely after reassignment. |
| 13. Recommended design/product direction | Materialize the narrow queue or exact-detail action path for these event types, using queue fallback where later reassignment makes an old detail unsafe. Add event-type/action-path contract tests and stale-recipient behavior. |
| 14. Evidence type | Static SQL/UI code; confirmed deterministic rendering behavior |
| 15. Confidence | High |

### CX-AUD-007 — Custom modal sheets do not implement focus entry, trap, or restoration

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-007 |
| 2. Severity | P1 — High |
| 3. Classification | Confirmed Defect |
| 4. Role(s) | Center, Dealer, Agent, Admin Transfer users |
| 5. Journey | QR scanning; Transfer selection reset/recipient change; receipt confirmation; cancel/reject; unresolved recovery |
| 6. Route | `/operations/transfers/new`; `/operations/transfers/[transferId]`; `/operations/transfers/[transferId]/receive`; Roll/Warranty scanner consumers |
| 7. File/component | `qr-scanner-sheet.tsx`; `transfer-send-flow.tsx`; `transfer-receipt-flow.tsx`; `transfer-detail-actions.tsx`; `unresolved-resolution-panel.tsx` |
| 8. Exact evidence | Each overlay uses `role="dialog" aria-modal="true"` (`qr-scanner-sheet.tsx:216`; `transfer-send-flow.tsx:853,875,892`; `transfer-receipt-flow.tsx:529,547`; `transfer-detail-actions.tsx:107`; `unresolved-resolution-panel.tsx:238`). Their effects lock body scroll and often handle Escape (`qr-scanner-sheet.tsx:81-169`; send `:175-193`; receipt `:122-136`; detail `:51-63`; unresolved `:58-70`) but contain no initial `.focus()`, Tab/Shift+Tab containment, inert background, previous-active-element capture, or focus restore. |
| 9. Relevant state | Dialog opens while using keyboard/screen reader; user tabs, cancels, confirms, or closes with Escape |
| 10. Why it matters | `aria-modal` announces a modal contract that behavior does not enforce. Focus can remain behind or escape into the underlying irreversible workflow. |
| 11. User/operational impact | Keyboard/screen-reader users may not discover the dialog, can activate background controls, or lose their place after closing. |
| 12. Security/business-contract constraint | Do not weaken existing Escape/busy guards or allow double submission; confirmation content and live scanner state must remain accessible. |
| 13. Recommended design/product direction | Replace repeated custom focus logic with one small accessible Dialog/Sheet primitive (or native `<dialog>` where appropriate): focus entry, containment, restore, labelled description, inert background, Escape policy, and tests. The native `ConfirmSubmitButton` is a useful preserved pattern. |
| 14. Evidence type | Static code; WCAG/ARIA interaction analysis |
| 15. Confidence | High |

### CX-AUD-008 — Production dependency tree contains three high-severity advisories with a non-major fix available

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-008 |
| 2. Severity | P1 — High |
| 3. Classification | Technical Acceptance Blocker |
| 4. Role(s) | All users; deployment/operations |
| 5. Journey | Build/runtime dependency supply chain and any server-side CSS/image processing path |
| 6. Route | Platform-wide |
| 7. File/component | `package.json`; `package-lock.json`; installed production dependency graph |
| 8. Exact evidence | `npm audit --omit=dev --json` reported 3 high/0 critical: direct `next@16.2.11`, transitive `postcss@8.4.31` (path traversal/information disclosure advisories including GHSA-6g55-p6wh-862q and GHSA-r28c-9q8g-f849), and transitive `sharp@0.34.5` (libvips inherited vulnerabilities, GHSA-f88m-g3jw-g9cj). npm reports `next@16.3.3` as a non-semver-major fix. No `next/image` use was found, which reduces known `sharp` reachability but does not clear the production tree. |
| 9. Relevant state | CI build, deployed Next server, future image/CSS processing, compromised/malicious inputs depending on advisory preconditions |
| 10. Why it matters | Production release would knowingly carry high-severity advisories when a supported patch is available. |
| 11. User/operational impact | Potential server file disclosure or native image-library exposure; release/compliance exception burden. |
| 12. Security/business-contract constraint | Upgrade must preserve Next 16 behavior, generated output, QR/PDF routes, and all existing gates; advisory reachability should be verified rather than assumed. |
| 13. Recommended design/product direction | Patch Next in a dedicated dependency cube, regenerate the lockfile, rerun full Node 22 CI/database/QR/PDF gates, re-run audit, and record advisory reachability/exception only if an item remains. |
| 14. Evidence type | Executed dependency audit; lockfile inspection |
| 15. Confidence | High for dependency status on 2026-08-30; exploitability is route/config dependent. |

### CX-AUD-009 — Physical label/printer/material acceptance remains explicitly outstanding

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-009 |
| 2. Severity | P1 — High |
| 3. Classification | Physical Acceptance Blocker |
| 4. Role(s) | Admin production/print operators; installation chain; customers scanning labels |
| 5. Journey | Production order → Roll Print Pack → physical print/cut/apply → operational/customer scan |
| 6. Route | `/operations/production-orders/[id]/outer-roll-labels`; `/print/production-orders/[id]`; PDF endpoint |
| 7. File/component | Print plan/layout/PDF/QR/barcode code and `docs/cube-e-pending-physical-print-validation.md` |
| 8. Exact evidence | The approved follow-up says physical validation “has not been executed” because suitable equipment was unavailable (`cube-e-pending-physical-print-validation.md:5-8`); mandates label size/margins, scan readability, cut/material/RIP validation (`:9-20`); states `150 × 100 mm` and printer/cutter/RIP values are provisional and software PDF success is not physical acceptance (`:26-30`). Software plan, vector renderer, dimensions, quiet zone, and deterministic PDF contracts passed in this audit. |
| 9. Relevant state | First production-frozen printer/media/RIP/cutter profile and real label application/scanning |
| 10. Why it matters | Correct vectors/PDFs can still clip, bleed, cut poorly, delaminate, or fail scanning on actual stock/devices. |
| 11. User/operational impact | Unscannable or miscut Roll/Warranty identities, reprint/relabel cost, custody/activation delays, and customer trust damage. |
| 12. Security/business-contract constraint | Do not change permanent Roll/Warranty identities during validation; reprints must reproduce the same URLs and historical snapshots. |
| 13. Recommended design/product direction | Execute and sign a physical acceptance protocol on target printer/RIP/cutter/media using representative QR/barcode payload lengths, phone models, lighting, curvature, wear, duplicate/reprint, and actual cut tolerances. Freeze profile only after evidence passes. |
| 14. Evidence type | Approved validation status; passed software tests; physical runtime not executed |
| 15. Confidence | Certain |

### CX-AUD-010 — Invalid/damaged public QR journeys end without an assisted, privacy-safe recovery path

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-010 |
| 2. Severity | P2 — Medium |
| 3. Classification | UX/Product Gap |
| 4. Role(s) | Public visitor; Warranty customer; installation/support staff assisting a customer |
| 5. Journey | Damaged/malformed contextual Roll QR or Warranty QR; unknown/old link; temporary public failure |
| 6. Route | `/r/[serial]`; `/warranty`; `/w/[publicCode]`; unknown public routes/products failures |
| 7. File/component | Public Roll resolver, Warranty entry/not-found, brand config, public error boundaries |
| 8. Exact evidence | `/r/[serial]` returns only English plain text `Not Found` for malformed/unknown/non-resolvable identities (`r/[serial]/route.ts:11-19`, `:24-35`). `/warranty` only instructs the customer to scan the QR (`warranty/page.tsx:13-23`); the Warranty not-found screen repeats that instruction and correctly refuses enumerable lookup but offers no next action (`w/[publicCode]/not-found.tsx:11-21`). Brand contact email/phone are empty (`brand-config.ts:6-9`), and the public footer renders only the brand and a tagline (`components/site-footer.tsx:3-12`). Only public Centers has a route error boundary; no root branded error/not-found boundary exists. |
| 9. Relevant state | QR is damaged, camera decoded the wrong content, document is missing, signed asset/data call fails, or customer needs authenticity help |
| 10. Why it matters | The anti-enumeration decision is correct, but “scan the QR again” is a dead end when the QR itself is the failed artifact. |
| 11. User/operational impact | Abandonment, counterfeit suspicion, support channel hunting, and inability to start a legitimate Claim/access recovery. |
| 12. Security/business-contract constraint | Must not add lookup by Warranty Number, VIN, serial, phone, or other enumerable identifiers; invalid and unknown codes must remain indistinguishable. |
| 13. Recommended design/product direction | Add one branded generic recovery surface: retry/camera guidance, return to products/Centers, and an authenticated/assisted support channel with no existence disclosure. Use the same response for malformed/unknown codes and add public root error/not-found treatment. |
| 14. Evidence type | Static code; approved anti-enumeration contract; UX recovery analysis |
| 15. Confidence | High |

### CX-AUD-011 — Public site exposes development-stage copy and no populated trust contact

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-011 |
| 2. Severity | P2 — Medium |
| 3. Classification | Launch Content/Data Gate |
| 4. Role(s) | Public visitors/customers; prospective Centers/partners |
| 5. Journey | Brand evaluation, product/Warranty trust, support discovery |
| 6. Route | `/` and public shell/recovery surfaces |
| 7. File/component | `app/(public)/page.tsx`; `lib/brand-config.ts`; Site footer/header consumers |
| 8. Exact evidence | Homepage cards say public publishing/activation occurs “عند تفعيل النشر العام” and “عند اكتمال دورة التفعيل” (`app/(public)/page.tsx:4-8`) and the section explains that each public service is enabled only when its implementation is complete (`:26-30`). This is release-process language, not customer value/trust copy. The configured public contact email and phone are empty (`brand-config.ts:6-9`), and the public footer exposes no contact surface (`components/site-footer.tsx:3-12`). No demo data was found in code, but actual hosted content/data was not accessible. |
| 9. Relevant state | Production public launch and any failed/uncertain customer journey |
| 10. Why it matters | The site signals unfinished implementation and gives no first-party contact to resolve trust or service questions. |
| 11. User/operational impact | Lower brand credibility, reduced conversion, support channel ambiguity, and poor international launch readiness. |
| 12. Security/business-contract constraint | Contact/recovery copy must not create public identifier lookup or expose internal operating data. |
| 13. Recommended design/product direction | Run a launch-content acceptance pass: replace development-stage copy with verified value/trust language, populate governed support/contact details, verify legal/Warranty language and hosted Product/Center content per market. Keep data conditions separate from code defects. |
| 14. Evidence type | Static code; launch-content condition; hosted data not validated |
| 15. Confidence | High for repository copy/config |

### CX-AUD-012 — Notification source labels do not cover Warranty, Claim, or Resolution domains

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-012 |
| 2. Severity | P2 — Medium |
| 3. Classification | UX/Product Gap |
| 4. Role(s) | All operational roles, especially Admin and Center |
| 5. Journey | Inbox triage across custody, quality, Warranty, Claim, and fulfillment domains |
| 6. Route | `/operations/notifications` |
| 7. File/component | `app/operations/notifications/page.tsx`; notification event projectors |
| 8. Exact evidence | `sourceLabel` maps Transfer, Center location/approval/onboarding, and pre-install issue only, then falls back to “تنبيه تشغيلي” (`notifications/page.tsx:30-40`). Current migrations materialize `warranty`, `warranty_claim`, and `warranty_claim_resolution` source domains (for example `20260825040000_cube_m_warranty_notification_materialization.sql:56-80`; Claim `20260826122000_cube_q_claim_cube_l_notification_materialization.sql:64-88`; Resolution `20260827092000_cube_r_completion_notification_materialization.sql:183-207`). The approved Inbox standard requires clear source context (`docs/cube-l-notification-pwa-professional-quality-amendment-2026-08-23.md:94-109`). |
| 9. Relevant state | Inbox contains multiple new domains/events, including action-required rows |
| 10. Why it matters | A generic source removes the domain cue needed for fast, accurate operational triage. |
| 11. User/operational impact | Slower scanning, wrong prioritization, and loss of trust in Inbox semantics as domains grow. |
| 12. Security/business-contract constraint | Labels must not reveal private reason/actor/customer data; source domain remains internal-safe metadata. |
| 13. Recommended design/product direction | Centralize typed source-domain/event presentation and add Arabic labels/icons for all current domains with an explicit unknown-domain telemetry/fallback contract. Test every projector domain against UI presentation. |
| 14. Evidence type | Static SQL/UI code |
| 15. Confidence | High |

### CX-AUD-013 — Navigation scales by hiding modules and uses an incomplete task-route heuristic on mobile

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-013 |
| 2. Severity | P2 — Medium |
| 3. Classification | UX/Product Gap |
| 4. Role(s) | All operational roles; strongest impact on Admin and Center mobile users |
| 5. Journey | Discover modules; move between queue/detail/task; complete long mobile workflows |
| 6. Route | Operations shell across `/operations/**` |
| 7. File/component | `components/operations-nav-links.tsx`; role dashboard; operations mobile CSS |
| 8. Exact evidence | Admin mobile navigation contains only home/users/dealers/Centers/products (`operations-nav-links.tsx:16-22`); desktop adds Agents/production/custody/Transfers but still relies on the home hub for Warranties, Claims, quality, and Resolutions (`:24-34`). Agent/Dealer/Center hide Transfers on mobile (`:36-69`). The bottom bar disappears only for suffixes `/new`, `/edit`, `/receive`, `/open`, `/recovery` and two dynamic task prefixes (`:82-91`), missing dynamic Transfer detail, Warranty activation/detail, Claim detail/review/decision, Resolution detail, issue detail, production detail, and label selection. |
| 9. Relevant state | User is deep in a task on 320–430 px device or needs a less-frequent module without returning home |
| 10. Why it matters | Module reachability depends on knowing the dashboard model, and bottom navigation competes with some deep/sticky workflows while disappearing from others without a consistent rule. |
| 11. User/operational impact | Extra backtracking, hidden queues, accidental navigation during critical tasks, and degraded scalability as modules grow. |
| 12. Security/business-contract constraint | Navigation may advertise only role-authorized modules; route guards/RLS remain authoritative. |
| 13. Recommended design/product direction | Define a single typed role/module registry used by desktop, mobile, and dashboard; expose overflow/all-modules navigation; make task-shell behavior explicit via route groups/layout metadata rather than pathname suffix guesses. Validate sticky action coexistence at required widths. |
| 14. Evidence type | Static code; responsive/IA risk; no runtime screenshots |
| 15. Confidence | High for inconsistency; visual collision needs runtime validation. |

### CX-AUD-014 — User-facing operations copy leaks implementation increments, decision IDs, raw states, and backend vendor terms

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-014 |
| 2. Severity | P2 — Medium |
| 3. Classification | UX/Product Gap |
| 4. Role(s) | Admin, Agent, Dealer; some Center fulfillment users |
| 5. Journey | Claim review/decision/Resolution/recovery; account and onboarding support |
| 6. Route | Claim/Resolution pages; user/dealer/Center account pages |
| 7. File/component | Admin Claim action components/pages; Center Resolution task page; account pages |
| 8. Exact evidence | Visible strings include “Cube Q · Admin workflow” (`admin-claim-review-actions.tsx:241`), “Cube Q · Admin final decision”, `Approved`, `Resolution`, `PD-078`, checkpoint/increment text (`admin-claim-decision-actions.tsx:252,278,303-391`), `PD-079`, `actor_kind=admin_recovery`, “Admin recovery” (`admin-claim-resolution-actions.tsx:432,509-703`), and Center instructions referring to Cube J/K (`claim-resolution-tasks/[id]/page.tsx:209`). Account errors/help expose “Supabase Auth”, “Supabase Auth Admin”, and provider policy (`users/[id]/edit/page.tsx:28-40,128`; `users/new/page.tsx:20,71`; Center/Dealer edit error maps). |
| 9. Relevant state | Operator must make/recover a high-impact decision or explain an account failure |
| 10. Why it matters | Implementation vocabulary does not explain business meaning, can become stale across cubes, and is difficult to localize consistently. |
| 11. User/operational impact | Higher training burden, decision errors, confusing support messages, and mixed Arabic/English mental models. |
| 12. Security/business-contract constraint | Do not hide meaningful bounded-recovery constraints; translate them into business language and keep internal codes in logs/support diagnostics. |
| 13. Recommended design/product direction | Introduce a small shared domain vocabulary/presentation map for states, remedies, recovery paths, and provider-neutral account errors. Rewrite confirmation copy around actor, target, irreversible effect, and next state; keep PD/Cube/backend identifiers out of primary UI. |
| 14. Evidence type | Static UI code; terminology/i18n analysis |
| 15. Confidence | High |

### CX-AUD-015 — Critical interaction acceptance is source-contract-heavy and lacks browser/accessibility E2E coverage

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-015 |
| 2. Severity | P2 — Medium |
| 3. Classification | Technical Acceptance Blocker |
| 4. Role(s) | All, especially mobile Center/customer users and keyboard/screen-reader users |
| 5. Journey | Authenticated role reachability, dialogs, scanner fallback, uploads, responsive sticky UI, Claim/Transfer/Warranty completion |
| 6. Route | Platform-wide critical routes |
| 7. File/component | `package.json`; `.github/workflows/*.yml`; `scripts/verify-*-ui-contract.mjs`; Vitest suite |
| 8. Exact evidence | `package.json` has build/typecheck only and no Playwright/Cypress/Webdriver/axe dependency or E2E script. The 7-file/41-test Vitest suite covers selected component logic/QR/PDF/Push behavior; many `verify-*-ui-contract.mjs` gates assert source contracts. Workflows run extensive SQL/static checks but no real browser at 320/360/390/430, keyboard focus, authenticated role journey, camera permission, offline/slow network, or screen reader. The current audit could not add or execute such acceptance because it is audit-only and no hosted test credentials/environment were supplied. |
| 9. Relevant state | Pre-launch regression qualification and future high-risk workflow changes |
| 10. Why it matters | Compilation/source assertions cannot detect focus order, actual overflow, hydration, camera/browser permission behavior, sticky collisions, or a broken cross-page role journey. |
| 11. User/operational impact | Mobile/accessibility regressions may reach production despite green CI; manual acceptance becomes inconsistent and non-repeatable. |
| 12. Security/business-contract constraint | Tests need isolated seeded roles and must not weaken RLS, expose secrets, or use production data. Physical acceptance remains separate. |
| 13. Recommended design/product direction | Add a deliberately small acceptance cube: one seeded happy/stale/blocked journey per role, the end-to-end Claim/Resolution handoff, focus/axe checks for shared overlays, required viewports, scanner manual fallback, and public invalid states. Keep deep data invariants in current SQL suites. |
| 14. Evidence type | Repository/CI inspection; test execution; acceptance gap |
| 15. Confidence | High |

### CX-AUD-016 — Login copy incorrectly limits the portal to approved Centers

| Required field | Evidence |
| --- | --- |
| 1. ID | CX-AUD-016 |
| 2. Severity | P3 — Polish |
| 3. Classification | Confirmed Defect |
| 4. Role(s) | Registered but not network-approved Installation Center; partner support |
| 5. Journey | Login and expectation setting |
| 6. Route | `/login` |
| 7. File/component | `app/login/page.tsx`; approved Product decisions |
| 8. Exact evidence | Login says the portal is for company, agents, and “مراكز التركيب المعتمدة” (`login/page.tsx:25-29`). The binding decision explicitly separates operational registration/activation permission from network approval: an active unapproved Center with custody may open/install/activate (`product-decisions.md:37`, `:155-160`). Access guards check active Center status/binding, not approval. |
| 9. Relevant state | Active registered Center is not approved, or approval reset after location correction |
| 10. Why it matters | Correctly authorized users are told they are outside the intended audience. |
| 11. User/operational impact | Unnecessary support contacts and confusion about whether approval grants operational authority. |
| 12. Security/business-contract constraint | Approval must remain a trust badge, not an access or Warranty gate. |
| 13. Recommended design/product direction | Use “مراكز التركيب المسجلة/التشغيلية” or role-neutral portal copy; reserve “معتمد” for the explicit approval badge/state. Audit the same distinction in public/home/footer wording. |
| 14. Evidence type | Static code plus approved product contract |
| 15. Confidence | High |

## 10. Systemic findings

| Systemic theme | Findings | Why one bounded fix is preferable |
| --- | --- | --- |
| Evidence lifecycle and error prevention | CX-AUD-001, CX-AUD-002 | Inspection/completion/Admin recovery repeat the same upload model. One staged-evidence contract plus one preview component avoids three divergent fixes while preserving the stronger public Claim and pre-install patterns. |
| International identity/time contract | CX-AUD-004, CX-AUD-005 | These are cross-route data-presentation/capture contracts, not isolated labels. Shared time and phone primitives plus migrations/tests prevent continued format drift. |
| Operational identity/security | CX-AUD-003, CX-AUD-016 | Credential ownership, sensitive-change audit, and precise approval terminology need one account-lifecycle decision rather than page-specific patches. |
| Cross-role handoff semantics | CX-AUD-006, CX-AUD-012, CX-AUD-013 | A typed role/module/event registry can align source labels, safe destinations, navigation, and dashboard reachability without changing workflow authority. |
| Accessible shared interactions | CX-AUD-007, CX-AUD-015 | One qualified Dialog/Sheet primitive and a small browser acceptance suite eliminates repeated focus defects and makes future overlays testable. |
| Launch acceptance | CX-AUD-008, CX-AUD-009, CX-AUD-010, CX-AUD-011, CX-AUD-015 | Dependency, physical, public content/recovery, and browser acceptance must be evidence-backed release gates, not inferred from a green build. |
| Domain vocabulary/localization readiness | CX-AUD-014 plus parts of CX-AUD-012/016 | A small presentation dictionary removes Cube/PD/vendor/raw-state terms and supports later language work without rebuilding business logic. |

## 11. Cross-role workflow analysis

| Stage | Current responsible role and handoff | Strong controls observed | Gap/risk |
| --- | --- | --- | --- |
| Product definition/publication | Admin creates/edits; all roles reference; public sees active+published only | Separate operational and publication status; publication completeness; private asset bucket and signed public assets | Public launch copy/content acceptance remains external to code (CX-AUD-011). |
| Production/Lot/Roll identity | Admin reviews irreversible generation | Confirmation summarizes Product/date/Lots/Rolls; immutable order/Lot/Roll identity and snapshots; void retains audit | Cairo date default needs an international business-date decision (CX-AUD-004). |
| Print/QR | Admin selects order/Lot/range and downloads deterministic chunks | HTTPS-origin/GTIN/source completeness, chunk bounds, deterministic QR/barcode/PDF and stable reprint identity | Physical printer/material/RIP/cut/scan acceptance remains open (CX-AUD-009). |
| Initial custody and Transfer send | Current custodian selects active recipient and eligible Rolls | Selection reconciliation, bounded paging/lot expansion, server revalidation, request IDs, pending reservation leaves confirmed custody unchanged | Shared custom sheets are not keyboard-modal (CX-AUD-007); mobile shell behavior is inconsistent (CX-AUD-013). |
| Transfer receipt/recovery | Exact recipient scans/receives; sender can cancel; Admin recovery only for stuck suspended-party state | Partial truth per Roll, explicit mismatch review, retry-safe receipt, historical membership/events, recovery does not impersonate business parties | Same dialog/navigation acceptance gaps; no live multi-device race run on this host. |
| Roll opening | Custodian Center opens; permitted Agent/Admin only uses bounded recovery | Atomic custody/state eligibility, scan/manual fallback, stale refresh, immutable open truth | Real camera/device and offline/slow-network behavior unvalidated. |
| Pre-install quality | Center reports; Admin decides; activation hold follows automatically | Local image previews, private evidence, immediate hold, immutable terminal decisions and narrow reported-in-error correction | This is the model evidence UX that other workflows should reuse. |
| Warranty activation | Custodian active Center reviews Customer/vehicle/policy then activates atomically | Product/Center/Roll eligibility rechecked; issuance snapshots; idempotency; permanent high-entropy public identity separate from human identifiers | Phone capture/canonical verification contract can lock customers out (CX-AUD-005). |
| Public Warranty | QR holder sees narrow lifecycle projection | No login/OTP; permanent Roll-owned random code; fail-closed resolver; no PII/serial/custody exposure; no enumerable lookup | Invalid/damaged QR has no assisted privacy-safe recovery (CX-AUD-010); launch contact/content incomplete (CX-AUD-011). |
| Claim intake | Customer proves current Warranty phone; submits private evidence | Arabic/Persian digit normalization, throttling, short-lived HMAC access, phone freshness, staged evidence registry, request conflict checks | Egypt-specific phone prompt/capture mismatch (CX-AUD-005); no visual evidence review (CX-AUD-002). |
| Admin review → Center inspection | Admin starts/reassigns; exact Center queue receives task; submit returns to Admin | Role-scoped reads, historical inspection record, stale assignment guards, private signed evidence | Action handoff is mostly good, but operational upload can orphan and has no preview (CX-AUD-001/002); modal/browser acceptance gaps apply. |
| Admin decision → Resolution | Admin accept/reject/cancel; bounded correction; acceptance creates exactly one authorized Resolution | Immutable events, customer-safe message, state locks, no general undo | UI vocabulary exposes Cube/PD/raw states (CX-AUD-014). |
| Resolution assignment/material | Admin assigns performing Center/remedy; optional eligible replacement Roll reserved in that Center's custody | Revalidation under locks, eligibility/product policy, allocation lifecycle, no auto-Transfer, reassign/release boundaries | Center action-required notification lacks a destination (CX-AUD-006); assignment UI vocabulary is technical. |
| Center completion/Admin recovery | Performing Center completes; Admin recovery only when Center suspended/no operator | Replacement serial/opening/quality/material consumption checks; immutable completion evidence/events; customer-safe final projection | Evidence objects can be abandoned unregistered and cannot be visually reviewed (CX-AUD-001/002). |
| Customer-visible final history | Same permanent Warranty QR/Claim access shows safe service status/history | No replacement serial, internal reason, actor, PII, or evidence leakage; completed/withdrawn semantics separated | Cairo history time may differ from operational browser-local timelines (CX-AUD-004). |

No source path was found that allows an ordinary role to bypass its active Profile/exact entity binding, that changes confirmed custody at Transfer send, that uses a human identifier as public Warranty authorization, or that lets Admin recovery rewrite a false business event. Those are important negative findings.

## 12. International readiness

### Time/date

CX-AUD-004 is the principal international blocker. Storage and database contracts generally use absolute timestamps correctly, and public Warranty coverage uses date-only UTC formatting deliberately. Presentation, however, mixes viewer-local, Cairo, and UTC without an approved label/contract. Production's date default is also Cairo-derived. Resolve this before multi-country operational use and add midnight/DST coverage.

### Phone

The Claim normalizer correctly supports Arabic/Persian digits, spaces, dashes, parentheses, `+`, and `00` without unsafe country guessing. The weakness is earlier capture: Warranty activation stores a trimmed free-form value and Claim UI suggests an Egyptian mobile format. CX-AUD-005 calls for explicit country context/canonical representation and a safe migration policy, not guessing.

### Country/address

Country Agents and Centers carry explicit country codes; Center location is geospatial and has city/address plus immutable location events. This is a good international base. Hosted data was unavailable, so long organization/city/address names and repeated city names across countries were not exercised. Region/state/postal needs are market/product decisions, not proven defects in the current map/location contract.

### Language and terminology

The product is consistently Arabic-first at the document root (`lang="ar"`, `dir="rtl"`) and Cairo font includes Arabic/Latin. Identifiers commonly use `dir="ltr"`/`bdi`. Hardcoded UI copy is distributed widely and the Claim/Resolution/account surfaces expose English state/vendor/increment terms (CX-AUD-014). A large i18n framework is not justified by this audit; a small typed presentation vocabulary and separation of backend error codes from customer/operator copy are justified.

### Global operating context

The CSS has safe-area, `dvh`, 44/48 px control, overflow/wrapping, and small-width breakpoints. Scanner flows include manual serial fallback and Push handles unsupported/denied/iOS-install states. Actual low-bandwidth uploads, long names, camera permissions, iOS standalone behavior, and Push delivery across device/browser combinations remain validation items, not confirmed defects.

## 13. Mobile/responsive review

Static CSS review found strong mobile foundations:

- Required 320–430 px concerns are addressed through breakpoints at 340/360/370/390 and larger responsive breakpoints.
- Operational shells use `100dvh`, top/bottom safe-area padding, a compact mobile header, 44 px icon targets, and bottom-content clearance.
- Critical form controls commonly reach 44–48 px; long identifiers use LTR direction and wrapping; record lists collapse away from dense desktop tables.
- Transfer receipt uses a fixed action area with explicit content bottom padding; scan/manual alternatives stack on narrow widths.

The systemic weakness is navigation/task-shell policy (CX-AUD-013), not an absence of responsive CSS. Visual/runtimes at 320, 360, 390, 430 and landscape with keyboards were not available, so sticky action collisions, zoom, long Arabic strings, file picker behavior, and dialog viewport/focus need the browser acceptance in CX-AUD-015.

## 14. Accessibility review

Positive static evidence includes semantic `main` landmarks in public/operations layouts, labelled forms, explicit status text rather than color-only state, `role="alert"`/feedback patterns, `aria-live` upload/scan regions, LTR isolation for identifiers, visible focus styling, reduced-motion handling, and 44/48 px targets. The native confirmation component uses `<dialog>`/`showModal`, which is preferable to repeated ARIA-only overlays.

CX-AUD-007 is a confirmed shared defect: Transfer/scanner ARIA modal sheets omit focus entry/trap/restore. Heading hierarchy and accessible names appeared coherent in reviewed routes, but no screen reader, keyboard-only browser journey, contrast measurement, zoom/reflow, or automated axe run occurred. CX-AUD-015 therefore remains a launch acceptance need. Fix the shared primitive before page-by-page focus patches.

## 15. Public/brand/launch readiness

Public data boundaries are strong: active+published Products only; explicitly public assets via short-lived signed URLs; registered/approved Center distinction; high-entropy permanent Warranty identity; generic unknown-code behavior; `noindex/no-referrer/no-store` where appropriate; and a narrow customer-safe Warranty/Claim projection.

Launch is not yet content/recovery complete. CX-AUD-010 covers damaged/invalid QR and generic public error recovery without weakening anti-enumeration. CX-AUD-011 covers development-stage homepage copy and empty governed contacts. Hosted Product/Center data, actual domains/TLS, metadata previews, legal/Warranty wording per market, and public asset quality were not accessible and require a content/data sign-off. CX-AUD-016 corrects the smaller but contract-relevant approved-vs-registered Center wording.

## 16. Print/QR readiness

Software readiness is strong and passed available gates: canonical Roll serial normalization; contextual Roll QR resolves only to published Product content; Warranty QR uses a separate non-enumerable permanent code; production-source completeness and GTIN checks; deterministic pack/imposition; vector machine codes; quiet-zone/dimension checks; bounded chunk selection; private no-store PDF endpoint; stable duplicate/reprint identity; and explicit invalid/void eligibility.

Two limits remain explicit:

1. CI's independent `zbarimg` decoder was unavailable on this Windows host; vector/QR generation tests passed, but this local audit did not reproduce the independent decode step.
2. CX-AUD-009 is the authoritative physical acceptance blocker. The software profile must not be described as production-frozen until printer/RIP/cutter/media/real-device evidence is signed.

## 17. Notifications/PWA

Strong patterns include durable Inbox truth independent of Push transport; per-recipient deduplication; unread count/badge sync; safe server action-path validation; same-origin service-worker click routing; denied/unsupported/iOS guidance; current-device subscription inspection/repair/disable; stale subscription cleanup; PWA update deferral during risky workflows; and multi-tab lease/version coordination.

CX-AUD-006 breaks the “action required → next action” contract for Claim submission and Resolution assignment/reassignment. CX-AUD-012 makes new Warranty/Claim/Resolution events generic in the Inbox. Both should be fixed in the event-presentation/materialization layer with stale-route authorization tests. Real Push delivery, notification permission prompts, iOS installed-mode, multi-tab updates, and service-worker upgrade on physical devices remain unvalidated.

## 18. Positive patterns to preserve

| Pattern | Evidence and preservation note |
| --- | --- |
| Exact active identity binding | `lib/auth/operational-profile.ts:108-187` verifies authenticated user, active Profile, exact role/entity combination, and active represented entity before operational layout access. Preserve both UX guard and database/RPC enforcement. |
| Database-owned state/race truth | Transfer, Warranty, Claim, inspection, Resolution, allocation, and completion mutations use request IDs, row locks/state predicates, same-request payload conflict checks, and immutable events. Do not replace with client-owned optimistic truth. |
| Custody truth | Transfer send reserves but does not move confirmed custody; partial receipt moves each physical Roll individually; cancellation/recovery releases reservations without fabricating custody. |
| Bounded Admin recovery | Opened-Roll, Transfer, Warranty, Claim decision, and Resolution recovery paths require specific stuck/error conditions and append audit truth rather than impersonating another role or providing a general undo. |
| Public Warranty privacy | `lib/warranty/public-warranty.ts:111-134` uses the anonymous client and normalizes a narrow resolver result; public code is random/permanent and avoids Warranty/VIN/phone/serial lookup. |
| Claim access and staging | Short-lived HMAC HttpOnly/SameSite access, phone freshness, throttling, and the server-only Claim draft evidence registry with retryable cleanup avoid raw public tokens and stale deletion of committed evidence. Extend this pattern to CX-AUD-001. |
| Evidence boundary | Private buckets, server-side magic-byte/MIME/size verification, authorized signed reads, and immutable committed metadata prevent direct evidence exposure. Add preview/cleanup without weakening these controls. |
| Pre-install image UX | Local preview gallery, remove/replace before submit, and explicit review guidance demonstrate the right wrong-image prevention pattern. |
| Production/print preflight | Immutable snapshots, HTTPS origin, GTIN/source completeness, deterministic selection/chunk/layout/PDF, and stable identities make reprint behavior auditable. |
| Notifications/PWA resilience | Inbox remains canonical; Push is transport only; subscription repair and PWA multi-tab update coordination fail recoverably. |
| Mobile foundation | Safe-area, `dvh`, control target sizes, LTR identifier treatment, stacked actions, and manual scanner fallback are good shared defaults. |
| Safe confirmations | `ConfirmSubmitButton` uses native modal behavior and critical confirmations usually explain effect, block duplicate submission, and show state constraints. Reuse rather than proliferating custom modal implementations. |

## 19. Launch blockers

| Blocker | Release condition |
| --- | --- |
| CX-AUD-008 — high production dependency advisories | Patch/qualify the dependency tree and pass full Node 22 + database + QR/PDF gates, or document an approved time-bounded exception with demonstrated non-reachability. |
| CX-AUD-009 — physical print acceptance | Complete and sign the real printer/RIP/cutter/media/scan protocol before freezing or using the production physical label profile. |
| CX-AUD-001 — unregistered abandoned evidence | Add bounded operational staging/cleanup or demonstrate and monitor an equivalent retention control before production evidence volume. |
| CX-AUD-002 — no evidence preview | Provide preview/final review for Claim, inspection, normal completion, and Admin recovery before relying on those immutable decisions at scale. |
| CX-AUD-003 — account credential/audit model | Approve the credential-ownership model and implement first-user takeover plus immutable sensitive-change audit before broad partner rollout. |
| CX-AUD-004/005 — international time/phone contracts | Approve and implement explicit timezone/business-date and country-aware canonical phone contracts before a non-Egypt market launch. |
| CX-AUD-007/015 — accessibility/browser acceptance | Qualify the shared dialogs and representative critical journeys with keyboard/AT and required mobile viewports. |
| CX-AUD-010/011 — public recovery/content | Populate governed contact/content and provide privacy-safe invalid/damaged QR recovery before public brand launch. |
| Database acceptance not executed here | Run the repository's complete Supabase reset/lint/RLS/RPC/macro-concurrency workflows on isolated Docker/CI at the exact commit. A green build alone is not release evidence. |

CX-AUD-006 and CX-AUD-012 should be fixed before operational launch at volume, but they do not independently compromise state integrity. CX-AUD-013/014/016 are important quality improvements and can follow the blockers if the launch population is tightly controlled.

## 20. Product decisions required

1. **Time contract:** organization/business timezone versus viewer-local time, label policy, and ownership of date-only production fields (CX-AUD-004).
2. **Phone identity contract:** market/country context, canonical representation, existing-data repair, and exact accepted `+`/`00` behavior without guessing (CX-AUD-005).
3. **Credential ownership:** invite/one-time setup/forced rotation/recovery model for Admin-, Agent-, and Dealer-provisioned users; re-auth policy; immutable audit event schema and retention (CX-AUD-003).
4. **Assisted public recovery:** governed support channel and evidence required to help a QR holder without providing public identifier lookup or existence hints (CX-AUD-010/011).
5. **Notification stale destination:** exact detail versus safe queue fallback after reassignment/cancellation (CX-AUD-006).
6. **Operational navigation taxonomy:** primary role tabs, overflow/all-modules model, and explicit task-shell policy (CX-AUD-013).
7. **Physical production profile:** accepted label size, stock, printer, RIP, cutter, bleed/gap/registration, and device scan thresholds (CX-AUD-009).

## 21. Areas that could not be validated

- Local migrations, DB lint, generated-schema drift, RLS/API grants, RPC behavior, SQL race suites, and Cube R macro-concurrency: Docker Linux engine unavailable.
- Hosted Supabase configuration, Auth email templates/delivery, SMTP, secrets, Storage policies/object inventory, cron/Push worker schedule, actual RLS grants, data volume, indexes/query plans, and production logs.
- Real users/seeded role sessions for Admin, Agent, Dealer, Center, invited Center, suspended Profile/entity, stale browser, and cross-role parallel actions.
- Browser rendering/hydration at 320/360/390/430/tablet/desktop, landscape, zoom/reflow, soft keyboard, long Arabic/Latin names/serials, sticky areas, print preview, and network throttling.
- Keyboard-only and screen-reader workflows, focus order/restore, contrast measurement, forced-colors, reduced-motion runtime, and automated accessibility scan.
- Real camera permission denied/blocked/recovery, QR scan across phones/browsers/lighting/damage, and CI's independent `zbarimg` decode on this host.
- Actual PWA installation/update/offline behavior, iOS standalone requirements, Push permission/subscription repair/delivery/click across devices and multi-tab lifecycle.
- Physical printer/RIP/cutter/media, cut/bleed/adhesion/curvature/wear, barcode/QR readability, duplicate/reprint and label application.
- Hosted public domain/TLS/origin configuration, SEO/social previews, legal/market content, real Product/Center/Warranty data quality, populated contacts, and third-party analytics/monitoring.
- Load/soak limits for 10,000-Roll Transfers, large production orders/PDF chunks, Inbox growth, evidence storage/cleanup, concurrent Claims/Resolutions, and slow international networks.
- Dependency-advisory exploitability in the final deployment topology after patching; the audit establishes dependency presence, not successful exploitation.

## 22. Recommended implementation ordering

Use small, independently qualifiable cubes; do not combine these into a redesign PR.

1. **Dependency acceptance cube:** update Next/lockfile, run npm audit and the full Node 22 CI/database/QR/PDF matrix.
2. **Operational evidence lifecycle cube:** add staged registry/expiry/finalization for inspection and completion (normal/Admin), migration/RLS/RPC tests, object-cleanup observability.
3. **Evidence review cube:** shared private preview/remove/replace/duplicate/final-review component across Claim/inspection/completion; browser mobile/a11y tests.
4. **Accessible overlay cube:** one Dialog/Sheet primitive; migrate scanner and Transfer overlays; keyboard/focus/AT tests at required viewports.
5. **International contract cube A — phone:** approved country/canonical model, UI preview, safe backfill/correction, exact normalization/verification tests.
6. **International contract cube B — time:** shared formatter/business-date helper, explicit labels/config, replacement of Cairo/browser drift, DST/midnight/print tests.
7. **Account security cube:** one-time ownership/forced rotation or invite flow, sensitive-action confirmation/re-auth, immutable non-secret audit events, recovery/offboarding tests.
8. **Notification handoff cube:** typed domains/events, complete source labels, safe action paths and stale-route fallbacks, projector/UI/Push contract tests.
9. **Public launch cube:** privacy-safe invalid/damaged QR recovery, branded root error/not-found, final customer copy/contact/content checklist, approval terminology fix.
10. **Navigation/vocabulary cube:** typed role/module registry, overflow/task-shell policy, shared business-language state/error maps; validate long copy/mobile.
11. **Browser acceptance cube:** seeded isolated multi-role critical journeys, mobile viewports, axe/keyboard, camera manual fallback, stale/retry cases. Keep SQL invariants in current database suites.
12. **Physical acceptance run:** after software identity/profile stability, execute the signed target-equipment protocol and freeze the production print profile from evidence.

Each cube should state the preserved contracts from section 18, run its focused tests plus `typecheck`, build, relevant SQL/CI gates, and leave no ambiguity between a code fix, product decision, content/data acceptance, and physical acceptance.
