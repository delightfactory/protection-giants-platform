# Cube L — Role-aware Notifications + Web Push + Minimal PWA — Frozen Specification

**Date:** 2026-08-22  
**Status:** FROZEN planning specification. Implementation must start from fresh `main` only after Cube K is closed/merged.  
**Product track:** Product Development — this is a real Cube, not Platform Experience Harmonization.

## 1. Product purpose

Cube L provides one durable role-aware notification capability for Protection Giants so operational handoffs are visible inside the platform and can also attract the user's attention while the platform is closed or in the background.

The cube must answer safely:

1. what happened;
2. why this user needs to know;
3. whether action is required;
4. where the user can inspect/act;
5. whether the user can receive the same material event through standards-based Web Push on this device.

Cube L is inserted after Cube K and before Warranty Activation so later Warranty/Claims lifecycles integrate with one established notification contract.

## 2. Frozen scope

V1 includes all of the following as one bounded capability:

- durable per-Profile in-app notifications;
- unread/read state;
- notification bell/unread count in authenticated Operations shell;
- `/operations/notifications` Inbox;
- mark one read;
- mark all currently visible/unread notifications read;
- deep links to source-domain routes;
- explicit role/entity-aware recipient resolution;
- explicit event catalog for already-merged applicable domains;
- standards-based Web Push;
- one Profile may have multiple browser/device Push subscriptions;
- durable Push outbox/delivery state;
- retry/dead-endpoint handling;
- Push permission/settings UX;
- Minimal PWA technical foundation required for installability/Home-Screen behavior and iPhone/iPad Web Push;
- app badge integration where supported;
- permanent cross-role/security/regression tests;
- rendered mobile/desktop/browser QA.

## 3. Explicit non-goals

Cube L must NOT become:

- a generic workflow engine;
- a user-authored notification-rules builder;
- arbitrary template scripting;
- assignment/BPM engine;
- email delivery;
- SMS/WhatsApp delivery;
- native Android/iOS application;
- offline business-data synchronization;
- background mutation of Transfers/Issues/Warranty state;
- a replacement for source-domain queues/workbenches;
- an authorization mechanism.

No user-configurable category mute/preferences in V1. The event catalog owns what is important enough to notify and which events are Push-eligible. The user may enable/disable Push on the current device without disabling the durable Inbox.

## 4. Notification semantics

### 4.1 Inbox is durable; Push is a delivery channel

The durable in-app notification is the user-facing record that an event was surfaced to a Profile.

Web Push is a best-effort external delivery of an eligible durable notification. Push success/failure never changes source-domain business state and never changes the notification's read state.

### 4.2 Notification read state is not task state

`read_at` means only that the Profile has read/opened the notification context. It does not mean a Transfer was received, an Issue resolved, a Center approved, or any other business task completed.

### 4.3 Attention levels

Frozen values:

- `info`
- `action_required`
- `warning`

Do not add a larger severity taxonomy without a later product decision.

## 5. Recipient model

### 5.1 Per-Profile materialization

One durable notification row is created per recipient Profile.

If an operational entity has multiple active Profiles, each active Profile receives an independent row and independent `read_at` state.

A Profile added later does not retroactively inherit historical notifications.

### 5.2 Active-state rules

A recipient must be:

- an active Profile;
- correctly bound for its role;
- if bound to Agent/Dealer/Center, the bound entity must also be operationally active at materialization time.

The Push worker must re-check Profile/entity active state before external delivery so a user/entity suspended after materialization does not keep receiving operational Push.

### 5.3 Company/Admin fan-out

For Company-level events with no narrower approved responsibility, notify every active Admin Profile.

Where a source domain has a clearer operational owner, prefer that responsibility instead of broadcasting to Admins unnecessarily.

### 5.4 Actor-noise rule

Do not notify the same Profile merely to repeat a synchronous success action they just performed.

Other active Profiles representing the same responsible entity may still receive the event when team awareness is useful under the frozen event catalog.

## 6. Frozen data model

Names may receive normal migration-level refinement, but the business shape is frozen.

### 6.1 `notifications`

One row per recipient Profile notification.

Required shape:

