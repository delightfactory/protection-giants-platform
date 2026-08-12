# Distribution Network & Transfer Foundation Specification

**Status:** Approved functional specification — implementation not started  
**Date:** 2026-08-12  
**Scope:** Country Agent, operational hierarchy, Transfer ID, privacy boundary, Center Onboarding, and contracts required by future Roll Custody & Transfers.

## 1. Purpose

This specification closes the network and custody-flow gaps discovered before Production Labels and Roll Custody/Transfers are implemented.

The platform must support Protection Giants as the parent company, Country Agents, Dealers, and Installation Centers without turning the business hierarchy into a rigid physical-transfer route.

The guiding principles are:

1. operational entities exist independently from user accounts;
2. every physical Roll has one confirmed custodian at a time;
3. organizational hierarchy controls management scope and ordinary visibility, not every permitted Roll route;
4. a recipient is identified privately through a stable Transfer ID instead of a global directory;
5. custody does not move until the recipient accepts the transfer;
6. Center Onboarding is invitation-based and preserves the existing trusted Auth provisioning boundary;
7. Product and Production foundations remain closed and are not redesigned for these requirements.

## 2. Terms

- **Parent Company / Company:** Protection Giants. The root operational party.
- **Country Agent / Agent:** a company-authorized operational entity responsible for a country scope.
- **Dealer:** a distributor registered under one Country Agent.
- **Installation Center / Center:** a real operational installation business. It may be under a Dealer, directly under an Agent, or exceptionally direct to the Company.
- **Operational Entity:** Agent, Dealer, or Center business record. It is not a person or Auth user.
- **Operational User:** authenticated person acting for one operational entity.
- **Operational Party:** the thin custody/transfer identity used only to reference Company, Agent, Dealer, or Center uniformly in transfer-related records.
- **Transfer ID:** stable, platform-wide unique, human-shareable identifier for an operational party.
- **Current Custodian:** the operational party holding confirmed custody of a Roll.
- **Pending Transfer:** a transfer created by the current custodian but not yet accepted by the recipient.

## 3. Approved operational hierarchy

The normal management hierarchy is:

```text
Protection Giants / Admin
└── Country Agent
    ├── Dealer
    │   └── Installation Center
    └── Installation Center (direct to Agent)
```

An exceptional direct-Company Center remains possible for support and company-operated locations.

### 3.1 Creation authority

Normal creation paths:

- Admin creates Country Agents.
- Agent creates Dealers in its own country/network.
- Agent may create Centers directly or assign a newly created Center to one of its Dealers.
- Dealer creates Centers under itself.
- Center creates no child operational entity.
- Admin retains support authority to create/correct any operational entity.

### 3.2 Hierarchy is not a transfer route matrix

The hierarchy must not force every Roll through `Company → Agent → Dealer → Center`.

Subject to future custody rules, legitimate examples may include:

- Company → Agent
- Company → Center
- Agent → Dealer
- Agent → Center
- Dealer → Dealer
- Dealer → Center
- Center → Center
- Center → Dealer return
- Dealer → Company return

The transfer engine authorizes the current custodian and the chosen active recipient. It does not infer permission only from parent-child ancestry.

## 4. Country Agent entity and role

### 4.1 New entity

Introduce `public.country_agents` as a distinct entity instead of overloading `public.dealers`.

Target core fields:

- `id uuid primary key`
- `code text unique not null` — administrative/operational code; separate from Transfer ID
- `name text not null`
- `country_code text not null` — two-letter uppercase country code
- `status text not null` — `active | suspended`
- `created_at timestamptz not null`

No database uniqueness rule is placed on `country_code`; more than one Agent may exist in one country unless a later explicit exclusivity policy changes that.

### 4.2 Dealer relationship

A Dealer belongs to exactly one Country Agent in the target business model.

Add:

- `dealers.country_agent_id uuid references country_agents(id) on delete restrict`

**Target invariant:** `country_agent_id` is required for every Dealer.

