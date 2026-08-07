# Operational Access Gate

This block defines the application-level gate between a valid Supabase Auth session and the operational portal.

## Access requirements

A request may enter `/operations` only when all of the following are true:

1. Supabase Auth has a valid session.
2. The authenticated user has a row in `public.profiles`.
3. The profile status is `active`.
4. The profile role is one of `admin`, `dealer`, or `center`.
5. The role/entity binding is structurally valid:
   - admin has no dealer or center binding;
   - dealer has one `dealer_id` only;
   - center has one `installation_center_id` only.
6. For dealer and center users, the directly represented operational entity is also `active`.

A missing, suspended, structurally invalid, or inactive-bound operational identity is redirected to `/access-denied`.

## Current role boundary

All three approved operational roles can enter the general operations overview at this stage.

This gate validates who the user is and which operational entity they represent. Module-specific authorization still belongs to each business module and its database RLS policies.

## Operational entity read scope

Authenticated access to dealer and installation-center records is explicitly scoped by RLS:

- `admin` may read all dealers and installation centers.
- `dealer` may read its own dealer record and installation centers assigned to that dealer.
- `center` may read only its own installation-center record.

A center is not granted dealer-table visibility merely because its center has a `dealer_id`; that access can be added later if a real workflow requires it.

These policies require the requesting profile itself to remain `active`.

## Data access

The operational profile is loaded through the shared typed Supabase server client. The profile RLS policy limits the authenticated user to their own profile row.

Database RLS remains the final security boundary for exposed business data. The route gate is not a replacement for table policies. Every business table must define its own role, status, ownership, or custody rules when introduced.

## Entity status

Dealer users require their bound dealer record to be active. Center users require their bound installation-center record to be active.

The current model does not automatically suspend a center when its optional parent dealer is suspended. That would be a separate business rule and is not introduced without an explicit operational requirement.

## Suspension

A suspended profile keeps its authentication account but cannot enter the operational portal. This keeps account identity separate from operational authorization and allows access to be restored without recreating the user.

## Deferred

Not included yet:

- Admin-only management modules beyond products.
- Dealer-specific business-module access.
- Center-specific business-module access.
- User provisioning and profile administration UI.
- Customer accounts.