- `id uuid primary key`;
- `recipient_profile_id uuid not null` → `profiles.id`;
- `event_type text not null`;
- `source_domain text not null`;
- `source_event_key text not null` — stable deterministic identity supplied by the source integration;
- `attention_level text not null` in `info | action_required | warning`;
- `title text not null`;
- `body text not null`;
- `action_path text null`;
- `push_eligible boolean not null`;
- `created_at timestamptz not null`;
- `read_at timestamptz null`.

Bounds:

- title: 1–120 trimmed characters;
- body: 1–300 trimmed characters;
- `action_path` if present must be an application-relative path beginning with `/` and must not contain a scheme/host.

Deduplication uniqueness:

`recipient_profile_id + source_domain + source_event_key + event_type`

Rows are not deletable by ordinary users. Identity/content fields are immutable. `read_at` is monotonic `null → timestamp`; V1 has no “mark unread”.

### 6.2 `push_subscriptions`

One row per browser/device Push subscription.

Required shape:

- `id uuid primary key`;
- `profile_id uuid not null`;
- `endpoint text not null unique`;
- `p256dh text not null`;
- `auth_secret text not null`;
- `created_at`;
- `updated_at`;
- `disabled_at null`;
- `last_success_at null`;
- `last_failure_at null`.

Rules:

- one Profile may have zero, one or many active subscriptions;
- endpoint/key material is sensitive operational data;
- no cross-user direct read access;
- ordinary clients do not get a global device/subscription directory;
- subscription upsert/removal is performed through controlled authenticated server actions/RPCs for the current Profile/device;
- endpoint uniqueness prevents duplicate delivery to the same browser subscription;
- re-subscription is idempotent.

### 6.3 `notification_push_deliveries`

Durable Push outbox/delivery state per eligible notification/subscription.

Required shape:

- `id uuid primary key`;
- `notification_id uuid not null`;
- `subscription_id uuid not null`;
- `status text not null` in `pending | retry | sent | dead`;
- `attempt_count integer not null`;
- `next_attempt_at timestamptz not null`;
- `last_attempt_at timestamptz null`;
- `last_http_status integer null`;
- `last_error_code text null`;
- `sent_at timestamptz null`;
- `created_at timestamptz not null`.

Unique:

`notification_id + subscription_id`

Direct client mutation is forbidden.

## 7. Source-domain integration contract

### 7.1 Explicit integrations only

Every integration must map a named authoritative source transition/event to:

- event type;
- recipient responsibility;
- attention level;
- title/body presenter;
- deep-link path;
- Push-eligible flag;
- stable source-event key.

Do not create one generic trigger that guesses business meaning from arbitrary table changes.

### 7.2 Immutable events preferred

Where a domain already records an immutable event (`roll_transfer_events`, `center_location_events`, `center_network_approval_events`, `roll_preinstall_issue_events`), that event is the preferred source identity.

Where a domain currently exposes only a controlled authoritative status transition (for example Center onboarding invitation lifecycle), Cube L may create a narrow deterministic projection from that exact transition without inventing new business state.

### 7.3 Transaction boundary

No network request or Push send occurs in the source business transaction.

For mandatory Inbox events, DB-local notification/outbox materialization may be atomic with the authoritative event so a committed cross-role handoff cannot silently exist without its durable Inbox projection.

All external Push delivery is asynchronous and fault-isolated.

## 8. Read/RPC contract

V1 requires controlled operations equivalent to:

- list current Profile notifications, newest first, bounded pagination;
- unread count;
- mark one visible notification read;
- mark all current Profile unread notifications read;
- register/update current browser Push subscription;
- disable/remove current browser Push subscription;
- read current device Push state without exposing another device's secret material.

Frozen pagination default: **30 notifications per page**.

No archive/delete/snooze/pin/search/filter UI in V1.

No automatic history purge in V1. Notifications are not the legal/domain audit source; retention can be revisited after real volume exists without blocking this cube.

## 9. In-app UX contract

### 9.1 Authenticated shell

All four operational roles receive a notification bell/entry in the authenticated shell.

The bell shows unread state/count. Large counts must not break layout; display may cap visually (for example `99+`) while the data API retains the exact count.

### 9.2 Inbox

`/operations/notifications`

Requirements:

