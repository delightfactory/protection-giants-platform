# Center Location & Network Approval — Implementation Impact Review

**Status:** Normative implementation companion — no code changes in this branch  
**Date:** 2026-08-12

## 1. Review conclusion

The approved Center location / network-approval correction is compatible with the current platform and does not require reopening Product, Production, Transfer identity, or Auth architecture.

It does require a controlled extension of the Installation Center cube during the already-approved Center Onboarding phase.

The change should be implemented as append-only migrations and narrow Center UI/RLS/server-action additions.

## 2. Current repository facts reviewed

The current `installation_centers` entity already owns Center identity, parent Dealer, country, city and operational lifecycle. It does not currently contain geographic coordinates or a network-approval state.

The current project has no mapping/geolocation library dependency. `package.json` currently contains only Next/React/Supabase runtime dependencies. Therefore the map implementation must be selected deliberately rather than inheriting an existing map stack.

The application already has a public route group under `app/(public)`, so the future public Center directory can be placed in the existing public application structure instead of creating a separate frontend.

The existing security model intentionally keeps operational tables behind explicit grants/RLS and disables accidental new Data API exposure. The public map must respect that design.

## 3. Installation Center schema extension

The Center table should gain only current-state fields needed for operational reads and map rendering.

Recommended current projection:

- `latitude` nullable;
- `longitude` nullable;
- `location_accuracy_m` nullable;
- `location_captured_at` nullable;
- `location_source` nullable or constrained to `center_device | admin` when a location exists;
- `location_updated_by_profile_id` nullable FK to `profiles` with delete behavior chosen to preserve history;
- `approval_status` constrained to `unapproved | approved`, default `unapproved`;
- `approved_at` nullable;
- `approved_by_profile_id` nullable FK to `profiles`.

Coordinate and approval consistency should be database-enforced where practical. For example, `approved` must not be valid without a current location.

Do not overload `status = active | suspended`; operational lifecycle and network approval remain separate.

## 4. Audit records

Two narrow append-only event streams are justified because both location and network approval may affect public trust and require historical accountability.

### 4.1 Center location events

A `center_location_events`-style table should record every accepted location value with:

- event ID;
- Center ID;
- latitude/longitude;
- reported accuracy when applicable;
- source;
- actor profile ID;
- event timestamp.

The Center table stores only the current projection.

### 4.2 Center approval events

A `center_approval_events`-style table should record:

- event ID;
- Center ID;
- action `approved | revoked | invalidated_by_location_change`;
- actor profile ID where applicable;
- event timestamp.

This avoids losing who granted/revoked approval when the current approval projection changes.

## 5. Center self-location action

The Center dashboard action must be authenticated and Center-scoped.

Expected flow:

1. explain that the user must be physically at the Center premises;
2. request device/browser location permission;
3. request a high-accuracy location;
4. reject/ask to retry when reported accuracy is worse than the initial 50m application threshold;
5. show the captured location to the user for confirmation;
6. server verifies the acting profile is an active user of the same Center;
7. save the location projection and append the audit event atomically.

The browser-provided Center location values are untrusted input and must still receive numeric/range validation server-side.

Center users must not submit a target Center ID that allows them to update another Center.

No continuous/background tracking is introduced.

## 6. Location change and approval invalidation

If the Center is currently approved and its saved location changes, one transaction must:

- save the new current location;
- append the location event;
- set current approval to `unapproved`;
- clear the current approved projection as appropriate;
- append `invalidated_by_location_change` approval event.

This prevents a race where a new location is visible publicly with a stale approval badge.

The rule applies whether the new location came from the Center or Admin. Admin may then re-approve immediately after confirming the new location.

## 7. Admin location action

Admin Center detail receives an explicit location-management section.

Admin may update a Center's current position manually through the selected map UI / coordinate workflow. The action must:

- require active Admin profile;
- validate coordinate ranges;
- record source `admin`;
- append audit history;
- apply the same approval invalidation rule when coordinates change.

