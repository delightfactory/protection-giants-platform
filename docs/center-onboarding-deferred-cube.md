# Installation Center Onboarding

## Status

**Implemented as part of Agent & Network Foundation on the working branch.**

The filename is retained to preserve existing documentation links; the original “deferred” timing is superseded by `distribution-network-flow-spec.md`.

## Purpose

A Center is an operational entity independent from its users. It can exist, receive a Transfer ID, and later participate in custody flows before any individual account exists.

Center invitation onboarding supplies the first controlled self-completion path without enabling public operational signup.

## Implemented flow

1. Authorized Admin/Agent/Dealer selects an existing active Center already inside the caller's RLS scope.
2. Server rejects an already-onboarded Center, conflicting Auth email, or another open invitation.
3. Application creates a server-only audit row before sending the Supabase Auth invitation.
4. Auth user ID returned by the invite is bound to that exact audit row; failed persistence triggers compensating cleanup of the unclaimed Auth user.
5. Email link uses a token-hash confirmation route and establishes an invite session.
6. `/onboarding/center` requires that Auth session plus an open invitation bound to the same Auth user/email.
7. Invitee supplies display name, optional phone, and a password. No role or Center selector exists.
8. Server stages non-security user metadata/password first.
9. Server conditionally claims `pending → accepted` and re-checks Center activity / competing Center Profile.
10. Server sets protected `app_metadata.pg_provisioning` with fixed `role=center` and invitation Center ID.
11. Existing Auth trigger creates the Profile; server verifies the exact resulting binding.
12. User enters Operations only after Profile creation succeeds.

## Audit and race invariants

`center_onboarding_invitations` stores Center, invited email, Auth user ID, inviter Profile, state, and timestamps. It never stores raw Supabase invite tokens.

States are `pending | accepted | cancelled | superseded`.

Pending and Accepted are both considered open. Unique partial indexes permit only one open invitation per Center, email, and bound Auth user.

Cancel/reissue first wins a conditional `pending` transition and only then deletes an unclaimed Auth user. Onboarding first wins `pending → accepted` before protected provisioning. Therefore parent cancellation and recipient provisioning cannot both succeed on the same Pending state.

If final Profile verification is unexpectedly ambiguous, the implementation fails closed: a proven mismatched Profile/Auth identity is suspended rather than leaving uncertain access active.

## Security boundary

- public signup remains disabled;
- service/secret key remains server-only;
- invitee cannot choose authorization metadata;
- invitation audit has no ordinary authenticated Data API access;
- Center entity access is not granted before Profile provisioning;
- operational Center status remains separate from future warranty approval.

## Production deployment prerequisite

The repository includes the local invite template and confirmation route. A hosted Supabase production project must configure its real Site URL/allowed redirect behavior, equivalent invite template, and production-grade custom SMTP before production invitations are relied upon.
