# Public Center Directory & Map — Implementation Contract

**Status:** Code complete; combined B+C local/browser acceptance passed; post-retarget CI pending  
**Date:** 2026-08-13  
**Roadmap:** `docs/gap-closure-roadmap.md` — Cube C only

## Purpose

Expose a deliberately narrow public discovery surface for active located Protection Giants installation Centers without exposing operational or identity data.

Cube B has been accepted and merged into `main`. Cube C has been retargeted to updated `main`; the remaining gate before merge consideration is the final post-retarget CI run plus explicit merge approval.

## Public projection

The public Data API object exposes only:

- Center display name;
- city;
- country code;
- latitude;
- longitude;
- classification: `registered | approved`.

Rows exist only for operationally active Centers with a complete current location. `approved` reflects the current Cube B approval projection; every other eligible Center is `registered`.

The public object deliberately excludes internal Center UUID/code, Transfer ID, Agent/Dealer hierarchy, Auth/Profile IDs, email/account data, approval actor/time, location audit metadata, approval history and onboarding data.

## Database boundary

Public discovery reads an explicit narrow database view. Anonymous users do not receive SELECT on `installation_centers`.

The view is a deliberate privileged projection over the operational table so anonymous reads can see the six approved public fields while base-table RLS/grants remain closed. Its column set and row eligibility are regression-tested from the anonymous Data API.

## Public experience

`/centers` provides a mobile-first Arabic discovery experience with:

- search by Center name or city;
- filters for all / approved / registered;
- synchronized result count, list and map markers;
- clear visual distinction between Registered and Approved;
- graceful no-results and map-load failure states;
- no authentication requirement.

The directory does not publish phone/email/contact data in this cube because no such public-contact contract has been approved.

## Map implementation

Use MapLibre GL JS 5.16.0 from its documented UNPKG distribution, loaded only by the public Center directory client component. The application supplies a minimal raster-style definition so the map renderer is independent of Center business data and the tile provider can be replaced without schema changes.

The initial raster source uses OpenStreetMap standard tiles with visible attribution. The application does not implement offline download, bulk tile prefetch or tile caching behavior.

Map controls remain intentionally light. Markers are not draggable and expose only the same safe public name/city/classification already present in the list.

## Security/privacy rules

- no public mutation path;
- no anonymous operational-table SELECT grant;
- no internal IDs passed into public page/client props;
- no Transfer/hierarchy/Auth/Profile/audit fields in public responses;
- suspended or unlocated Centers never appear;
- approval remains informational and is never reused as a custody, Roll Opening or Warranty Activation gate.

## Verification contract

Dedicated regression coverage proves at minimum:

1. active + located + approved Center appears as `approved`;
2. active + located + unapproved Center appears as `registered`;
3. suspended Center is excluded;
4. active Center without location is excluded;
5. location change that invalidates approval changes the public classification to `registered`;
6. re-approval changes it back to `approved`;
7. anonymous/authenticated public reads expose exactly six approved columns;
8. anonymous direct read of `installation_centers` remains denied;
9. private hierarchy fields cannot be selected from the public object;
10. generated DB types remain canonical;
11. TypeScript and production build pass;
12. combined B+C local/browser acceptance covers map/list/search/filter/mobile and B→C state propagation.

## Explicit non-goals

Cube C does not implement Center detail profiles, public contact publishing, directions/routing, user-distance ranking, reviews/ratings, Agent/Dealer public directories, map editing, geolocation tracking, custody, Transfers, Roll Opening, Activation or Warranty.

## Definition of Done

Cube C is complete only when the public projection, privacy boundary, Registered/Approved classification, mobile map/list UX, failure states, permanent database regression, generated types, TypeScript, production build, combined B+C local acceptance, two review passes, and final post-retarget CI are complete. It remains unmerged until explicit user approval is given.