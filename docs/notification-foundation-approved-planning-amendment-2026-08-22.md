# Protection Giants — Notification Foundation Approved Planning Amendment

**Date:** 2026-08-22  
**Branch:** `study/notification-foundation`  
**Status:** Product-owner-approved planning direction. This amendment authorizes planning/specification work, not implementation or merge.

## 1. Approved product direction

The role-aware Notification capability is approved as a **Product Development capability**, not as part of Platform Experience Harmonization.

It must remain separate from UI/UX harmonization work and follow the normal Product Cube governance when its implementation spec is frozen.

The approved V1 delivery scope is now **In-app Inbox + standards-based Web Push**. This supersedes the earlier wording in this amendment that treated Web Push as a later optional external channel.

## 2. Approved roadmap placement

Subject to normal Cube closure and fresh-main sequencing, the intended order is:

```text
Cube K — Pre-install Roll Issue Reporting
        ↓
Notification Foundation — role-aware Inbox + Web Push
        ↓
Warranty Activation
        ↓
Public Warranty access / verification
        ↓
Claims / replacement / reinstall
```

This placement is approved because the platform already contains several asynchronous cross-role handoffs and because future Warranty/Claims lifecycles should integrate into one established notification contract instead of inventing ad hoc alert mechanisms.

Cube K must still be fully closed before Notification implementation begins.

## 3. Approved V1 foundation boundary

The first Notification Product Cube should provide one complete notification capability with two complementary delivery surfaces.

### 3.1 Durable in-app Inbox

At minimum:

- durable notification persistence;
- role/entity-aware recipient resolution;
- one notification recipient record per active Profile at event time;
- independent read/unread state per Profile;
- deterministic deduplication/idempotency by source event + recipient + event type;
- explicit event catalog/integrations rather than a generic rules engine;
- notification Inbox inside authenticated Operations;
- unread indicator/count in the authenticated shell;
- newest-first history;
- actionable deep links where appropriate;
- `info | action_required | warning` or another equally bounded attention model;
- mark one read and mark all visible notifications read;
- RLS/security and active-profile/entity checks;
- permanent cross-role regression coverage;
- mobile-first rendered UX quality.

Notification read state remains independent from the underlying business task state.

### 3.2 Standards-based Web Push

V1 also owns Web Push so material notifications can reach opted-in users while the platform is closed or in the background.

The implementation direction is the cross-browser standards stack:

- Push API;
- Notifications API;
- Service Worker;
- Web Push encryption/protocol;
- VAPID application-server identity;
- feature detection rather than browser-name branching;
- HTTPS in hosted environments.

Do not make Firebase Cloud Messaging, APNs-specific application code, or any single browser vendor service the platform's canonical notification contract. Browser push services remain implementation endpoints behind the standards-based subscription object.

The platform must store each browser/device subscription separately from the durable in-app notification so one Profile can receive Web Push on multiple devices while keeping one independent Inbox/read state per Profile notification.

## 4. Browser / device compatibility boundary

The goal is broad support across modern browsers and operating systems that implement the standards, including current Chromium-based browsers, Firefox and Safari where Web Push is available.

The application must use capability detection and retain the Inbox as the guaranteed fallback when Push cannot be enabled.

### Apple iPhone / iPad requirement

On iOS/iPadOS, standards-based Web Push is supported for Home Screen web apps on iOS/iPadOS 16.4 or later. Therefore **true iPhone/iPad Web Push in V1 requires a minimal installable/Home-Screen web-app foundation in the same capability**.

This means the technical PWA prerequisites for installability/push cannot be postponed entirely until the visual branding phase at the end of the project.

V1 should therefore include the minimum technical PWA shell needed for correct Home Screen behavior and Web Push, including an appropriate web app manifest/service-worker relationship and installable app identity.

Final Protection Giants branding, final production icons and other visual PWA polish may be replaced/finalized later when the official company logo/assets are supplied, without changing the notification architecture.

The UI must explain the iPhone requirement clearly instead of showing an enable-push action that cannot succeed from an ordinary browser tab.

## 5. Permission / subscription UX

Push permission must never be requested automatically on first page load.

V1 should:

- explain the value of notifications first;
- request browser permission only after a clear user gesture;
- distinguish `default`, `granted`, `denied`, unsupported and iOS-not-installed states;
- provide a visible notification-settings surface;
- never block normal platform use if Push permission is denied;
- keep the authenticated Inbox available regardless of Push state;
- provide clear iPhone Home Screen installation guidance where needed;
- avoid repetitive permission prompts after denial.

## 6. Push subscription model

The frozen spec should define a bounded subscription table/model linked to the authenticated Profile, with fields equivalent to:

- subscription id;
- profile id;
- endpoint;
- client public encryption key (`p256dh`);
- auth secret;
- created/updated timestamps;
- last-success / last-failure metadata where useful;
- active/disabled or revoked state;
- optional user-agent/device label only if useful for account UX, not for authorization.

Important rules:

- one Profile may own multiple active subscriptions;
- endpoint/key material is sensitive operational data and must not be exposed to unrelated users;
- endpoint uniqueness prevents duplicate device delivery;
- expired/gone endpoints returned by the push service must be disabled/removed safely;
- subscription changes/re-subscription must be idempotent;
- a Push subscription never grants access to application data.

## 7. Delivery architecture

Business transactions and Web Push delivery must be separated.

Approved direction:

1. authoritative domain transition occurs;
2. durable in-app notification is materialized idempotently;
3. a delivery/outbox record makes eligible Push delivery durable;
4. a bounded worker sends Web Push to the recipient's active subscriptions;
5. delivery success/failure is recorded and retryable according to the frozen limits;
6. permanent endpoint failures deactivate the subscription.

