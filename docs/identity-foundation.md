# Identity Foundation

## Operational roles

The current platform roles are:

- `admin`: Protection Giants operational administration.
- `agent`: Country Agent user bound to one `country_agent_id`.
- `dealer`: Dealer/Distributor user bound to one `dealer_id`.
- `center`: Installation Center user bound to one `installation_center_id`.

Customer accounts remain outside the current operational scope.

## Authentication identity

Email is the active sign-in identity. Phone is optional profile data and is not an authentication factor. SMS/OTP login is not enabled.

Credentials and secrets remain in Supabase Auth and are never committed to migrations, seeds, documentation, or source control.

## Profile contract

`public.profiles` contains application identity only: Auth UUID, display name, role, lifecycle status, optional phone, entity binding, and creation time.

The database enforces exactly one valid role/entity combination:

- Admin: all entity IDs null.
- Agent: `country_agent_id` only.
- Dealer: `dealer_id` only.
- Center: `installation_center_id` only.

Multiple users may represent the same entity.

## Trusted provisioning

`public.handle_operational_user_provisioning()` remains the only automatic operational-profile creation boundary.

Authorization-sensitive values are accepted only from protected `app_metadata.pg_provisioning`:

- `version = operational-v1`
- `role = admin | agent | dealer | center`
- the exact required entity ID for non-Admin roles.

Display name and optional phone are copied from non-authorization user metadata at provisioning time.

The function is idempotent: an existing Profile is not recreated or rewritten by later Auth metadata changes. `public.profiles` is the operational authorization source after provisioning.

The trigger runs after Auth insert and after `raw_app_meta_data` updates. Missing protected provisioning is a safe no-op. Invalid protected metadata raises and prevents invalid Profile creation.

## Admin-created users

Global Admin User Management can create all four operational roles through the server-only Supabase Admin client. After Auth creation, the application verifies the exact Profile binding and deletes the just-created Auth user as compensating cleanup if trusted Profile creation fails.

Agent-created Dealer accounts use a narrower server-only path tied to a Dealer already proven to be inside the Agent's RLS scope. That path never exposes global User Administration to Agent users.

## Center invitation onboarding

A Center may exist with zero users. Its first self-completed account may use the invitation flow:

1. authorized Admin/Agent/Dealer sends an email invitation for an existing Center;
2. Auth creates the invited user without operational Profile;
3. the invite confirmation establishes an Auth session on `/onboarding/center`;
4. recipient supplies display name, optional phone, and password;
5. server stages those non-security values first;
6. server claims the matching invitation and then sets protected `pg_provisioning` with fixed `role=center` and the predetermined Center ID;
7. the existing trigger creates the Profile;
8. exact Profile binding is verified before redirecting to Operations.

The invited person never chooses role or entity binding. Raw invitation tokens are not stored by the application.

## Signup boundary

Committed Supabase configuration disables global public signup and anonymous sign-in. Operational signup is controlled by Admin creation or Center invitation only.

## Suspension

Account access is lifecycle-based rather than hard deletion. Profile status and bound entity status are checked by the operational gate. User Administration also coordinates Auth ban state for explicit user suspension/reactivation.

Agent or Dealer entity suspension does not automatically change descendant entity statuses.

## Bootstrap

The first Admin is created through a trusted external/admin bootstrap process when the hosted Supabase project is provisioned. No bootstrap email/password is embedded in source or migrations.
