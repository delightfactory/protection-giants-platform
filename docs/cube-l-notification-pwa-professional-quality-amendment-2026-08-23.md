# Cube L — Professional Notification + PWA Quality Amendment

**Date:** 2026-08-23  
**Status:** APPROVED implementation-quality amendment for Cube L.  
**Applies to:** `feature/cube-l-notifications-pwa` / PR #74.  
**Purpose:** Raise the implementation and acceptance bar for Notifications, Web Push and PWA update behavior without expanding Cube L into unrelated product scope.

This amendment supplements the frozen Cube L specification and QA contract. It does not replace the frozen business/event catalog, recipient model, RLS rules or Product roadmap.

## 1. Product-quality principle

Cube L must behave like a mature operational attention system, not a collection of browser APIs.

The system must preserve four distinct concepts:

1. **Durable Inbox truth** — the canonical per-Profile record that an operational event was surfaced.
2. **Attention policy** — whether that event is important/time-sensitive enough to justify external Push.
3. **Push delivery** — best-effort standards-based transport to a device; never business state.
4. **PWA lifecycle/update state** — whether an installed/open client is running the latest application/service-worker code.

Do not mix these responsibilities. A Push failure must not alter Inbox/business state. A PWA update must not be delivered as a fake business notification. A read notification must not imply task completion.

## 2. Notification relevance and noise control

External Push is reserved for material, timely operational events. An event being present in the durable Inbox does not automatically mean it deserves an OS-level Push.

Before an event becomes Push-eligible the catalog must answer:

- Does the recipient need to know while the app is closed/backgrounded?
- Is the information time-sensitive or action-relevant?
- Does the Push help the user act, or merely repeat information already visible in the product?
- Is the actor being notified about their own synchronous success unnecessarily?

Avoid notification inflation. The product should be assistive, not disruptive.

## 3. Permission UX contract

Never request notification permission automatically on initial page/login load.

Required flow:

1. Explain the concrete operational value in product language.
2. Show current-device capability/state.
3. Let the user explicitly choose to enable notifications.
4. Invoke the browser permission request directly from that user gesture.
5. If denied, stop prompting and provide clear recovery instructions in Settings.
6. Keep the durable Inbox and all operational workflows fully usable when Push is denied or unsupported.

Use capability/feature detection as the primary behavior gate. Avoid browser-name branching except where platform-specific human guidance is genuinely necessary.

## 4. Persistent notification behavior

Background Push must be handled by the root Service Worker and displayed using persistent Notifications API behavior.

- Use `ServiceWorkerRegistration.showNotification()`.
- Keep lock-screen-visible content minimal and privacy-safe.
- Do not rely on silent/invisible Push as an application mechanism.
- On Apple platforms, a received Web Push must result in a visible user notification; do not create silent Push behavior.
- Notification click must focus an existing same-origin app client when practical, otherwise open a validated same-origin relative action path.
- The deep link always re-enters ordinary authentication, route authorization, RLS and domain checks.

## 5. Delivery semantics and protocol quality

Use standards-based Web Push with Push API, Notifications API, Service Worker, Web Push encryption/protocol and VAPID.

Delivery implementation must deliberately handle:

- per-device subscriptions; one Profile may have multiple devices;
- endpoint/key secrecy;
- CSRF/XSRF protection around authenticated subscription registration/removal endpoints;
- bounded payload size and privacy-safe payload content;
- meaningful TTL selection so stale operational alerts do not arrive long after they have value;
- meaningful Urgency selection based on the frozen attention/event policy rather than always sending `high`;
- 404/410 endpoint expiry as a dead subscription signal;
- transient retry without duplicate durable notifications;
- stable notification tags to avoid duplicate OS displays caused by transport retry.

Do not generically coalesce distinct business events. Push `Topic`/coalescing may only be used when the event catalog explicitly proves that older undelivered events are safely superseded by a newer one.

## 6. Subscription repair and device lifecycle

Treat Push subscriptions as device/browser state that may become stale independently of the user account.

Settings/app entry must be able to reconcile:

- permission granted but no subscription;
- stored subscription missing from browser;
- browser subscription changed;
- server endpoint disabled after 404/410;
- device unsubscribed while another device remains active.

Repair must be idempotent. Never let one device remove another device's subscription.

## 7. Notification Inbox UX standard

The Inbox must be mobile-first and operationally scannable.

Required design characteristics:

- newest-first with clear unread distinction that does not rely on color alone;
- calm, bounded visual treatment for `info`, `action_required`, `warning`;
- clear title, concise body, device-local time and source context;
- one obvious primary deep-link/action where applicable;
- touch targets meeting the existing platform mobile contract;
- Arabic/RTL-first composition with LTR isolation for identifiers/serials;
- accessible names/focus states/semantic unread state;
- professional empty/loading/error states;
- unread badge that remains layout-safe at large counts;
- no wide-table dependency on mobile.

The notification UI should communicate importance without turning every event into an alarm.

