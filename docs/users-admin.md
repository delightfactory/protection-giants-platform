# Administrative Operational Accounts

## Global Admin capability

Global operational User Administration supports the current four roles:

- Admin
- Country Agent
- Dealer
- Installation Center

Admin can list/search/filter operational accounts; create trusted accounts; edit display name, phone, role/entity binding; change Auth email; reset password; suspend/reactivate; and preserve self-demotion/self-suspension protections.

Hard deletion is not an operator lifecycle. Suspension is the normal access-removal path. Deletion is reserved for compensating cleanup of brand-new unclaimed/failed Auth accounts.

## Binding contract

Database-enforced Profile binding is:

- Admin → no entity IDs.
- Agent → exactly one `country_agent_id`.
- Dealer → exactly one `dealer_id`.
- Center → exactly one `installation_center_id`.

New bindings must target active entities. An unchanged binding may remain visible/editable even when its entity is suspended so an Admin can repair non-binding profile data.

## Auth boundary

Email/password remain in Supabase Auth. Privileged operations use the server-only Admin client; the secret/service-role key is never exposed to browser code.

Account creation uses protected `app_metadata.pg_provisioning`. After Auth creation, the application verifies the exact Profile produced by the provisioning trigger and removes the new Auth account if trusted Profile creation failed.

## Agent-scoped Dealer accounts

The network foundation adds a narrow account-management path for an Agent's own Dealers without exposing global User Administration.

After the Dealer is proven inside the Agent's RLS scope, the Agent may:

- create Dealer users fixed to that Dealer;
- suspend/reactivate those users;
- reset their password.

Every privileged Profile lookup includes exact Dealer role/binding predicates. Agent cannot use this path to create Admin/Agent/Center accounts or another network's Dealer account.

## Center onboarding relationship

Center invitation onboarding is not a replacement for global User Administration. It is a controlled first-user self-completion path for an already-existing Center.

The invitee cannot choose role/entity. Once a Center Profile exists, additional support/lifecycle remains controlled by established administration capabilities; the platform does not introduce public member signup.

## Lifecycle consistency

User suspension coordinates two layers:

1. Auth ban state;
2. `profiles.status`.

If Profile persistence fails after an Auth lifecycle change, the action attempts to restore the previous Auth state. The operational gate also re-checks Profile and represented entity status.

## Mobile behavior

User management remains card/form based on mobile. Country Agent management is reachable from the Admin operations home even though the bottom navigation remains intentionally compact.

## Verification

Database and application CI cover trusted provisioning, invalid binding rejection, role/entity lifecycle, Auth credential changes, Agent role provisioning, scoped Dealer account prerequisites, network RLS, and existing Product/Production regressions.
