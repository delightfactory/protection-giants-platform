# Installation Center Onboarding

## Status

**Promoted to the current Distribution Network foundation — 2026-08-12.**

This document originally recorded Center Onboarding as a deferred cube. That timing has been superseded by the approved recipient-acceptance flow for Roll transfers.

The current source of truth for implementation scope, Auth integration, permissions, invitation lifecycle, and downstream Transfer contracts is:

- `docs/distribution-network-flow-spec.md`

## Why the timing changed

A Transfer will not move confirmed custody until the recipient accepts it.

A newly created Installation Center can therefore be a real operational entity and pending transfer recipient before it has any user account, but it needs a secure onboarding path before it can accept the Transfer itself.

Center Onboarding is consequently a prerequisite for a complete Transfer flow rather than an optional later convenience.

## Core invariant preserved

An Installation Center is an operational **entity** independent from its user accounts.

A Roll is transferred to / held by the Center entity through its operational party identity, never by an individual Auth user.

Therefore:

- a Center may exist before it has any platform user;
- a Center receives its stable Transfer ID when the entity is created;
- a Center may be named as a pending transfer recipient before onboarding is complete;
- one or more users may later represent the Center without changing Roll custody history;
- replacing, suspending, or adding users never rewrites historical transfers;
- permanent Roll Serial, ERP Serial, Product SKU, Lot number, Activation identifier, Warranty identifier, and Center Transfer ID remain separate concepts.

## Approved onboarding boundary

Invitation-based onboarding applies to **Installation Centers only**.

- Protection Giants/Admin creates and codes Country Agents.
- Country Agents create and code Dealers.
- Country Agents or Dealers create Center entities within their authorized network.
- A Center's first operational user may then be invited to onboard to the already-existing Center.

Public operational signup remains disabled.

## Approved first-user flow

1. Authorized Agent or Dealer creates/selects a Center entity.
2. Platform already knows the exact `installation_center_id` and Transfer ID.
3. Authorized parent sends an email invitation from a trusted server-side path.
4. Recipient opens the invitation and reaches the dedicated Center onboarding experience.
5. Recipient establishes the Auth account/password and supplies minimal personal profile data.
6. Trusted server fixes `role = center` and the predetermined `installation_center_id` through protected provisioning metadata.
7. Existing operational-profile provisioning creates the profile.
8. Center can enter Operations and accept pending Transfers.

The invited person never chooses their role or operational-entity binding.

## Security boundary

The existing trusted `pg_provisioning` model remains the authorization baseline.

Center Onboarding must not:

- enable unrestricted public signup;
- trust user-editable metadata for role/entity authorization;
- allow a permanent Roll/ERP/QR identifier to create an operational account;
- auto-bind an existing operational account to another Center;
- create warranty approval merely because onboarding succeeded.

Invitation/acceptance state is audited separately; raw Supabase invitation tokens are not stored by the application.

## Scope limit

The current onboarding foundation is deliberately limited to the Center's initial controlled account setup needed for operational participation and Transfer acceptance.

It does not introduce:

- public self-registration;
- KYC/document workflows;
- CRM or marketing onboarding;
- OTP/SMS authentication;
- automatic Roll ownership from scanning a label;
- automatic Warranty approval;
- a generic organization-membership or RBAC engine.

Additional users for an already-onboarded Center continue to belong to the existing controlled user-management capability unless a later demonstrated requirement justifies a separate member-invitation flow.
