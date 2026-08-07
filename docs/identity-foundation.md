# Identity Foundation

This block defines the minimum application identity model that sits on top of Supabase Auth.

## User types

The platform has three operational roles at this stage:

- `admin`: parent-company operational users.
- `dealer`: country dealer or agent users.
- `center`: approved installation-center users.

Customer accounts are intentionally excluded from the current scope.

## Profile model

`public.profiles` extends `auth.users` with application-specific data only:

- `id`: same UUID as the Supabase Auth user.
- `display_name`: operational display name.
- `role`: one of the three approved roles.
- `status`: `active` or `suspended`.
- `phone`: optional operational contact number.
- `dealer_id`: dealer identity for dealer-role users only.
- `installation_center_id`: installation-center identity for center-role users only.
- `created_at`: creation timestamp.

Email and authentication credentials remain in Supabase Auth and are not duplicated in the profile table.

## Operational entity binding

Role and represented entity are one database-enforced identity contract:

- `admin`: no dealer or installation-center binding.
- `dealer`: exactly one `dealer_id` and no installation-center binding.
- `center`: exactly one `installation_center_id` and no dealer binding.

The database check constraint rejects any other combination. Dealer and center foreign keys use `ON DELETE RESTRICT` so an operational entity cannot be removed while user profiles still depend on it.

Multiple users may reference the same dealer or installation center; the binding identifies the represented organization, not a one-user-per-organization rule.

## Authorization boundary

The table is exposed with RLS enabled.

An authenticated user can currently read only their own profile. There are no client-side insert, update, or delete permissions.

Administrative user provisioning and profile maintenance remain a later cube and must preserve the role/entity invariant defined here.

## Suspension

Suspension is kept in the application profile rather than relying only on token state. Operational access requires an `active` profile.
