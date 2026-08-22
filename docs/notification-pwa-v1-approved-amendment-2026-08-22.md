# Protection Giants — Notification V1 + PWA Approved Amendment

**Date:** 2026-08-22  
**Branch:** `study/notification-foundation`  
**Status:** Product-owner-approved planning decision. This records scope for the future frozen Notification Product Cube; it does not authorize implementation before Cube K closure.

## Approved decision

The Notification Product Cube V1 will include **Minimal PWA Foundation as part of the same Cube**, together with:

- durable role-aware In-app Inbox;
- standards-based Web Push;
- the minimum installable/Home-Screen web-app foundation required for reliable push support across supported devices, including iPhone/iPad Home Screen web apps.

The PWA foundation is therefore **not** a separate Product Cube and is **not** part of Platform Experience Harmonization.

## V1 PWA boundary

The Notification Cube owns only the technical PWA capability required to make the platform installable and to support standards-based Web Push correctly:

- web app manifest;
- installable app identity and required metadata;
- Service Worker registration/lifecycle needed by Push/PWA;
- Home Screen/install compatibility required by supported platforms;
- safe notification-click navigation back into authenticated platform routes;
- capability detection and clear install/push guidance;
- HTTPS/secure-context production assumptions;
- rendered verification on supported mobile/desktop browser families.

The Service Worker must remain bounded. V1 does **not** introduce speculative offline data synchronization, offline business mutations, background domain processing, or a generic caching platform unless a later explicit business requirement justifies it.

## Branding boundary

Final Protection Giants visual PWA assets do not block the technical foundation.

During development, valid temporary application icons/metadata may be used only as implementation placeholders. When the official company logo and final branding assets are supplied near product completion, they may replace:

- install icons;
- maskable icons;
- splash/app presentation assets where applicable;
- final app name/short-name presentation if required by the approved brand system.

Replacing these visual assets must not require redesigning the Notification, Push, subscription, Service Worker, or PWA architecture.

## Cross-platform objective

The implementation spec must target the current standards-based browser capability rather than vendor-specific application logic.

The desired V1 experience is:

- Android and compatible desktop browsers: installable web app where supported + Web Push;
- iPhone/iPad: Home Screen web-app installation path + Web Push on supported iOS/iPadOS versions;
- unsupported/denied Push environments: the authenticated In-app Inbox remains fully functional as the durable fallback.

No user is denied normal platform use because installation or Push permission is unavailable or declined.

## Governance

This amendment is part of the Product Development track.

Sequence remains:

`Cube K closure → Notification Foundation + Web Push + Minimal PWA → Warranty Activation → Public Warranty → Claims`

Platform Experience Harmonization may later improve the install prompt, notification settings presentation, role Home badges and related discoverability, but it must not own or redefine the PWA/Push capability itself.