Implementation migration must not invent a fake Agent to satisfy pre-existing data. Before enforcing `NOT NULL`, any non-empty environment with existing Dealers must either map them explicitly to real Agents or be reset if it is a disposable local/test environment. The future hosted production schema must begin with the strict invariant.

A Dealer's `country_code` must equal its Agent's country. Child creation should derive the country from the Agent instead of asking the operator to type it again.

### 4.3 Center relationship

Keep existing `installation_centers.dealer_id` and add:

- `installation_centers.country_agent_id uuid references country_agents(id) on delete restrict`

Relationship meaning:

- `dealer_id != null`, `country_agent_id = null` → Center is under Dealer; Agent is derived through Dealer.
- `dealer_id = null`, `country_agent_id != null` → Center is directly under Agent.
- both null → exceptional direct-Company Center.
- both non-null → invalid.

A Center's country must match its direct parent. If the parent is a Dealer, the Dealer's Agent and country are authoritative. The country should be derived/validated by the platform, not independently typed in ordinary child creation.

### 4.4 Reparenting

Parent assignment is not an ordinary cosmetic edit.

- Dealer → different Agent: Admin-only correction.
- Center → different Dealer inside the same Agent network: Agent may perform the reassignment; Admin may always correct.
- Cross-Agent Center move: Admin-only correction.
- Dealer may not move a Center to another Dealer.

Every future reparenting action that can alter management visibility should be explicit and auditable. It must not rewrite historical Roll custody or Transfer records.

## 5. Operational profile and Auth impact

### 5.1 New role binding

Add operational role `agent` and `profiles.country_agent_id`.

The database-enforced profile binding becomes:

- `admin`: all entity bindings null.
- `agent`: exactly one `country_agent_id`; Dealer/Center bindings null.
- `dealer`: exactly one `dealer_id`; Agent/Center bindings null.
- `center`: exactly one `installation_center_id`; Agent/Dealer bindings null.

Multiple users may still represent the same entity. Entity identity is organizational; user identity is personal.

### 5.2 Operational access gate

`requireOperationalProfile()` must gain an Agent typed profile and verify the bound Agent is active, exactly as Dealer and Center active-state gates are currently enforced.

Suspending an Agent blocks Agent users but **does not automatically suspend** Dealers or Centers below it. Likewise, Dealer suspension continues not to cascade to Centers. Cascading lifecycle would conflate separate businesses and is not introduced.

### 5.3 Trusted provisioning

The existing `pg_provisioning` contract remains the only trusted route for authorization-sensitive profile creation.

It must be extended to accept:

- `role = agent`
- `country_agent_id` for Agent users

The trigger must continue to reject invalid role/entity combinations and must remain idempotent.

User-editable metadata must never be used to choose `role`, `country_agent_id`, `dealer_id`, or `installation_center_id`.

### 5.4 User administration

Existing Admin User Management must be extended, not rebuilt:

- list/filter Agent users;
- create trusted Agent users bound to a real Agent;
- edit role/entity binding with the expanded invariant;
- preserve Auth email/password/lifecycle behavior;
- preserve self-demotion/self-suspension protections.

The server-only Data API grant for profile updates must include `country_agent_id`. `country_agents` must receive only the explicit service-role read access actually required by existing Admin Auth workflows.

## 6. Network visibility and management authorization

The platform must not expose a global directory of operational entities to ordinary users.

### 6.1 Read visibility

- **Admin:** all Agents, Dealers, Centers.
- **Agent:** itself, Dealers belonging to it, direct Centers belonging to it, and Centers beneath its Dealers.
- **Dealer:** itself and Centers belonging to it.
- **Center:** itself only.

A user outside this normal visibility scope can resolve a transfer recipient only by exact Transfer ID through the dedicated resolver described below.

### 6.2 Child management

- **Admin:** full Agent/Dealer/Center administration.
- **Agent:** create/edit/lifecycle Dealers in its network; create/edit/lifecycle direct Centers; may lifecycle Centers anywhere in its own network and may reassign a Center within its own network.
- **Dealer:** create/edit/lifecycle Centers directly assigned to it.
- **Center:** no entity administration.

