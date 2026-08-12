# Deferred Cube: Installation Center Onboarding

## Status

Deferred architectural decision. This cube is intentionally **not implemented yet**.

It should be developed after the core operational cubes are stable, especially Product, Production, Transfer/Custody, Roll Opening/Claim, Activation, and Warranty foundations as applicable to the agreed roadmap.

The purpose of this document is to preserve the intended onboarding experience **without forcing foundational cubes to be reopened or redesigned later**.

## Core decision

An Installation Center is an operational **entity** independent from its user accounts.

A Roll is transferred to / held by the Installation Center entity, not by an individual user account.

User accounts only represent people authorized to act for that Installation Center.

Therefore:

- a center may exist before it has any platform user;
- a center may receive custody of Rolls before onboarding a user;
- a center may later have one or more users without changing historical Roll custody;
- replacing, suspending, or adding center users must not rewrite Roll ownership/custody history.

This separation is the main compatibility requirement that allows Center Onboarding to remain a later, independent cube.

## Intended future experiences

The deferred cube should support one or both of these controlled onboarding paths.

### 1. Dealer invitation

A dealer may create or select an Installation Center inside its own authorized network, then invite a person to become a user for that Center.

Expected flow:

1. Dealer creates/selects the Center entity.
2. Dealer enters the invited person's email.
3. Platform creates a controlled invitation through a trusted server-side path.
4. Recipient opens the invitation.
5. Recipient completes account setup.
6. The resulting operational profile is bound to the already-existing Center entity.

The invitation must not give the recipient authority to choose an arbitrary role, dealer, or center binding.

### 2. Transfer-assisted self-onboarding

A new center that is not yet registered may receive a Roll from a dealer and use that real transfer as the context for onboarding.

The desired experience may be:

1. Dealer records the transfer to a new/existing Center entity.
2. Platform creates a short-lived, single-use onboarding/receipt token associated with that transfer or Center.
3. Center representative scans the provided QR/link.
4. Platform shows the relevant transfer context without exposing sensitive internal data.
5. Representative completes Center/account onboarding.
6. Platform binds the user to the Center.
7. Transfer receipt/claim is confirmed according to the future Transfer/Custody rules.

A permanent Roll Serial, ERP Serial, Product SKU, Lot number, or public QR must **not by itself** act as the security credential that grants ownership or creates an operational account.

Possession of a copied/photographed identifier is not sufficient proof of authorized custody.

## Security boundary

The current trusted provisioning model remains the governing security baseline.

Center Onboarding must not require enabling unrestricted public operational signup.

Future onboarding should use a trusted server-side provisioning/invitation path so that authorization-sensitive values remain controlled by the platform, including:

- operational role;
- dealer binding;
- installation-center binding;
- transfer/receipt context;
- invitation or claim validity.

Any future self-service flow must be scoped by an expiring, single-use capability/token or an equivalent controlled mechanism rather than user-editable signup metadata.

## Compatibility requirements for earlier cubes

Earlier/core cubes should preserve only these simple boundaries so that this deferred cube can be added later without foundational redesign:

1. **Entity-first custody** — Transfer/Custody records target Dealer / Installation Center entities, never individual user IDs as the owner/custodian identity.
2. **Independent user binding** — profiles continue to bind users to an existing Dealer or Installation Center entity.
3. **No account prerequisite for custody** — a Center entity must be able to exist and participate in custody history even when it has zero users.
4. **Immutable history** — onboarding a user later must not alter historical transfers or production identity.
5. **Voided production isolation** — Rolls belonging to a voided Production Order remain ineligible for downstream operational transfer/claim/activation according to the production contract.
6. **Separate identifiers** — Roll Serial, ERP Serial, Lot number, Product SKU, onboarding token, activation identifier, and warranty identifier remain distinct concepts.

If these boundaries are respected, Center Onboarding should be implementable later as an additive cube rather than a rewrite of Product, Production, Users, Centers, or Transfer history.

## Expected future scope

The cube may include:

- dealer-scoped Center onboarding entry point;
- invitation creation and lifecycle;
- expiring/single-use invitation or transfer-assisted onboarding token;
- acceptance screen;
- account setup;
- trusted profile provisioning and Center binding;
- clear handling of expired, cancelled, already-used, or invalid invitations;
- handling of an email that already belongs to an existing operational user;
- audit trail for who initiated and who accepted onboarding;
- mobile-first QR/link experience.

Exact schema and API choices are deliberately deferred until implementation so they can be designed against the completed core flow rather than guessed early.

## Explicit non-goals

This decision does **not** authorize implementing now:

- unrestricted public signup;
- automatic ownership from scanning a permanent Roll identifier;
- automatic warranty activation during account creation;
- a generic permissions/RBAC engine;
- complex organization hierarchies;
- automatic dealer/center approval workflows beyond what the business flow later proves necessary;
- reopening completed Product or Production cubes without a proven compatibility defect.

## Implementation gate

Before starting this cube later, re-review the then-current Transfer/Custody, Center, Auth/Profile, Roll Claim, and Activation contracts.

Implementation should proceed only if the onboarding path can remain additive and preserve the entity-first custody model above.

If a future requirement would make a person/user account the actual owner of operational Roll history, that is a material model change and must be reviewed separately rather than being hidden inside onboarding work.
