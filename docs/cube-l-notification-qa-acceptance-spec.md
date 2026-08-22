# Cube L — Notification / Web Push / PWA QA & Acceptance Specification

**Date:** 2026-08-22  
**Status:** FROZEN quality contract.  
**Companions:**

- `docs/cube-l-notification-pwa-frozen-spec.md`
- `docs/cube-l-notification-event-catalog.md`

## 1. Quality objective

Cube L is an attention and cross-role handoff system. A false recipient, duplicate Push, leaked lock-screen detail, stale deep link that bypasses authorization, or missing notification after a committed domain event is a product/security defect.

Testing therefore covers four layers:

1. database/domain projection;
2. authorization and concurrency;
3. Push/PWA delivery behavior;
4. rendered role/device experience.

No single layer substitutes for the others.

## 2. Permanent database contract suite

A fresh local Supabase rebuild must execute a permanent Cube L contract script after all prior Cube contracts.

### 2.1 Notification identity and deduplication

Prove:

- one authoritative source event materializes at most one notification per intended Profile/event type;
- replaying the same source event/integration is idempotent;
- two active Profiles representing the same operational entity receive two different notification rows;
- each Profile has independent `read_at`;
- a Profile created after the event does not inherit the historical notification;
- same business object with two distinct immutable source events may create two legitimate notifications;
- notification title/body/action_path/source identity cannot be mutated after creation;
- ordinary delete is forbidden;
- `read_at` is monotonic `null → timestamp` and cannot be rewritten/cleared.

### 2.2 Role/entity authorization

Create real authenticated fixtures for Admin, Agent, Dealer and Center and prove:

- each Profile reads only its own notifications;
- no Profile can read another user's notification row even when both belong to same entity;
- Agent receives only own-scope catalog events;
- Dealer receives only exact own-scope catalog events;
- Center receives only exact Center events;
- Agent/Dealer never receive or read Cube K quality-review notification detail under current authority;
- suspended Profile cannot list/count/mark notifications;
- active Profile bound to suspended Agent/Dealer/Center cannot list/count/mark operational notifications;
- suspended recipient is skipped by external Push worker revalidation;
- Admin has no implicit access to another Profile's per-user notification row merely because Admin role is powerful; business source access remains separate from notification-recipient ownership.

### 2.3 Direct mutation hardening

Prove authenticated/anon clients cannot directly:

- insert notification rows;
- rewrite notification content/source identity;
- delete notification rows;
- insert/update/delete delivery outbox rows;
- read Push endpoint/key secrets belonging to another Profile;
- register a subscription for another Profile id.

If a server/service role is intentionally granted narrow table rights for worker behavior, permanent tests must verify no broader Data API grants exist than required.

## 3. Frozen event-catalog contract tests

For every entry in `cube-l-notification-event-catalog.md`, create an actual source-domain event through the canonical RPC/transition wherever practical and assert exact recipients/non-recipients.

### 3.1 Transfers

Test at minimum:

- standard Transfer created → recipient Profiles only, `action_required`, Push eligible;
- sender does not receive duplicate self-success notification;
- rejected → sender Profiles, not unrelated parties;
- sender-cancelled → recipient Profiles;
- administrative cancellation → both parties, acting Admin self-copy excluded where applicable;
- partial receipt → sender Profiles receive action-required notification;
- subsequent partial receipt creates a distinct event notification without duplicating the first;
- full standard receipt → sender info notification;
- sender unresolved release → recipient notification;
- Admin unresolved release → both relevant parties, acting Admin excluded from self-copy where applicable;
- one Transfer outside Agent/Dealer scope creates no cross-scope recipient leakage.

### 3.2 Recovery specialization

Test:

- opened-Roll Recovery produces exactly one Center-facing recovery-completion notification from the terminal receipt event;
- generic standard Transfer-received message is suppressed for the same event;
- former Center copy uses Center-safe action path;
- Recovery reason is not in Push payload;
- Center custody has actually moved according to Cube J/H contracts before completion notification exists.

### 3.3 Center location / approval

Test:

- Center-device location capture for Agent-network Center → responsible Agent Profiles receive action-required approval notification;
- Dealer does not receive approval authority notification;
- direct Company Center → active Admin Profiles receive it;
- Admin location correction does not create redundant approver notification to same actor;
- approval event → Center Profiles receive info notification;
- revoke → Center warning;
- location change invalidating approval → Center warning;
- network approval notifications never imply custody/Opening/Activation permission.

### 3.4 Center onboarding

Test:

