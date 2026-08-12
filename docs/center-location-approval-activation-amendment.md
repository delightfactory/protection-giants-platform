# Center Location, Network Approval & Warranty Activation — Normative Amendment

**Status:** Approved — 2026-08-12  
**Applies to:** `distribution-network-flow-spec.md`, Center Onboarding, future public Center directory, Roll Opening and Warranty Activation.  
**Precedence:** Where this amendment conflicts with the earlier wording of section 11 in `distribution-network-flow-spec.md` or the original wording of PD-006 / PD-026, this amendment is authoritative.

## 1. Why this correction exists

The earlier specification used “approved Center” too broadly and risked making Protection Giants network approval a prerequisite for Roll opening or customer Warranty Activation.

That is not the intended business rule.

A Center that has legitimately received a Roll through the platform and holds confirmed custody must not be prevented from installing that Roll and activating its Warranty merely because the Center has not yet received the Protection Giants “approved Center” badge.

The platform therefore separates three independent concepts:

1. **Operational status** — whether the Center is a registered active operational entity and its users may access the platform.
2. **Geographic location** — the Center's current physical coordinates used for the public Center map and as a prerequisite for network approval.
3. **Network approval** — a Protection Giants trust/quality designation shown publicly; it is not a custody or Warranty Activation permission.

## 2. Correct Warranty Activation eligibility

Protection Giants network approval is **not** required for Roll Opening or Warranty Activation.

A Center may perform the future Roll Opening / Warranty Activation flow when all of the relevant module rules are satisfied, including at minimum:

- the acting user is authenticated;
- the user's operational profile is active and bound to the Center;
- the Center entity itself is operationally `active`;
- the Center is the confirmed current custodian of the Roll;
- the Roll belongs to a non-voided Production Order;
- the Roll has not already entered a conflicting/terminal activation state;
- the separate Roll Opening then Warranty Activation sequence is respected.

The Center's network-approval badge is not part of this authorization predicate.

A free-text Center name, possession of a Roll serial, Transfer ID, QR image, or public Center listing is never sufficient to activate a Warranty.

## 3. Center geographic location

### 3.1 Center self-capture

An onboarded Center receives a dedicated action such as:

> **Update my location on the Protection Giants map**

The Center must be clearly instructed to perform this action while physically present at the Center premises.

For Center self-capture:

- the browser/device Geolocation capability is used;
- the Center user does not type latitude/longitude manually;
- the Center user does not drag a map pin to an arbitrary location;
- the captured latitude, longitude, reported accuracy and capture timestamp are stored;
- the UI shows the captured position for confirmation before saving;
- the initial application acceptance threshold should require a reported accuracy of **50 metres or better**;
- if the device cannot produce acceptable accuracy, the user is asked to retry from the premises with precise location enabled;
- the accuracy threshold belongs to application configuration/validation rather than an irreversible database assumption so it may be tuned if real device testing proves necessary.

This is an operational location-verification measure, not a claim that browser GPS is impossible to spoof. The audit trail and Agent/Admin approval remain the human trust layer.

### 3.2 Current Center location fields

The Center record should expose a current-location projection sufficient for fast map/list use, conceptually:

- `latitude`
- `longitude`
- `location_accuracy_m`
- `location_captured_at`
- `location_source` — `center_device | admin`
- `location_updated_by_profile_id`

Exact PostgreSQL numeric types are finalized during implementation review.

### 3.3 Location audit

Location changes must be auditable. A narrow location-history/event record should retain at minimum:

- Center ID;
- latitude/longitude;
- accuracy when supplied by the device;
- source (`center_device` or `admin`);
- acting profile ID;
- timestamp.

Changing the current location never rewrites or deletes earlier location history.

## 4. Admin location correction

Protection Giants Admin may update or correct a Center's location from the Center administration page.

Admin correction may use an administrative map/pin workflow or explicit coordinates as appropriate to the UI. Every correction is recorded as an Admin-sourced location event.

Dealer and Center users cannot use an administrative manual-coordinate override.

Country Agent does not receive arbitrary manual location-edit authority in the current scope; it may review the Center location when deciding network approval.

## 5. Network approval

### 5.1 Meaning

“Approved Center” means that Protection Giants or its authorized Country Agent has designated the Center as an approved member of the network.