An Agent may not manage another Agent's network. A Dealer may not manage another Dealer's Centers.

### 6.3 Lifecycle visibility

A parent authorized to manage a child must still be able to see a suspended child so it can reactivate it. This management read path is distinct from the child's own operational access gate.

No suspension automatically rewrites child status.

## 7. Operational Party registry

### 7.1 Why a thin registry is required

Future custody and transfer records need one stable foreign key for “who holds / sends / receives this Roll”. Repeating nullable `agent_id`, `dealer_id`, and `center_id` columns in every custody table would make constraints and queries fragile.

Introduce a **thin, purpose-specific** `public.operational_parties` registry.

This is **not** a generic Organizations subsystem and does not replace the canonical Agent, Dealer, or Center tables.

### 7.2 Target shape

Conceptual fields:

- `id uuid primary key`
- `party_type text not null` — `company | agent | dealer | center`
- `country_agent_id uuid null`
- `dealer_id uuid null`
- `installation_center_id uuid null`
- `transfer_code text not null unique`
- `created_at timestamptz not null`

Binding constraint:

- Company party: all entity FKs null.
- Agent party: only `country_agent_id` non-null.
- Dealer party: only `dealer_id` non-null.
- Center party: only `installation_center_id` non-null.

Each entity FK is unique when present so one business entity cannot receive multiple party identities.

Exactly one singleton Company party exists and represents Protection Giants in custody history.

### 7.3 Automatic creation

A party row and Transfer ID must be created atomically whenever an Agent, Dealer, or Center is created.

Existing Dealer/Center rows must be backfilled during the foundation migration.

Direct client creation/update of `operational_parties` is not exposed. Generation belongs to controlled database/server logic.

## 8. Transfer ID

### 8.1 Purpose

Transfer ID identifies a recipient without exposing a global directory. It is analogous to an account number, not an authentication OTP.

It is:

- globally unique across Company/Agent/Dealer/Center party identities;
- generated automatically;
- stable and immutable in normal operation;
- visible to the entity's authorized users;
- intentionally shareable by copy or QR;
- distinct from the entity administrative `code`;
- not a secret and not sufficient by itself to transfer custody.

### 8.2 Recommended format

Use a short type prefix plus 12 random human-friendly uppercase characters divided into groups, for example:

- `PG-A-7K4M-9P2Q-X8RD`
- `PG-D-M6YT-4R8K-W2PC`
- `PG-C-H7QF-3M9X-T5VK`

Use an alphabet that avoids visually ambiguous characters such as `0/O` and `1/I`. Database `UNIQUE` remains the final collision guard and generation retries on collision.

Country is deliberately not encoded. Transfer identity must remain stable if administrative location data is corrected later.

### 8.3 No rotating TOTP

Time-based codes are not used. They would introduce clock synchronization, secret management, expiry races, and live coordination without solving the actual recipient-identification problem.

Security instead comes from custody authorization, exact recipient resolution, and recipient acceptance.

## 9. Exact recipient resolution and privacy

No ordinary user receives table-level access to browse every Agent, Dealer, or Center.

A dedicated exact-match RPC/function, conceptually `resolve_transfer_recipient(transfer_code)`, should:

1. require an authenticated active operational profile;
2. accept one exact Transfer ID only;
3. resolve only an active recipient;
4. return the minimum verification card data;
5. return no result for invalid/suspended codes;
6. never return a search/list of nearby codes.

Minimum verification response:

- party ID (internal transfer use only)
- entity type
- entity display name
- country
- city for Center when available
- optional operational entity code if useful for human confirmation

Do not return Auth email, private phone, full network membership, or unrelated entity data.

The resolver requires an explicit authenticated `EXECUTE` grant because project default privileges intentionally deny new function execution.

A random, high-entropy Transfer ID plus exact matching prevents practical enumeration without introducing OTP complexity.

## 10. Center Onboarding — current prerequisite

Center Onboarding is promoted from a deferred enhancement to a current foundation requirement because recipient acceptance creates a real operational gap when a new Center has no account yet.

### 10.1 Scope