- normal accepted onboarding under Dealer → direct Dealer Profiles only for manager-awareness event;
- direct-Agent Center → Agent Profiles;
- direct-Company Center → Admin Profiles;
- review-required accepted onboarding → Admin action-required notification and no duplicate normal accepted notification;
- invited unauthenticated user before Profile creation receives no in-app row merely from invitation creation;
- source-key replay does not duplicate onboarding notification.

### 3.5 Cube K

Test:

- `submitted` → active Admin Profiles;
- reporting Center does not receive self-success notification for its own submission;
- Agent/Dealer receive zero Cube K quality notifications;
- `cleared_for_use` → reporting Center Profiles;
- `return_required` → reporting Center Profiles, action required;
- `reported_in_error` → reporting Center Profiles;
- terminal Push payload omits Admin resolution reason;
- Admin Push for submission omits issue description/evidence;
- historical Center issue visibility rules remain those of Cube K; notification never broadens them.

## 4. Read/unread concurrency tests

Prove:

- two concurrent mark-read calls converge on one valid `read_at` state;
- a mark-all operation cannot mark another Profile's rows;
- new notification created concurrently with mark-all follows a deterministic contract: mark-all affects rows visible/unread at the database operation boundary; a later event may remain unread;
- unread count matches actual current Profile unread rows after concurrent read operations;
- retry of mark-read is harmless;
- large unread count remains exact at data layer even if UI renders `99+`.

## 5. Push subscription contract tests

### 5.1 Ownership

Prove:

- authenticated Profile can register its current subscription only for itself;
- endpoint is unique across platform;
- exact same subscription registration is idempotent;
- subscription key update for same endpoint/current owner is controlled and auditable enough for repair;
- a different Profile cannot steal/rebind an existing endpoint silently;
- disable/unsubscribe affects only current Profile's owned subscription;
- Profile may own multiple independent device subscriptions;
- one device removal does not remove another device.

### 5.2 Secret privacy

Prove:

- endpoint, `p256dh`, auth secret are not exposed through general notification Inbox/list RPCs;
- another authenticated Profile cannot select them;
- logs/Push payloads do not contain private key/auth secret;
- VAPID private key never exists in client bundle/static config.

## 6. Delivery outbox/worker tests

Use a deterministic fake/local Push transport for permanent CI where a real vendor push service is unavailable.

Prove:

- one Push-eligible notification + one active subscription creates one delivery identity;
- one notification + two device subscriptions creates two deliveries;
- non-Push-eligible event creates Inbox row but no Push delivery;
- worker atomically claims due rows and parallel workers cannot double-send same delivery attempt;
- batch cap 100 is enforced;
- successful send → `sent`, timestamps/attempt count valid;
- network/5xx/429 transient error → retry schedule advances;
- 404/410 → delivery dead and exact subscription disabled;
- other non-transient 4xx → delivery dead without disabling unrelated subscriptions;
- max 4 attempts then dead;
- dead Push does not delete/alter Inbox notification;
- source domain transaction remains committed even when transport is unavailable;
- suspended Profile/entity between notification creation and worker execution results in no external send;
- disabled subscription is never claimed for new delivery;
- worker invocation requires dedicated secret and rejects missing/incorrect secret;
- worker never accepts arbitrary recipient/message injection from a public client.

## 7. Deep-link security tests

Prove:

- stored `action_path` must be relative same-origin path;
- `https://evil.example`, protocol-relative `//evil.example`, `javascript:` and malformed paths are rejected;
- Service Worker click handling only opens/focuses same-origin allowed path;
- receiving a notification does not prove authorization to the target object;
- if target access is later revoked/suspended, deep link fails through normal route/domain guard without exposing source detail;
- login redirect preserves safe post-login destination only through existing authorized app conventions.

## 8. Service Worker contract tests

Static/unit/browser tests must prove:

- root-scope Service Worker registers successfully in secure hosted test environment;
- `push` handler displays visible notification via `showNotification()`;
- malformed/untrusted payload fails safely;
- notification tag is stable per notification identity, preventing duplicate OS display on delivery retry;
- `notificationclick` focuses existing app window when possible, otherwise opens the same-origin action path;
- worker does not implement speculative general fetch caching/offline mutation behavior;
- open clients can receive refresh message after Push;
- unsupported Badging API path is harmless;
- Service Worker update does not block ordinary page navigation/build.

## 9. PWA manifest/installability tests

Automated/static validation must assert:

- manifest exists through current Next.js convention;
- stable `id`;
- `scope = '/'`;
- expected operational start URL;
- `display = 'standalone'`;
- valid temporary 192×192 and 512×512 icons at implementation time;
- Apple touch icon/current Apple-compatible metadata exists;
- theme/background values use existing interface tokens;
- app remains usable in regular browser even when not installed;
- no offline-data behavior is falsely advertised.