A failure in browser push infrastructure must **never roll back or corrupt** Transfer, Receipt, Center, Roll, Cube K, Warranty or Claim business state.

Do not send Web Push directly as an indispensable side effect inside the source business transaction.

## 8. Payload/privacy rules

Push notifications appear outside the authenticated application and may be visible on a lock screen. Therefore Push payloads must be intentionally narrower than the underlying domain record.

Rules:

- no secrets, tokens, private customer data or authorization-bearing identifiers;
- no hidden Cube K quality details to Agent/Dealer;
- title/body contain only the minimum role-appropriate operational context;
- the action URL/deep link is not an authorization token;
- opening the notification always re-enters normal authentication/route/RLS checks;
- if the user no longer has access, the application fails safely without leaking detail.

## 9. Service Worker behavior

The Service Worker must own persistent Push display and click handling.

At minimum:

- handle the `push` event;
- display a system notification for received Push messages;
- handle notification click and focus/navigate to the intended authenticated route;
- use safe application-origin URLs only;
- support subscription refresh/change where the browser exposes it;
- avoid invisible/silent Push behavior as a platform dependency;
- update safely without breaking the rest of the application shell.

The Service Worker must remain bounded to required PWA/Push behavior and must not become a speculative offline-data synchronization engine.

## 10. Approved initial event integration direction

The V1 event catalog should be finalized against merged domain contracts, with current intended coverage including:

- incoming Transfer requiring recipient action;
- Transfer rejection / partial receipt / completion / material resolution changes to the sender side;
- Center onboarding completion and exceptional onboarding-review state where another existing Profile must act;
- Center approval/revocation/invalidation notifications to Center users where appropriate;
- opened-Roll Recovery completion where a previously responsible Center needs to know custody changed;
- Cube K new submitted issue to Admin Profiles;
- Cube K final decision (`cleared_for_use`, `return_required`, `reported_in_error`) to the reporting Center Profiles;
- later Warranty/Claims events defined by their own future Product Cube specs.

Normal synchronous success to the same actor should not be duplicated as notification noise unless a real cross-session/business need is identified.

Not every Inbox event must necessarily be pushed. The frozen catalog should explicitly mark which event types are Push-eligible so V1 does not become noisy.

## 11. Architectural rules retained

### Notifications never grant authorization

A notification or deep link cannot bypass the source domain's route, RLS, custody, scope or lifecycle rules.

### Explicit integrations only

Do not build a generic notification rules/workflow engine. Each source domain explicitly defines which authoritative event creates which notification and who the intended recipient responsibility is.

### Domain truth remains authoritative

Notification materialization must be downstream of durable domain transitions/events where available. Notification logic must not become the owner of Transfer, Center, Roll, Issue, Warranty or Claim state.

### Per-Profile Inbox state

When multiple active Profiles represent the same operational entity, each receives an independent notification copy and independent `read_at` state. Each Profile may independently have zero, one or several Web Push device subscriptions.

### No privilege leakage

A role must not receive notification content that exposes information it cannot otherwise access. In particular, Agent/Dealer network position does not grant Cube K quality-review visibility.

## 12. Relationship to Platform Experience Harmonization

Platform Experience Harmonization may later consume the Notification foundation for:

- unread badges;
- role Home attention links;
- navigation affordances;
- cross-screen discoverability;
- role-specific notification presentation;
- the install/push enablement entry point and guidance.

It does not own the Notification schema, recipient model, event catalog, security or delivery behavior.

The UX track must continue to avoid Cube naming and must not use Notification work to alter the established Product Cube sequence implicitly.

## 13. Decisions deliberately still open before frozen implementation spec

The following remain to be resolved during the Notification specification step:

1. notification history retention policy;
2. whether near-live Inbox/badge updates use Supabase Realtime or another minimal refresh strategy;
3. exact pagination/batch-size limits;
4. exact event-by-event message copy, action URLs and Push-eligible flag;
5. exact Admin fan-out behavior for Company-level notifications if a future event requires narrower responsibility;
6. Push retry count/backoff and delivery-log retention;
7. subscription/device-management UX details;
8. final production PWA icons/branding once official company assets are supplied;
9. whether email becomes a later approved delivery channel.

These open points do not reopen the approved decision that **Web Push is part of V1**.

## 14. Compatibility references used for this planning amendment

The implementation spec should continue to verify current browser behavior when development begins. Planning was checked against:

- Apple Developer — Sending web push notifications in web apps and browsers;
- WebKit — Web Push for Web Apps on iOS and iPadOS;
- MDN — Push API / PushManager / Service Worker `push` event / Notifications API.

Current relevant compatibility facts at this planning date:

- Push API is broadly available across modern browser families;
- Push requires Service Workers and secure contexts;
- browser permission must be user-controlled;
- iOS/iPadOS Web Push requires the web app to be added to the Home Screen and is supported from iOS/iPadOS 16.4+;
- Safari expects received pushes to result in visible notifications rather than silent background Push use.

## 15. Governance and sequencing

- This amendment records product-owner approval of **In-app + Web Push V1**.
- It supersedes the earlier in-app-only channel boundary in this same document's previous revision.
- It does not merge Cube K or authorize Notification implementation immediately.
- Cube K remains under its existing closure/review process.
- After Cube K closure, Notification Foundation moves from study to a frozen Product Cube specification from fresh `main`.
- The minimal PWA technical foundation required for iPhone/iPad Push belongs to the Notification Product capability; final visual PWA branding/polish may remain a later presentation step.
- No UI/UX harmonization branch may implement the Notification engine as a cosmetic/navigation change.
