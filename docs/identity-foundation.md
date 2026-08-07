# Identity Foundation

This block defines the minimum application identity model that sits on top of Supabase Auth.

## User types

The platform has three operational roles at this stage:

- `admin`: parent-company operational users.
- `dealer`: country dealer or agent users.
- `center`: approved installation-center users.

Customer accounts are intentionally excluded from the current scope.

## Authentication identity

Email is the primary sign-in identity for the current version.

Phone remains optional operational profile data so the platform can support phone-based authentication later without redesigning the profile model. Phone authentication, OTP and SMS delivery are not enabled in the current scope.

Authentication credentials remain in Supabase Auth and are never committed to migrations, seed files, documentation, or source control.

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

## Automatic profile provisioning

Every newly created operational Auth user must receive exactly one matching `public.profiles` row in the same Auth user creation transaction.

The database trigger `on_auth_user_created_create_operational_profile` runs after insertion into `auth.users` and calls `public.handle_new_operational_user()`.

The trigger accepts an Auth user only when the trusted Auth Admin creation path has set this non-secret application-metadata marker:

- `pg_provisioning = operational-v1`

This marker is only a provisioning gate. It is not an authorization claim and application access must never depend on it.

Initial profile values are read once at user creation from the creation metadata and copied into `public.profiles`. Later changes to Auth user metadata do not change role, status, or entity binding. The profile table remains the sole operational authorization source.

The trigger validates:

- role is one of `admin`, `dealer`, or `center`;
- display name satisfies the profile contract;
- optional phone satisfies the existing profile length contract;
- dealer and installation-center identifiers are valid UUIDs when supplied;
- role/entity binding matches the database invariant.

If any validation or profile insertion fails, Auth user creation fails too. This is intentional: the platform must not create an operational Auth account without a valid matching profile.

A public/self-service signup cannot supply the trusted `app_metadata` marker and is therefore rejected by the trigger even if it submits role-like values in user-editable metadata.

## Authorization boundary

The table is exposed with RLS enabled.

An authenticated user can currently read only their own profile. There are no client-side insert, update, or delete permissions.

Administrative user management must preserve the role/entity invariant defined here. User-editable Auth metadata is never used directly for RLS or operational authorization decisions.

## First administrator bootstrap

The first administrator is bootstrapped once through a trusted server/admin process when a real Supabase project is provisioned.

No administrator email, password, secret key, or other credential is embedded in database migrations or committed to Git. After the first administrator exists, normal user provisioning is performed from the secured administrative user-management flow.

## Suspension

Suspension is kept in the application profile rather than relying only on token state. Operational access requires an `active` profile.

Suspending a profile blocks application access independently from Auth credentials. Dealer and installation-center entity status remains an additional access gate.

## Verification

Database Quality starts a fresh local Supabase stack and exercises the Auth API against the trigger. The smoke check verifies that:

- trusted operational Auth creation auto-creates the expected profile;
- invalid role/entity provisioning is rejected;
- public signup cannot bypass the trusted provisioning gate.