Invitation-based onboarding applies to **Centers only**.

- Agents are created/coded by Protection Giants/Admin.
- Dealers are created/coded by Agents.
- Centers may be onboarded through invitation after their entity record exists.

Public operational signup remains disabled.

### 10.2 Entity-first flow

1. Agent or Dealer creates a real Center entity within its permitted network.
2. Platform creates the Center party and Transfer ID automatically.
3. The Center may already be selected as a pending transfer recipient even with zero users.
4. Authorized parent initiates a Center invitation by email.
5. Supabase Auth sends the invite from the trusted server-side Admin path.
6. Recipient opens the invite and reaches a dedicated onboarding route.
7. Recipient sets their password and supplies minimal personal profile data (display name; phone optional).
8. Trusted server finalizes protected `pg_provisioning` with `role=center` and the predetermined `installation_center_id`.
9. Existing provisioning trigger creates the operational profile.
10. Center can enter Operations and accept pending Transfers.

The recipient never selects role, Agent, Dealer, or Center binding.

### 10.3 Auth integration contract

Use Supabase Admin invitation functionality only from the existing server-only Admin client boundary. Never expose the service/secret key to browser code.

The invite may initially create an Auth user without `pg_provisioning`; the existing trigger safely performs no operational provisioning when protected metadata is absent.

The onboarding route is a special authenticated route that can exist **before** an operational profile exists. It validates that the current Auth user has a live invitation record and may finalize only the predetermined Center binding.

Before setting protected provisioning metadata, the recipient's display name and optional phone must be available in Auth user metadata so the current profile trigger can copy them into `public.profiles`.

Setting protected `app_metadata.pg_provisioning` remains a trusted server-side action; the trigger then creates the profile using the same invariant as Admin-created users.

### 10.4 Invitation audit

Introduce a narrow `center_onboarding_invitations` record, conceptually containing:

- `id`
- `installation_center_id`
- `invited_email`
- `auth_user_id`
- `invited_by_profile_id`
- `status` — `pending | accepted | cancelled | superseded`
- `created_at`
- `accepted_at`
- `cancelled_at`

Do not store raw Supabase invite tokens.

Initial scope supports one active onboarding invitation for a Center at a time. Additional Center users remain managed through the existing administrative user-management capability unless a later requirement proves a separate self-service member-invite flow is needed.

### 10.5 Conflict handling

- Email already belongs to an operational user for another entity → reject; never auto-rebind.
- Email already belongs to an operational user for the same Center → no new initial onboarding is required.
- Existing Auth user with no expected invitation/profile → reject for administrative resolution; do not silently claim it.
- Expired/cancelled invitation → cannot provision; authorized parent may reissue.
- Unclaimed invitation cleanup may delete the newly created unclaimed Auth user as compensating cleanup when necessary.
- Once an operational profile exists, normal lifecycle is suspension, not deletion.

### 10.6 Production email prerequisite

Production invitation delivery requires correct Supabase Site URL / redirect allowlist and production-grade custom SMTP. The default Supabase SMTP is not treated as a production delivery dependency.

This is a deployment prerequisite, not a reason to weaken Auth or enable public signup.

## 11. Operational Center is not Warranty-approved Center

Center operational registration and warranty authorization are separate concepts.

- **Operationally registered/active Center:** can exist, receive custody, and use the operational platform according to module permissions.
- **Warranty-approved Center:** may later perform official Roll opening/activation and appear in approved-center public experiences according to the future Activation/Public Center rules.

Current `installation_centers.status = active | suspended` continues to mean operational lifecycle only.

Do not overload it with warranty approval and do not add a warranty-approval field until the Activation/Public Center cube needs it.

Center Onboarding never grants warranty approval automatically.

## 12. Future Roll Custody & Transfers contract

This specification does not implement the Transfer cube, but freezes the contracts that foundation work must support.

### 12.1 Current custody

Custody references `operational_parties.id`, never a User ID.

A future `roll_custody` projection may conceptually contain:

- `roll_id` — one row per Roll
- `current_party_id`
- `reserved_transfer_id null`
- `updated_at`

