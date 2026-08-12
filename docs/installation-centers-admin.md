# Installation Center Administration

## Current capability

Center administration supports the approved three parent modes:

- direct Company;
- direct Country Agent;
- under Dealer.

The database prevents both Agent and Dealer parent IDs from being populated simultaneously.

## Management scope

- Admin: any Center and any valid parent mode.
- Agent: direct Centers in its network and Centers under its own Dealers; may reassign inside that same Agent network.
- Dealer: Centers directly assigned to itself only; parent is fixed to that Dealer.
- Center: no child/entity administration.

RLS is the security boundary, so a Company-direct Center or another network's Center cannot be managed by Agent/Dealer even with a forged URL/form value.

## Country derivation

For Agent/Dealer parents, country is derived from the parent by server logic and enforced by database relationships. Only a Company-direct Center requires an explicit country because no parent provides one.

## Transfer identity

Each Center receives exactly one Operational Party and stable Transfer ID atomically with entity creation.

## Lifecycle

Center status is `active | suspended`. Suspension blocks Center operational users but does not delete the business identity, Transfer ID, invitation history, or future custody history.

Center operational status is not warranty approval. Warranty-authorized Center state belongs to a later Activation/Public Center cube.

## First-user invitation

An active Center with no operational user may receive one open onboarding invitation at a time.

Authorized Admin/Agent/Dealer can:

- send the invitation;
- cancel a still-pending invitation;
- supersede/reissue a still-pending invitation.

`pending` and `accepted` are both treated as open states by database uniqueness rules. Once the recipient has claimed the invitation (`accepted` while provisioning finalizes), parent cancel/reissue actions are locked to avoid a race with Profile creation.

The invitation audit is server-managed and not directly readable/writable through the ordinary Data API, even by the invited Auth user.

Once any Center Profile exists, initial onboarding is considered complete; normal user lifecycle uses controlled account administration rather than deleting the Center identity.

## Production email prerequisite

Hosted production must configure the real Site URL/redirect behavior, equivalent invite email template, and production-grade SMTP before relying on invitation delivery. Public signup remains disabled.