- newest first;
- unread visually distinguishable without relying on color alone;
- attention level visible but calm;
- title, concise body, time, source context;
- deep link where applicable;
- empty/loading/error states;
- mark one read;
- mark all read;
- mobile-first Record pattern; no wide table required.

### 9.3 Time contract

Database timestamps remain UTC/timestamptz.

User-facing notification timestamps are rendered through one shared formatter in the **device/browser timezone**, not the hosting server timezone. Server Components must not independently format operational times in a way that can disagree with client screens.

The formatter must support Arabic/RTL and preserve machine IDs/serials safely.

## 10. Web Push standards contract

Use standards-based Web Push:

- Push API;
- Notifications API;
- Service Worker;
- Web Push encryption/protocol;
- VAPID application-server identity;
- HTTPS in hosted environments;
- feature detection instead of browser-name branching.

Do not make Firebase Cloud Messaging, APNs-specific application code, or one vendor SDK the canonical platform contract.

VAPID private key is server secret only. The VAPID public key may be exposed to the subscribing client.

Push subscription endpoints are capability URLs and must be treated as secret operational data.

## 11. Push permission/settings UX

Push permission must never be requested automatically on initial page load.

Provide a visible `/operations/notifications/settings` or equivalent focused settings surface with:

- value explanation before permission request;
- explicit user gesture to enable;
- current-device state: `unsupported | needs_install | default | granted | denied | subscribed | error` as presentation states;
- “Enable on this device” when valid;
- “Disable on this device” when subscribed;
- clear denied-state guidance without repeated prompts;
- iPhone/iPad Home Screen guidance where required;
- normal platform use remains available when Push is unsupported/denied.

No category-level preference UI in V1.

## 12. Minimal PWA foundation

Cube L owns the minimum technical PWA shell required for correct install/Home-Screen/Push behavior.

### Required

- Next.js App Router manifest (`app/manifest.ts` or equivalent current convention);
- stable manifest `id`;
- `scope: /`;
- authenticated operational `start_url` (recommended `/operations`; unauthenticated flow may redirect normally to login);
- `display: standalone`;
- theme/background values based on existing interface tokens, not invented permanent branding;
- temporary valid 192×192 and 512×512 app icons plus Apple touch icon or current standard equivalents;
- root-scope Service Worker;
- install/help affordance in notification settings;
- Chromium install prompt support when browser exposes it;
- manual Add-to-Home-Screen guidance on Apple platforms when required.

### Explicitly not required

- offline page caching;
- offline mutation queue;
- background sync of business data;
- speculative cache-first navigation;
- final marketing splash/icon artwork.

Final company logo/icons may replace temporary technical assets later without changing Cube L architecture.

## 13. Service Worker contract

The root Service Worker remains deliberately small.

Required behavior:

- receive `push`;
- parse a bounded trusted payload;
- call `registration.showNotification()` for persistent notifications;
- handle `notificationclick`;
- focus an existing same-origin app window or open the allowed application-relative path;
- reject/ignore cross-origin action URLs;
- use stable notification `tag` derived from notification identity to avoid duplicate OS displays during retry;
- notify open clients to refresh unread state where useful;
- best-effort Badging API integration where supported;
- handle subscription change/refresh only where browser support provides a reliable path, otherwise repair on next settings/app visit.

No general `fetch` caching/offline strategy in V1.

## 14. Push payload privacy contract

System notifications may appear on a lock screen. Payloads therefore contain only minimum operational context.

Allowed payload shape should remain equivalent to:

- `notification_id`;
- `title`;
- `body`;
- same-origin relative `action_path`;
- bounded presentation tag/attention hint.

Forbidden:

- auth/session tokens;
- VAPID secrets;
- customer personal data;
- full quality evidence/details;
- raw Push endpoint/key material;
- any identifier that itself grants access.

Deep links always re-enter normal authentication, route authorization, RLS and domain checks.

## 15. Push worker contract

Use a server-only Node.js-capable worker/route compatible with the current Next.js stack.

Recommended implementation surface:

- internal POST Route Handler / worker entry;
- protected by a dedicated deployment secret;
- claims due deliveries in bounded batches;
- uses `FOR UPDATE SKIP LOCKED` or equivalent atomic claim to avoid double sends;
- batch size **100** deliveries/run;
- re-check recipient Profile/entity active state before send;
- sends only active subscription rows;
- records result idempotently.