This is separate from normal Center core editing so location/audit behavior cannot be bypassed through a generic update form.

## 8. Network approval authorization

Approval is a dedicated server action with a database/RLS boundary matching the approved business rule.

Allowed actors:

- Admin for any Center;
- active Agent only when the Center resolves into that Agent's network.

Denied actors:

- Dealer;
- Center;
- Agent from another network.

Approval requires Center `status = active` and a valid current location.

Revocation never changes Center operational status and never changes Roll custody.

The UI toggle is only a presentation of this secured action; hiding the toggle is not the authorization boundary.

## 9. Center read visibility impact

Current operational entity RLS will need to be extended consistently with the Network Foundation:

- Center reads its own location/approval state;
- Dealer may read the Center location/approval state for Centers it manages;
- Agent may read location/approval state for Centers in its network;
- Admin reads all;
- no ordinary authenticated user receives a global Center directory through operational-table SELECT.

Transfer recipient resolution remains separate and still returns only minimum transfer verification data.

## 10. Public Center directory/map boundary

The public website requirement should be completed inside the Center cube instead of leaving only unused database fields.

Recommended public projection returns only deliberate discovery fields, for example:

- Center public identifier/code if desired;
- display name;
- city/country;
- latitude/longitude;
- `is_approved` or equivalent derived public state.

Eligibility:

- Center operational status must be `active`;
- a current valid location must exist.

Approved and ordinary registered Centers both appear, with visually distinct states.

Do not expose:

- user/profile IDs;
- Auth emails;
- private phone data unless a later explicit public-contact decision approves it;
- Transfer ID;
- internal Agent/Dealer relationships unless intentionally needed for public display;
- location audit history.

Because this repository intentionally disables automatic table exposure and anonymous grants, use a narrow public view/RPC/server data path rather than granting anon broad SELECT on `installation_centers`.

## 11. Map technology impact

No map package exists today, so implementation should not introduce a large mapping stack prematurely.

The functional requirement is small:

- show a map with Center pins;
- distinguish approved vs registered pins;
- allow Admin to correct a location;
- show Center's captured point for confirmation.

Select the lightest maintained solution compatible with Next.js/client rendering and the chosen tile/provider terms at implementation time. The data model must remain provider-agnostic: latitude/longitude are platform data, not vendor-specific map objects.

Browser Geolocation for Center self-capture requires no application mapping SDK by itself; the map library is only for visualization/selection.

## 12. Center Onboarding phase scope after correction

The third approved development cube becomes:

**Center Onboarding + Location & Network Approval + Public Center Directory/Map**

Functional completion for that cube means:

- Center entity can exist before account;
- controlled first-user invitation works;
- Center can set/update its own device location;
- Admin can correct location;
- location history is preserved;
- Admin/Agent approval works with correct scope;
- location changes invalidate approval;
- approval history is preserved;
- Center dashboard shows location/approval state;
- public Center page/map shows active located Centers and distinguishes approved vs registered;
- none of these actions weaken the trusted Auth provisioning or operational RLS model.

## 13. Activation impact

No Activation code is implemented in this phase.

The future Activation cube must consume this fixed authorization rule:

`authenticated active Center + confirmed current Roll custody + eligible Roll/production/activation state`

Network approval is not included in that predicate.

This avoids coupling commercial trust designation to legal/physical Roll custody.

## 14. Regression review required during implementation

Before the Center cube is closed, regression must cover at minimum:

- existing Admin Center create/edit/lifecycle behavior remains valid;
- Center users cannot edit other Centers' locations;
- Dealer cannot grant approval;
- Agent cannot approve outside its network;
- approval blocked without a location;
- location update invalidates approval atomically;
- suspended Center cannot use operational Center actions and is absent from the public map;
- unapproved active Center with location is still present publicly as registered;
- public projection leaks no private operational/Auth fields;
- existing User/Auth provisioning regression suite remains green;
- database types, fresh migrations, TypeScript and production build remain green.
