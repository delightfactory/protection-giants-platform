# Distribution Network Foundation — Impact Review

**Status:** Normative implementation companion to `distribution-network-flow-spec.md`  
**Date:** 2026-08-12  
**Code changes:** None in this branch.

## 1. Review conclusion

The approved Country Agent + private Transfer ID + Center Onboarding model can be added without redesigning Product or Production and without replacing the current Auth/Profile architecture.

It is, however, a real extension of the existing Operational Entities / Identity / RLS layers. Treating Agent as merely a label on Dealer would create semantic and authorization debt, so Agent must be introduced explicitly and all role/entity invariants must be extended together.

The safe implementation strategy is append-only migrations plus narrow updates to the current typed access/provisioning/admin surfaces. No existing migration should be rewritten.

## 2. Current contracts that were reviewed

The current repository establishes these relevant contracts:

- `public.profiles.role` currently allows `admin | dealer | center`.
- `profiles` currently binds Dealer users through `dealer_id` and Center users through `installation_center_id`.
- `lib/auth/operational-profile.ts` recognizes the same three roles and checks the bound Dealer/Center is active.
- `public.handle_operational_user_provisioning()` trusts only protected `app_metadata.pg_provisioning` for role/entity binding and is idempotent.
- public signup is disabled in committed Supabase configuration.
- Admin User Management uses a server-only Supabase Admin client and preserves the profile binding invariant.
- Dealer and Center RLS currently expose Admin/all, Dealer/own scope, Center/self scope.
- Center create/edit/lifecycle are currently Admin-only.
- Dealer create/edit/lifecycle are currently Admin-only.
- explicit Data API grants intentionally avoid broad `service_role` privileges.
- Production creates immutable Product snapshots, Lots and Rolls; Roll identity is already stable and downstream operations must reject a voided parent Production Order.

These are sound foundations and should be extended rather than replaced.

## 3. Exact foundation surfaces that must change

### 3.1 Database entity layer

Add:

- `country_agents` table;
- `dealers.country_agent_id`;
- `installation_centers.country_agent_id` for direct-Agent Centers;
- parent/country integrity rules;
- `operational_parties` thin registry;
- global immutable `transfer_code`;
- Center onboarding invitation audit table.

Do **not** modify Product or Production tables for Agent/network identity.

### 3.2 Profile identity layer

Add:

- `profiles.country_agent_id`;
- `agent` to allowed roles;
- expanded exact role/entity check constraint;
- Agent lookup index.

The invariant remains one represented entity per non-Admin profile.

### 3.3 Auth provisioning trigger

Replace the function definition in a new append-only migration so it understands Agent binding while keeping the same trigger names and behavior.

Required regression protections:

- no `pg_provisioning` → no profile;
- existing profile → no rewrite;
- invalid role/binding → transaction rejection;
- authorization data only from protected app metadata;
- display name/phone remain non-authorization user metadata copied at provisioning time.

The version string can remain `operational-v1` if the implementation treats Agent as a backward-compatible extension to the same contract. A version bump is unnecessary unless the final migration proves it is needed for ambiguity or compatibility.

### 3.4 Application access gate and types

Extend:

- `OperationalRole`;
- typed profile union;
- profile select fields;
- structural conversion logic;
- active-bound-entity check;
- generated Supabase database types.

The Agent active check must mirror the Dealer/Center behavior instead of creating a separate authentication system.

### 3.5 Explicit Data API grants

Because default privileges are deliberately locked down, every new table/function must be reviewed explicitly.

Expected server-only needs:

- `country_agents`: SELECT for trusted account-management/entity-validation workflows only;
- `profiles.country_agent_id`: include in the narrow service-role profile UPDATE grant;
- `operational_parties`: no broad client INSERT/UPDATE; exact read paths only as required;
- exact recipient resolver: explicit `EXECUTE` only for `authenticated` after its own authorization check;
- Center onboarding audit: no accidental global Auth-user read/write exposure.