The exact production scheduler provider is a deployment concern, not a notification-domain dependency. Production must schedule the worker often enough that normal Push delivery begins within approximately five minutes of an eligible event. Local/CI can invoke the same worker contract directly.

## 16. Retry/failure contract

Maximum V1 attempts per delivery: **4**.

Retry schedule target:

1. initial due delivery;
2. +5 minutes;
3. +30 minutes;
4. +120 minutes.

Classification:

- success → `sent`;
- HTTP 404/410 from Push service → subscription endpoint is gone; disable subscription and mark delivery `dead`;
- HTTP 429, 5xx or network/transient failure → retry if attempts remain;
- other non-transient 4xx → mark the delivery `dead` after recording status/error; do not mass-disable subscriptions unless the response specifically proves the endpoint is gone;
- exhausted attempts → `dead`.

A failed/dead Push delivery does not delete the Inbox notification and does not alter source-domain state.

## 17. In-app refresh model

V1 deliberately does not require Supabase Realtime.

Unread state should refresh through a bounded combination of:

- initial authenticated shell load;
- navigation/focus refresh;
- immediate refresh after mark-read operations;
- Service Worker message after a Push reaches an already-open client;
- light visible-tab polling no more frequent than once per 60 seconds if needed by the final shell implementation.

This is sufficient for V1 because Web Push owns external attention while avoiding a new realtime subsystem.

## 18. Badging

Where the Badging API is supported, the app may set/clear an app badge based on current unread state.

Badge behavior is progressive enhancement only; absence/failure of Badging must not affect Inbox or Push correctness.

## 19. Security invariants

- Notification never grants authorization.
- Direct client inserts into notification/outbox tables are forbidden.
- A Profile reads/mutates only its own notification/read state.
- Suspended Profile cannot list/count/mark notifications.
- Suspended Agent/Dealer/Center entity invalidates its bound Profile's operational notification access.
- Push subscription secrets are never readable by unrelated clients.
- Registration/removal binds only to the authenticated current Profile.
- Worker secret is server/deployment-only.
- Push worker revalidates active recipient context before external send.
- `action_path` is same-origin relative only.
- source-domain content presenters may not leak fields the recipient cannot otherwise access.
- Agent/Dealer receive no Cube K quality-review details unless a later explicit product decision changes Cube K authority.

## 20. Compatibility baseline

Implementation must re-verify browser behavior at development time.

Planning baseline as of 2026-08-22:

- standards-based Push API is broadly available across modern browser families;
- Push requires Service Worker/secure context in supporting browsers;
- persistent mobile notifications should be shown via Service Worker registration;
- permission must be user initiated;
- iOS/iPadOS supports Web Push for Home Screen web apps from iOS/iPadOS 16.4+;
- current Apple platforms continue to support the standard Push/Notifications/Service Worker model;
- Next.js 16 App Router has first-party manifest/PWA guidance.

## 21. Definition of Done

Cube L is not complete until all of the following are true:

1. schema/RLS/RPC contracts implemented;
2. frozen event catalog integrations implemented for all current V1 events;
3. durable Inbox + unread bell complete for all four roles;
4. current-device Push enable/disable UX complete;
5. standards Web Push works against real browser subscriptions in test/staging;
6. Minimal PWA manifest/icons/Service Worker installed and verified;
7. iPhone/iPad Home Screen requirement handled correctly in UX;
8. Android/Chromium, Firefox and Safari support tested where available;
9. Push retry/dead endpoint behavior tested;
10. source-domain authorization cannot be bypassed through notification/deep link;
11. no valid role capability is removed by shell/navigation changes;
12. prior Cube regressions remain green;
13. generated Supabase types exact-match CI remains green;
14. Next.js typecheck/build green;
15. rendered 320/360/390/430 mobile and desktop QA completed;
16. final double review: Domain/Security/Delivery and UX/Integration/Regression.

## 22. Sequencing

Approved product sequence:

`Cube K → Cube L Notifications + Web Push + Minimal PWA → Warranty Activation → Public Warranty → Claims`

Later product cubes integrate their own domain events into Cube L's established event/recipient contract; Cube L must not predict their detailed state machines now.
