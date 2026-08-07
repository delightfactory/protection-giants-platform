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
- `created_at`: creation timestamp.

Email and authentication credentials remain in Supabase Auth and are not duplicated in the profile table.

## Authorization boundary

The table is exposed with RLS enabled.

At this stage an authenticated user can only read their own profile. There are no client-side insert, update, or delete permissions.

Administrative user provisioning and profile maintenance will be introduced in a later cube after the login/session foundation is complete.

## Deferred relationships

The profile does not yet contain `dealer_id` or `center_id`.

Those relationships will be added only after the dealer and center entities exist, so this block does not create placeholder foreign keys or generic organization references.

## Suspension

Suspension is kept in the application profile rather than relying only on token state. Future route and RLS checks must require an `active` profile for operational access.