The immutable transfer/custody event history remains the audit source; the current row is the fast current-state projection.

### 12.2 Initial custody without reopening Production RPC

Existing and newly produced Rolls start in Company custody.

To preserve the closed Production cube:

- backfill existing Rolls to the singleton Company party when Custody foundation is introduced;
- add a narrow database trigger on future `rolls` inserts to create the Company custody row;
- do not rewrite the long `create_production_order` RPC solely for custody initialization.

### 12.3 Transfer creation

Sender may create a Transfer only for Rolls whose confirmed current custodian is the sender party.

For every selected Roll, creation must atomically verify:

- current custodian = sender;
- no conflicting reservation;
- parent Production Order is not voided;
- recipient is active and not the sender;
- request is idempotent.

The selected Roll becomes reserved but its confirmed custodian does not change yet.

### 12.4 Pending receipt

While awaiting recipient response:

- custody remains with sender;
- Roll is `Reserved — Pending Transfer`;
- it cannot participate in another transfer or conflicting downstream action.

Recipient acceptance moves custody. Whole-transfer rejection or sender cancellation before any receipt releases the reservation and preserves sender custody.

No automatic expiry is required in the first release.

### 12.5 Partial receipt

If 20 Rolls are sent and only 19 are physically received:

- recipient may receive the 19 confirmed Rolls;
- those 19 move custody;
- the unresolved Roll does not move custody;
- unresolved Roll remains reserved while physical location is uncertain;
- later receipt or explicit sender/admin resolution closes the discrepancy.

The platform must never silently mark all items received.

### 12.6 Transfer input modes

Future UX supports:

- **Scan Rolls** — small/mixed physical movement;
- **Select Rolls** — known subset;
- **Select Lot** — bulk homogeneous movement.

Selecting a Lot is one operator action but the system expands it into individual Roll transfer items for traceability.

If a 500-Roll Lot has only 480 Rolls currently held/eligible, UI must show `500 total / 480 available / 20 elsewhere` and require explicit confirmation of the 480 available; it must not call the move a complete-Lot transfer.

Per-Roll scanning is therefore a confirmation method, not a mandatory step for every trusted bulk Lot movement.

## 13. Transfer user experience contract

Recipient selection is intentionally simple and private:

```text
Transfer Rolls
→ Enter / scan recipient Transfer ID
→ Verify recipient card
→ Scan / select Rolls or Lot
→ Review quantity
→ Send
→ Recipient accepts
→ Custody changes
```

Do not ask users to traverse `Country → Agent → Dealer → Center` trees for normal transfers.

Within their own management network, ordinary entity lists remain available for administration. For a transfer to a party outside that visible network, exact Transfer ID is the route to recipient discovery.

Future convenience such as “recent counterparties” may be derived from real transfer history; it must not become a hidden global directory.

## 14. Printing implications

Network Transfer ID and its QR identify an operational recipient. They do **not** belong to Roll identity and must not be conflated with:

- Product marketing QR;
- Roll Serial;
- ERP Serial;
- Activation credential;
- Warranty identifier.

The entity Transfer ID/QR belongs in entity/account/network experiences and may be shown/printed as a recipient card if useful later.

Production Labels remain a separate cube and may resume after this network foundation is implemented and validated.

## 15. Existing foundation impact map

### Must be extended

- Operational Entities: add Country Agent and parent relationships.
- Profiles: add Agent role/binding.
- Operational access gate: Agent typed profile and active-state gate.
- Entity RLS: Agent network visibility + hierarchical child management.
- Trusted profile provisioning: Agent role/binding support.
- Admin User Management: Agent role/entity support.
- Explicit Data API grants: Agent table/profile Agent binding where required.
- Center administration: Agent/Dealer child creation paths; country derivation; parent-scoped edits/lifecycle.
- Dealer administration: Agent-scoped creation/management in normal flow.
- Center Onboarding documentation/implementation.

### Must remain unchanged in meaning

