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

A missing, suspended, or structurally invalid operational profile is redirected to `/access-denied`.

## Current role boundary

All three approved operational roles can enter the general operations overview at this stage.

This gate validates who the user is and which operational entity they represent. Module-specific authorization still belongs to each business module and its database RLS policies.

## Data access

The operational profile is loaded through the shared typed Supabase server client. The profile RLS policy limits the authenticated user to their own profile row.

Database RLS remains the final security boundary for exposed business data. The route gate is not a replacement for table policies. Every business table must define its own role, status, ownership, or custody rules when introduced.

## Entity status

Profile binding proves that the referenced dealer or center exists because the relationship is enforced by foreign keys. Dealer/center lifecycle visibility and active-state enforcement are introduced together with the role-specific data-access policies for those entities; this gate does not bypass those future policies.

## Suspension

A suspended profile keeps its authentication account but cannot enter the operational portal. This keeps account identity separate from operational authorization and allows access to be restored without recreating the user.

## Deferred

Not included yet:

- Admin-only management modules beyond products.
- Dealer-specific business-module access.
- Center-specific business-module access.
- User provisioning and profile administration UI.
- Customer accounts.