It is a trust/quality/public-presentation designation.

It does **not** mean:

- the Center owns a Roll;
- the Center may bypass transfer acceptance;
- the Center may activate a Roll it does not hold;
- an unapproved Center is prohibited from activating a legitimately held Roll.

### 5.2 Who can approve

- **Admin:** may approve or revoke approval for any Center.
- **Country Agent:** may approve or revoke approval only for Centers inside that Agent's own network/country scope.
- **Dealer:** cannot grant or revoke Protection Giants network approval.
- **Center:** cannot approve itself.

This prevents a Dealer's direct commercial interest from becoming the authority that awards Protection Giants' trust badge.

### 5.3 Approval prerequisite

A Center can be approved only when:

- the Center entity is operationally `active`;
- it has a valid current geographic location recorded.

The approval control must be unavailable or clearly blocked when location is missing.

No document/KYC/checklist subsystem is introduced in this phase merely to support approval.

### 5.4 Approval data and audit

Keep operational lifecycle separate from approval.

Conceptually the Center needs a current approval projection such as:

- `approval_status` — `unapproved | approved`;
- `approved_at`;
- `approved_by_profile_id`.

Approval/revocation must also be represented in immutable audit events containing Center, action, actor and timestamp. Revocation does not suspend the Center and does not remove its custody.

### 5.5 Location change after approval

Because approval is attached to a real physical Center location, a change to the Center's current location must not silently retain the previous approval.

Any saved location change after approval resets the current approval to `unapproved` and records the change in the approval audit. Admin or the responsible Agent may immediately re-approve after reviewing the new location.

This rule prevents an approved Center from moving its public pin to another premises while retaining an approval that was granted to the old location.

## 6. Public Center directory and map

The public Protection Giants site should include a Center directory/map built from controlled public data rather than exposing operational tables directly.

Public behavior:

- only operationally `active` Centers are eligible for public display;
- map pins require a valid current geographic location;
- both ordinary registered Centers and approved Centers may appear;
- approved Centers receive a clear visual badge/pin state such as **Approved Center**;
- ordinary Centers appear as **Registered Center** or equivalent wording;
- suspended Centers are not published;
- absence of network approval does not imply the Center is fraudulent or unable to activate a legitimately held Roll;
- public responses expose only the fields deliberately intended for Center discovery, not private Auth or internal network data.

The implementation may use a narrow public view/RPC/API projection. It must not grant anonymous broad SELECT access to the operational Center table merely to render the map.

## 7. Center dashboard behavior

An active Center should be able to see from its dashboard:

- its Center identity;
- current Transfer ID / Transfer QR;
- current location state and last capture time;
- action to update location from the premises;
- current network-approval state;
- explanatory text that approval is a Protection Giants trust badge and is separate from Roll custody/activation eligibility.

The Center does not control its own approval switch.

## 8. Admin / Agent Center detail behavior

### Admin Center detail

Admin can:

- inspect Center identity and hierarchy;
- inspect current location and location history;
- manually correct location;
- approve/revoke network approval;
- inspect approval history;
- retain existing operational lifecycle controls.

### Agent Center detail

For Centers in the Agent's own network, Agent can:

- inspect Center identity and current location;
- approve/revoke network approval;
- inspect relevant approval state/history;
- use only the Center-management permissions already allowed by the Network Foundation specification.

Agent cannot approve another Agent's Center.

## 9. Impact on the current implementation sequence

The agreed development order remains intact, with the third cube widened only within the Center boundary:

1. **Agent & Network Foundation**
2. **Transfer Party & Transfer ID**
3. **Center Onboarding + Center Location & Network Approval + Public Center Map**
4. **Roll Custody & Transfers**

This is not a reason to introduce Activation or Warranty code early. The third cube establishes Center identity, location, public representation and network-approval semantics; the future Activation cube simply consumes the already-set rule that network approval is not an activation gate.

## 10. Non-goals

This amendment does not introduce:

- public operational signup;
- KYC/document-verification workflows;
- Dealer-issued network approval;
- GPS anti-spoofing infrastructure;
- background continuous location tracking;
- customer tracking;
- a requirement that Warranty Activation occur only at approved Centers;
- any change to Product or Production identity.
