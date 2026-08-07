# Operational Access Gate

This block adds the application-level gate between a valid Supabase Auth session and the operational portal.

## Access requirements

A request may enter `/operations` only when all of the following are true:

1. Supabase Auth has a valid session.
2. The authenticated user has a row in `public.profiles`.
3. The profile status is `active`.
4. The profile role is one of `admin`, `dealer`, or `center`.

A missing or suspended operational profile is redirected to `/access-denied`.

## Current role boundary

All three approved operational roles can enter the general operations overview at this stage.

This block does not yet decide which business modules each role may access. Module-specific authorization will be added only when those modules exist.

## Data access

The operational profile is loaded through the shared typed Supabase server client. The existing profile RLS policy limits the authenticated user to their own profile row.

Database RLS remains the final security boundary for exposed business data. This route gate is not a replacement for future table policies. Every business table must define its own role, status, ownership, or custody rules when introduced.

## Suspension

A suspended profile keeps its authentication account but cannot enter the operational portal. This keeps account identity separate from operational authorization and allows access to be restored without recreating the user.

## Deferred

Not included in this block:

- Admin-only module access.
- Dealer-specific module access.
- Center-specific module access.
- Dealer or center foreign keys on profiles.
- User provisioning and profile administration UI.
- Customer accounts.
