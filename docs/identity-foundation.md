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

Every user intentionally provisioned as an operational account must receive exactly one matching `public.profiles` row in the same Supabase Auth Admin creation transaction.

Supabase Auth v2.188.1 creates the initial `auth.users` row and then applies the request's `app_metadata` inside the same database transaction. The profile provisioning function therefore handles both events:

- `AFTER INSERT` on `auth.users`: future-compatible path; it is a safe no-op when trusted provisioning metadata is not yet present.
- `AFTER UPDATE OF raw_app_meta_data` on `auth.users`: current Auth Admin creation path; it creates the profile when the trusted provisioning contract becomes available.

Both triggers call `public.handle_operational_user_provisioning()`.

### Trusted provisioning contract

Authorization-affecting provisioning values live only in protected `app_metadata` under `pg_provisioning`:

- `version = operational-v1`
- `role = admin | dealer | center`
- `dealer_id` when the role is `dealer`
- `installation_center_id` when the role is `center`

Display name and optional contact phone may be supplied through user metadata because they are not authorization decisions. They are copied once into `public.profiles` during provisioning.

The trigger function validates:

- the provisioning object and contract version;
- role is one of `admin`, `dealer`, or `center`;
- display name satisfies the profile contract;
- optional phone satisfies the existing profile length contract;
- dealer and installation-center identifiers are valid UUIDs when supplied;
- role/entity binding matches the database invariant.

The function is idempotent for an already-provisioned user: later Auth application-metadata changes do not recreate or rewrite the profile. `public.profiles` remains the sole operational authorization source after provisioning.

If trusted provisioning metadata is present but invalid, the trigger raises and the Auth Admin creation transaction rolls back. Because the initial Auth insert and application-metadata update are in the same Supabase Auth transaction, an invalid operational profile does not leave an orphan Auth account.

### Public signup boundary

A public/self-service signup cannot set protected `app_metadata`, so role-like values submitted in user-editable metadata cannot create an operational profile.

If self-service signup is enabled in a Supabase environment, such a request may still create a non-operational Auth user with no profile. That user cannot pass the platform's operational access gate. Production is intended to be admin/invite provisioned, so self-service signup must be disabled in production Auth configuration rather than relying on the profile trigger to block the Auth endpoint itself.

## Authorization boundary

The profile table is exposed with RLS enabled.

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

- trusted operational Auth creation auto-creates exactly one expected profile;
- Arabic display-name metadata survives the Auth-to-profile round trip;
- invalid role/entity provisioning is rejected;
- the rejected Auth Admin creation transaction is rolled back by proving the same email can be created successfully afterward;
- public signup, when enabled in the local Auth stack, cannot create an operational profile from user-editable metadata.
