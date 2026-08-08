# Administrative Operational Accounts

## Completed functional scope

The operational user-management cube is complete for the current three-role platform model.

Administrators can now:
- list all operational accounts and see their Auth email, display name, phone, role, status, and entity binding;
- search by name, email, phone, role label, or represented entity;
- filter by role and lifecycle status;
- create a new operational account with email/password credentials and trusted provisioning metadata;
- rely on the existing Auth trigger to create the matching `public.profiles` row atomically;
- edit display name and optional phone;
- change role and dealer/installation-center binding while preserving the database binding invariant;
- change the Auth email directly through the server-only Auth Admin client;
- reset a user's password without reading or storing the previous password;
- suspend and reactivate an account across both Supabase Auth and the operational profile;
- keep the currently logged-in administrator protected from self-suspension and self-demotion.

Hard deletion is intentionally not part of the operational lifecycle. A user that must lose access is suspended. Deletion remains reserved for compensating cleanup when a brand-new Auth account fails to receive its required operational profile during creation.

## Authentication boundary

Email remains the primary sign-in identity. Phone is optional operational profile data and is not enabled as an authentication method in the current platform version.

Privileged Auth administration uses a dedicated server-side Supabase client created from:
- `NEXT_PUBLIC_SUPABASE_URL`;
- `SUPABASE_SECRET_KEY` for hosted projects (preferred current Supabase key type);
- `SUPABASE_SERVICE_ROLE_KEY` only as a local/legacy fallback.

The secret/service-role value is never exposed through a `NEXT_PUBLIC_` variable and is never used by browser code.

Every privileged Server Action calls `requireAdminProfile()` before creating the Auth Admin client or mutating an operational account. The elevated key therefore runs only behind a verified active parent-company administrator session.

## Account creation contract

Creation uses Supabase Auth Admin `createUser()` with:
- confirmed email;
- an administrator-supplied temporary password;
- protected `app_metadata.pg_provisioning` containing the role and required entity binding;
- non-authoritative display name and optional phone in `user_metadata` for the provisioning handoff.

The database provisioning trigger remains responsible for creating exactly one `public.profiles` row.

After Auth creation, the application verifies that the operational profile exists. If profile provisioning is unexpectedly missing, the just-created Auth user is deleted immediately as compensating cleanup so no orphan operational credential remains.

New dealer and center accounts may only be bound to active entities.

## Profile editing contract

`public.profiles` remains the sole operational authorization source after provisioning.

The administration UI can change:
- `display_name`;
- `phone`;
- `role`;
- `dealer_id`;
- `installation_center_id`;
- `status` through the lifecycle action.

The existing database constraint continues to enforce the exact role/entity combinations:
- admin → no dealer and no center;
- dealer → exactly one dealer and no center;
- center → exactly one installation center and no dealer.

When an existing account is already bound to an entity that has since been suspended, non-binding profile edits remain possible. Rebinding to a different dealer or center requires the new entity to be active.

The currently logged-in administrator cannot change his own role away from `admin`.

## Email and password administration

Email and password live in Supabase Auth rather than `public.profiles`.

Email changes use Auth Admin `updateUserById()` and are confirmed immediately by the trusted administration flow.

Password resets also use `updateUserById()`. The UI only accepts the new password and never reads, displays, logs, or stores the old password. The application requires at least 12 characters before submitting, while Supabase Auth remains the final authority if the hosted project later enforces a stronger password policy.

## Suspension and reactivation

Lifecycle state is intentionally enforced in two layers:
1. Auth ban state blocks new sign-ins.
2. `public.profiles.status` blocks operational access even while an already-issued JWT remains within its short validity window.

Suspension applies an Auth ban and then sets the profile to `suspended`.

Reactivation removes the Auth ban and then sets the profile back to `active`.

If the profile update fails after the Auth change, the action attempts to restore the previous Auth ban state before returning an error. This keeps partial cross-system failures from silently leaving the account in an ambiguous state.

The currently logged-in administrator cannot suspend his own account.

## Mobile behavior

The users module remains mobile-first:
- search and filters collapse cleanly to one column;
- account cards stay single-column on phones;
- create/edit fields retain large touch targets and mobile keyboard hints;
- account-management forms are grouped by responsibility rather than placed in one oversized form;
- lifecycle actions remain explicit and separated from ordinary profile editing.

The phone bottom navigation remains limited to the existing high-frequency destinations. Accounts remain reachable from the admin overview and desktop navigation without forcing a fifth cramped bottom-navigation item.

## Verification

The existing checks still verify:
- trusted operational Auth creation auto-provisions exactly one profile;
- invalid provisioning rolls back without leaving an Auth orphan;
- public signup cannot create an operational profile;
- administrators can read all profiles while dealer users remain own-profile only.

`verify-user-admin-lifecycle.mjs` additionally exercises a fresh local Supabase stack and verifies:
- operational user creation and profile provisioning;
- valid role/entity reassignment;
- database rejection of an invalid role/entity combination without corrupting the existing profile;
- Auth email and password changes;
- old credentials no longer authenticating after the change;
- Auth ban blocking sign-in;
- profile suspension state;
- Auth unban and profile reactivation restoring access.

Application PR Quality continues to run TypeScript validation and a production Next.js build.
