# Administrative Operational Accounts

## Current scope

This block adds the first administrative view over operational user profiles.

Included:
- active administrators can read all `public.profiles` rows;
- non-admin operational users keep own-profile-only access;
- the admin interface lists display name, role, profile status, optional phone, and dealer/installation-center binding;
- entity labels are resolved through the already-approved dealer and installation-center read scopes;
- the admin overview links to the accounts module;
- desktop navigation includes the accounts module.

Not included:
- Auth user creation or invitations;
- Auth email listing;
- role or entity-binding edits;
- profile suspension/reactivation controls;
- password/reset operations;
- deletion.

No create/edit/lifecycle controls are shown until their complete secured backend paths exist.

## Profile read RLS

`public.profiles` already allows an authenticated user to read their own profile.

Allowing an administrator to read every profile cannot safely use a self-referencing `profiles` subquery directly inside a `profiles` RLS policy because that creates recursive RLS evaluation.

The migration therefore introduces the narrow helper `private.is_active_admin()`:
- it returns only a boolean;
- it checks the current `auth.uid()` against an active admin profile;
- it runs as `SECURITY DEFINER` with an empty `search_path` and fully qualified table references;
- it lives in the non-exposed `private` schema;
- anonymous/public execution is revoked;
- authenticated execution is granted only so the `profiles_admin_read` policy can evaluate it.

The resulting `profiles_admin_read` policy is additive to the existing own-profile policy. PostgreSQL combines permissive SELECT policies with OR semantics, so:
- active admin → all profiles;
- dealer/center → own profile only.

## Authentication data boundary

The read view intentionally does not query `auth.users` and therefore does not display email yet.

Email remains the authentication identity in Supabase Auth. It will be surfaced only when the secure server-side Auth Admin integration exists. This avoids prematurely exposing privileged Auth access just to enrich a read-only screen.

## Mobile behavior

The accounts list uses the same mobile-first operational cards and status chips as the current platform surfaces.

Accounts are available from the admin overview. They are also present in desktop navigation. The phone bottom navigation remains limited to the four currently higher-frequency destinations rather than expanding for a lower-frequency administrative function before a genuine need for a broader mobile navigation pattern exists.

## Verification

Database Quality verifies the RLS path using the local Supabase Auth and REST APIs:
- create a trusted admin operational account;
- create a trusted dealer operational account bound to a real dealer entity;
- sign in as the admin and confirm both profiles are readable;
- sign in as the dealer and confirm only the dealer's own profile is readable.