- Auth remains email-first; public signup disabled.
- `public.profiles` remains operational authorization source.
- Entity-first user binding remains.
- Product definition remains stable product data.
- Production Order/Lot/Roll identity and immutable snapshots remain.
- Roll Serial and ERP Serial remain separate.
- Voided Production Order blocks downstream operations.
- No operator hard-delete for established users.

### Must not be introduced now

- generic organization/RBAC engine;
- global entity directory;
- rotating TOTP Transfer IDs;
- public operational signup;
- Roll-serial-based self-registration;
- accounting/invoicing/shipping ERP;
- warranty approval inside operational status;
- customer/VIN/Activation/Claims logic;
- generalized logistics routes.

## 16. Database and security verification contract

Before this foundation can be merged, automated/local verification must cover at least:

### Schema/invariants

- fresh migration chain succeeds;
- generated types match schema;
- Agent code/country/status constraints;
- Dealer requires one real Agent in target model;
- Dealer country equals Agent country;
- Center cannot have both Agent and Dealer parent;
- Center country matches direct/derived parent;
- role/entity profile invariant includes Agent;
- one operational party per entity;
- one singleton Company party;
- Transfer ID globally unique and immutable.

### Auth/provisioning

- trusted Agent provisioning succeeds with Agent binding;
- Agent without Agent binding is rejected;
- Agent with Dealer/Center binding is rejected;
- existing Admin/Dealer/Center provisioning remains green;
- public signup remains rejected;
- Center invitation recipient cannot select/forge role or Center binding;
- invalid/cancelled onboarding cannot create profile;
- conflicting existing operational email does not auto-rebind.

### RLS/privacy

- Admin sees all network entities;
- Agent sees/manages only its network according to this spec;
- Dealer sees/manages only its Centers;
- Center sees itself only;
- cross-network direct table browse is denied;
- exact Transfer ID resolver can identify an active cross-network target by exact code only;
- invalid/suspended Transfer ID returns no recipient details;
- ordinary users cannot enumerate recipient directory;
- suspended entity user cannot enter Operations;
- parent suspension does not silently mutate child statuses.

### Existing regressions

All existing Product, Production, User Administration, Auth provisioning, Data API grant, and build/type checks must remain green.

## 17. Implementation sequence

Implement in small completed increments, without mixing future Transfer logic into the network foundation:

1. **Agent + hierarchy schema foundation** — Agent entity, parent relationships, country invariants.
2. **Agent identity/access extension** — profiles, trusted provisioning, operational gate, types.
3. **Network RLS and management** — Admin/Agent/Dealer/Center read and child-management scopes.
4. **Operational Party + Transfer ID foundation** — singleton Company party, entity party creation/backfill, exact resolver.
5. **Admin/User UI Agent support** — complete the existing Users capability for Agent role.
6. **Agent/Dealer/Center management UI extension** — normal child creation/management flows.
7. **Center Onboarding** — invitation audit, invite/accept flow, trusted Center provisioning.
8. **Full regression and mobile validation.**

Only after this foundation is closed should development return to the next business cube. Production Labels can then proceed with the network/recipient model fixed, followed by Roll Custody & Transfers using the contracts in this document.

## 18. Acceptance definition

This foundation is complete only when a realistic network can be operated without Parent Company intervention in normal downstream setup:

1. Admin creates a Saudi Country Agent and its operational user.
2. Saudi Agent logs in and creates a Dealer.
3. Agent or Dealer creates a Center.
4. Center receives a stable Transfer ID immediately.
5. Parent sends an onboarding invite to the Center.
6. Center representative accepts, sets up the account, and is bound to the predetermined Center with no public signup and no ability to choose another role/entity.
7. Agent sees its whole network; Dealer sees its own Centers; Center sees itself; outsiders cannot browse the network.
8. An authenticated external sender who knows the Center's exact Transfer ID can resolve only the minimal recipient verification card.
9. Existing Admin/Dealer/Center users, Products, Production Orders, Lots, and Rolls continue to operate under their existing contracts.

At that point the platform has a stable distribution-network foundation on which Labels, Custody/Transfers, Activation, and Warranty can be built without reopening identity architecture.