Do not grant `service_role` broad table rights merely to simplify tests.

## 4. Agent-created Dealer requires an account path

A key implication of the approved hierarchy is that “Agent creates Dealer” cannot mean only creating the Dealer database row. Otherwise the Dealer still needs Parent Company intervention before it can operate, recreating the bottleneck we are removing.

### 4.1 Required narrow capability

An active Agent must have a **Dealer account provisioning action scoped to Dealers in its own network**.

It should reuse the existing server-only Supabase Admin infrastructure but must not expose the global Admin User Management module to the Agent.

The action must verify on the server:

1. caller has active `agent` profile;
2. target Dealer belongs to caller's exact `country_agent_id` and is active;
3. requested operational role is fixed to `dealer`;
4. protected provisioning metadata fixes `dealer_id` to that target;
5. Agent cannot create Admin, Agent, another network's Dealer user, or Center user through this path.

### 4.2 Account lifecycle boundary

For functional completeness, the same Agent scope should allow managing access for Dealer users belonging to its own Dealers where required for normal operation (at minimum create, suspend/reactivate, and credential recovery/reset through controlled server actions).

This should be a scoped reuse of existing lifecycle logic, not a second Auth subsystem and not global User Administration.

Parent Company/Admin retains full support authority.

### 4.3 Why Dealer does not use Center Onboarding

The approved business flow distinguishes them:

- Agent/Dealer accounts are provisioned by their controlling upstream organization.
- Center's first account uses invitation-based onboarding because Centers are numerous and need a self-completion path for receipt/transfer participation.

Do not generalize the Center invitation flow to all roles in this phase.

## 5. Center creation and onboarding implications

### 5.1 Center entity exists before user

Agent/Dealer creation of a Center must complete the business entity first and atomically generate its operational party/Transfer ID.

The Center may therefore have:

- identity;
- hierarchy placement;
- Transfer ID;
- pending incoming Transfer;

while still having zero Auth users.

This is intentional and prevents custody from becoming dependent on a person account.

### 5.2 Who can initiate onboarding

- Admin: any Center.
- Agent: any Center inside its own Agent network.
- Dealer: Centers directly assigned to that Dealer.
- Center: cannot initiate its own initial onboarding without a valid invitation.

### 5.3 Onboarding route must work without operational profile

The current `/operations` gate correctly rejects authenticated users with no `public.profiles` row. An invited Center user therefore needs a separate route such as `/onboarding/center` that requires a valid Auth session but deliberately does **not** call `requireOperationalProfile()` yet.

That route may proceed only when the authenticated Auth user matches one pending onboarding invitation.

This exception is narrow: it does not grant access to Operations or business tables before trusted profile provisioning succeeds.

### 5.4 Recommended invite/provision sequence

1. Parent submits Center + invite email.
2. Server verifies caller scope and Center state.
3. Server invokes Supabase Admin `inviteUserByEmail`.
4. Application records the returned Auth user ID against the predetermined Center invitation.
5. If application audit persistence fails after a newly created invite user was created, perform compensating cleanup of that unclaimed Auth user.
6. Recipient opens a valid Auth invite and receives an Auth session.
7. Onboarding screen collects display name, optional phone, and password/account completion data.
8. Recipient establishes its own Auth password through the authenticated Auth flow.
9. Trusted server revalidates invitation/caller user identity, writes non-security metadata as needed, then sets protected `app_metadata.pg_provisioning` to `role=center` + fixed Center ID.
10. Existing provisioning trigger creates the profile.
11. Mark application invitation accepted.
12. Redirect to Operations.

The implementation must be idempotent around retries so a browser refresh cannot create a second profile or bind another Center.

### 5.5 Invite routing and production configuration

The onboarding callback/redirect path must be part of Supabase's allowed Redirect URLs. Production Site URL must point to the real application URL.

Production email invitations require custom SMTP. Supabase's default project SMTP is only suitable for development/testing and imposes restricted recipients/rate limits.

These are deployment prerequisites, not reasons to enable public signup.