Hosted rendered acceptance should verify installability where browser exposes it.

## 10. Permission-state UX tests

Cover presentation states independently:

- Push unsupported;
- iPhone/iPad browser context requiring Home Screen install;
- permission `default` before request;
- user explicitly enables and grants;
- permission denied;
- granted but subscription creation failed;
- successfully subscribed;
- disabled/unsubscribed current device;
- stale browser permission/subscription repaired on revisit.

Hard requirements:

- no permission prompt on initial login/page load;
- browser permission request occurs only after explicit user gesture;
- denied Push never blocks Inbox or operational workflows;
- no repeated nag loop after denial;
- iOS guidance explains Add to Home Screen requirement instead of presenting a non-functional enable button.

## 11. Real Web Push staging acceptance

Permanent CI cannot fully substitute for vendor browser Push infrastructure. Before Cube L closure, execute real hosted HTTPS tests with real browser subscriptions.

Required acceptance targets, where available to the project team:

- current Chromium desktop;
- current Firefox desktop;
- current Safari/macOS;
- Android Chromium-family browser/PWA;
- iPhone/iPad Home Screen web app on iOS/iPadOS 16.4+.

For each supported target prove:

1. install/permission guidance is correct;
2. subscription reaches server;
3. eligible source event produces Inbox row;
4. device receives system Push while app is backgrounded/closed where platform permits;
5. tapping notification returns to correct authenticated app context;
6. read/business state remains correct;
7. disable/remove device stops future Push while Inbox continues.

If a physical platform is not available during CI, it must be recorded as a manual/staging acceptance item, not silently marked passed.

## 12. Rendered UI matrix

Every primary notification surface must be reviewed at:

- 320px;
- 360px;
- 390px;
- 430px;
- representative tablet/desktop widths.

Review:

- authenticated shell bell/badge;
- Inbox empty state;
- Inbox with mixed unread/read and all attention levels;
- long Arabic title/body within frozen bounds;
- mixed Arabic + Transfer/Roll serials;
- pagination/load-more behavior;
- settings: unsupported/default/denied/subscribed/needs-install/error;
- PWA install guidance;
- stale/inaccessible deep-link result.

No horizontal page overflow for core surfaces. Touch controls meet existing 44px+ contract.

## 13. Accessibility/interaction acceptance

At minimum:

- bell has accessible name and unread state not conveyed by color alone;
- unread item has semantic/textual distinction;
- keyboard focus visible on desktop;
- notification items/deep links have predictable focus/activation behavior;
- action-required styling is understandable without excessive alarm color;
- motion/animation is not required to understand state;
- permission/settings copy is clear Arabic, not browser/protocol jargon;
- status and time are readable under RTL with LTR identifiers isolated appropriately.

## 14. Time correctness acceptance

Create one known UTC timestamp and verify the same event displays consistently across:

- bell/preview if present;
- Inbox list;
- any detail context that reuses notification timestamp.

Server hosting timezone must not change the displayed user time. Browser/device timezone is the presentation contract.

## 15. Regression gates

Cube L CI must retain all existing gates and add Cube-L-specific contracts.

Required before closure:

- fresh Supabase migration rebuild;
- DB lint;
- explicit Data API grant verification;
- all prior permanent DB contracts through Cube K;
- Cube L notification DB contract;
- Cube L client/service-worker/PWA static contracts;
- generated Supabase types exact diff;
- TypeScript typecheck;
- Next.js production build;
- existing QR/Transfer/Receipt/Opening/Recovery/Cube K client contracts;
- no configuration mutation during build.

## 16. Double-review closure

### Pass 1 — Domain / Security / Delivery

Review:

- source-event authority;
- recipient resolution;
- RLS;
- active Profile/entity lifecycle;
- idempotency/dedup;
- read concurrency;
- Push secret privacy;
- outbox atomicity/retry;
- no business rollback from Push failure;
- payload privacy;
- deep-link authorization;
- no generic workflow creep.

### Pass 2 — UX / PWA / Integration / Regression

Review:

- role-specific relevance/noise;
- bell/Inbox discoverability;
- permission UX;
- iPhone Home Screen guidance;
- installability;
- mobile ergonomics;
- Arabic/RTL;
- browser/device real Push evidence;
- stale state/deep-link behavior;
- no valid role access lost;
- all prior product journeys remain reachable.

## 17. Exit criterion

Cube L receives GO only when permanent automated gates are green **and** the real hosted Push/PWA acceptance evidence required above has been recorded. A green build without real Push validation is not sufficient closure.