## 8. iPhone/iPad PWA and Web Push contract

Web Push on iPhone/iPad requires the web app to be added to the Home Screen on supported iOS/iPadOS versions.

Cube L must therefore provide a first-class state for Apple mobile users who are browsing normally but need Home Screen installation before Push can work.

Requirements:

- explain the Home Screen requirement clearly;
- do not show a knowingly non-functional enable control;
- permission still requires an explicit user gesture;
- support app icon badging as progressive enhancement where available;
- regular browser usage remains valid even if the user never installs the PWA.

## 9. PWA update lifecycle — explicit professional contract

The PWA must have an intentional application-update experience. Merely registering a Service Worker is not sufficient.

### 9.1 Stable identities

- Keep a stable Service Worker URL and root scope.
- Keep a stable Web App Manifest URL/identity and stable manifest `id`.
- Do not rename/move these assets casually as a release mechanism.

### 9.2 Update checks must not block app startup

Do not wait for an update check before rendering the application.

The app may request a Service Worker update check after the current UI is usable and at bounded lifecycle moments such as app start/foreground/focus. Update checks must not degrade Core Web Vitals or ordinary navigation.

### 9.3 Do not blindly force `skipWaiting`

A newly installed Service Worker normally enters `waiting` while an older worker still controls open clients. This protects open pages from version skew.

Do **not** unconditionally call `skipWaiting()` during install and force-reload active users. That can create mixed old-page/new-worker behavior and can interrupt an operational workflow.

### 9.4 User-aware update availability flow

When a new Service Worker is installed and waiting while the application is open:

1. expose a small in-app state such as **"تحديث جديد متاح"**;
2. do not interrupt the current operation or form;
3. give the user a clear **"تحديث الآن"** action;
4. after the explicit action, message the waiting worker to activate (`skipWaiting` path);
5. wait for `controllerchange`;
6. reload the application exactly once into the new version.

If no old clients remain, allow the normal Service Worker lifecycle to activate the new version naturally without requiring user interaction.

### 9.5 Multi-tab coordination

Multiple open tabs/windows must not produce competing update prompts/reloads.

Coordinate update state through standard browser messaging (`postMessage`, clients messaging, and/or `BroadcastChannel` where appropriate) so:

- all tabs understand an update is waiting;
- one user action can safely advance the update;
- each controlled client reloads at most once;
- no reload loop is possible.

### 9.6 Operational safety

Never force a normal update reload in the middle of an in-progress operational action merely because a new build exists.

Cube L V1 should prefer a visible deferred update affordance. A future emergency/mandatory-update policy, if ever needed, requires an explicit Product decision rather than being hidden inside Service Worker code.

### 9.7 No speculative cache complexity in V1

Cube L does not introduce cache-first navigation, offline business data, background business mutations, or generic offline sync.

Because V1 has no general fetch cache, application update correctness must not depend on stale app-shell cache invalidation. If caching is added in a future Product decision, cache names/versioning and old-cache cleanup become part of that future acceptance contract.

## 10. PWA installation UX

Installation must be explained at a contextually useful moment rather than nagging users on first visit.

- Use the browser installation prompt only when the platform exposes it.
- Keep manual Add-to-Home-Screen guidance for Apple platforms where required.
- Explain why installation helps (fast app-like access, Push availability where supported), not protocol jargon.
- Dismissal must not block normal browser use.

## 11. Update/PWA acceptance additions

Cube L cannot close until hosted/browser evidence covers the update lifecycle in addition to installability/Push.

Add acceptance cases for:

- old Service Worker controlling an open client + new worker becomes waiting;
- update-available UI appears without blocking the current page;
- user accepts update → waiting worker activates → one reload → new controller active;
- user defers update → current workflow continues normally;
- multiple open tabs do not create reload loops or conflicting state;
- reopening after all old clients close activates the new worker naturally;
- update check failure/offline state does not break the app;
- current version remains usable while a new worker is waiting;
- iPhone/iPad Home Screen app remains functional across a deployed web update;
- manifest/service-worker identity remains stable across ordinary releases.

## 12. Verification baseline

Before Cube L GO, review against current authoritative browser/platform guidance, with priority on:

- MDN Push API / Notifications API / Service Worker guidance;
- web.dev PWA update/service-worker lifecycle/permissions guidance;
- Apple Web Push documentation for Safari and iOS/iPadOS Home Screen web apps;
- current browser behavior proven in hosted real-device acceptance, not documentation alone.

The implementation may use a helper library only when it reduces risk without becoming the platform contract. The canonical behavior remains standards-based and testable without vendor lock-in.

## 13. Scope guardrail

This quality amendment intentionally raises implementation quality while preserving the project's incremental-development principle.

It does **not** add:

- generic notification rules;
- email/SMS/WhatsApp channels;
- category preference systems in V1;
- Supabase Realtime as a requirement;
- offline business synchronization;
- a native mobile application;
- a vendor-specific Push architecture.