## 6. Operational Party / Transfer ID implications

### 6.1 Why this is not over-generalization

`operational_parties` exists only to solve two concrete needs already proven by the Transfer flow:

1. one globally unique Transfer ID across Agent/Dealer/Center;
2. one future custody foreign key regardless of which entity type holds a Roll.

It does not absorb names, addresses, hierarchy, status, users, or permissions from canonical entity tables.

### 6.2 Creation/backfill

Foundation migration must:

- create one Company party;
- create one party for every existing Agent/Dealer/Center row;
- automatically create one party for each future entity;
- never create duplicates on retry;
- make Transfer ID immutable.

If party generation fails, entity creation should fail atomically rather than leave an operational entity without a Transfer ID.

### 6.3 Transfer code exposure

The user-facing account/entity page may display:

- Transfer ID text;
- copy button;
- QR encoding the Transfer ID or a platform recipient URL containing it.

The QR is a convenience representation of the stable identifier, not a login/authentication QR.

### 6.4 Recipient resolver security

The exact resolver should be `SECURITY DEFINER` only if needed to cross ordinary RLS visibility and must then:

- set an explicit safe search path;
- authenticate `auth.uid()` itself;
- verify active operational profile;
- resolve exact equality only;
- re-check recipient active state;
- return a fixed minimal shape;
- expose no generic query/sort/pagination parameter;
- receive only an explicit `authenticated` EXECUTE grant.

Transfer creation must re-resolve/revalidate recipient server-side; it must not trust a `party_id` merely because the browser received it earlier in a verification card.

## 7. Entity RLS implications

The current broad concept “Dealer sees assigned Centers” can be extended without a generic RBAC engine.

### 7.1 Agent reads

Agent needs:

- own Agent row;
- own Dealer rows;
- direct Agent Centers;
- Centers whose Dealer belongs to the Agent.

### 7.2 Child writes

Every child write policy/action must verify actual parent linkage from database state, not a hidden form value alone.

Country should be derived from parent scope in ordinary Agent/Dealer creation. A caller must not be able to submit another country and rely only on UI validation.

### 7.3 Suspended children

Management policies must let an active authorized parent read a suspended child for reactivation. The suspended child's own user access remains blocked.

### 7.4 No cascade

Suspending Agent or Dealer must not issue mass status updates to descendants. Hierarchy state and descendant business continuity remain separate.

No operator-facing hard delete should be added to Agent/Dealer/Center entities once they can participate in custody history; lifecycle uses suspension.

## 8. Transfer acceptance implications frozen now

Transfer implementation is later, but the following behavior is already a required contract.

### 8.1 Entity accepts, user acts

Transfer is addressed to `recipient_party_id`.

Any active operational user currently authorized to act for that exact recipient entity may perform receipt acceptance. The event records both:

- recipient entity/party;
- acting user/profile and timestamp.

Changing the Center's human users later does not alter who received the Roll.

### 8.2 Pending transfer and suspension

At creation, sender and recipient must both be active.

After creation:

- recipient becoming suspended blocks normal acceptance until reactivated/admin-resolved because it cannot operate;
- sender becoming suspended does **not** erase an already-created pending physical shipment. An active recipient may still confirm physical receipt because that records reality of a transfer already initiated while sender was authorized;
- suspension never silently cancels or completes existing transfers;
- Admin retains audited exception handling for disputes.

### 8.3 Reservation integrity

A pending transfer reserves its Rolls against a second transfer or conflicting downstream operation.

Acceptance/cancellation/rejection/partial receipt must update reservation and custody atomically with row locking and idempotency so two users cannot accept/cancel the same Roll into contradictory states.

## 9. Production compatibility

No change is required to Product or Production identity semantics.

Future custody initialization should attach to Roll creation through a narrow downstream trigger/backfill rather than editing the already-hardened production RPC merely to add current-custodian state.

This preserves:

- Production Order snapshots;
- Lot/Roll lineage;
- Roll Serial;
- ERP Serial;
- production idempotency;
- 10,000-Roll boundary behavior;
- void audit.

Downstream custody logic must independently reject a Roll whose parent Production Order is voided.

## 10. Migration strategy and legacy data

### 10.1 Append-only

Do not edit historical migrations. New migrations evolve the current schema.

### 10.2 Dealer → Agent mapping

Final model requires every Dealer to have a real Agent.

If an environment already contains Dealers when this migration is applied:

- do not manufacture placeholder Agents;
- production/non-disposable data requires explicit mapping before strict enforcement;
- disposable local/test data may be reset and recreated under the new model.

The hosted production project has not yet been established, so production should start directly with the final strict invariant.

### 10.3 Existing Centers

Existing Centers may remain:

- under existing Dealer after that Dealer is mapped to an Agent; or
- direct Company Center where `dealer_id` and `country_agent_id` are both null.

No historical custody exists yet, so no Roll ownership migration is needed at this foundation stage.

## 11. Current documentation implications

Do not rewrite current-state entity/admin documentation to describe features that have not been implemented yet.

During implementation, update these docs only in the same PR that changes their behavior:

- `docs/operational-entities.md`
- `docs/identity-foundation.md`
- `docs/operational-access.md`
- `docs/dealers-admin.md`
- `docs/installation-centers-admin.md`
- User Administration documentation

The old phrase that `dealers` represents “dealer or agent” must be removed once `country_agents` is implemented.

`center-onboarding-deferred-cube.md` is already promoted/superseded in this documentation branch and points to the new specification.

## 12. Regression risk map

### Highest-risk surfaces

1. profile role/entity check constraint;
2. provisioning trigger;
3. RLS visibility/write policies;
4. scoped Auth Admin actions used by non-Admin Agent/Dealer actors;
5. exact-recipient resolver crossing normal network visibility;
6. Center onboarding route before profile exists.

These require explicit negative tests, not only happy-path UI checks.

### Medium-risk surfaces

- entity creation forms and parent/country derivation;
- user role filters/forms;
- lifecycle UI;
- QR/Transfer ID presentation;
- generated database types.

### Intentionally isolated surfaces

Product and Production should show no semantic/code changes apart from normal regression tests.

## 13. Required implementation test matrix

Before merge, prove at least:

- Admin can create Agent; ordinary users cannot.
- Agent user cannot exist without exact Agent binding.
- Agent A cannot read/manage Agent B network.
- Agent creates Dealer only inside its own Agent scope.
- Agent can provision/manage Dealer account only for own Dealer.
- Dealer cannot create/manage another Dealer.
- Agent/Dealer create Center only in authorized scope with derived correct country.
- Dealer cannot reparent Center to another Dealer.
- Agent can reassign Center only inside its own network; cross-Agent change is Admin-only.
- Center cannot create child entities.
- every entity receives one Transfer ID and one party row atomically.
- Transfer ID is globally unique across entity types and cannot be edited.
- no ordinary global directory query is possible.
- exact active Transfer ID resolves minimal identity; invalid/suspended does not leak details.
- resolver does not permit prefix/partial/list enumeration.
- public signup stays disabled.
- Center invite user cannot choose/forge role or Center ID.
- onboarding route cannot be used by an Auth user without the matching pending invite.
- cancelled/superseded invite cannot provision a profile.
- retrying accepted onboarding cannot create/rebind a second profile.
- Agent/Dealer/Center suspension behavior matches non-cascade rule.
- all existing Auth/User/Product/Production database and build tests remain green.

## 14. No open architectural blocker

After this impact review, there is no known requirement that forces a redesign of completed Product or Production cubes.

The new requirement is concentrated in the operational-network foundation and can be implemented as controlled extensions to Entities, Profiles/Auth, RLS, entity management, Transfer identity, and Center Onboarding.

Implementation should begin only after this documentation branch is reviewed/approved, then proceed in the small sequence defined by `distribution-network-flow-spec.md` rather than as one large change.