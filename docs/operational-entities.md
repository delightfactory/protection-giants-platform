# Operational Entities & Network Identity

## Current model

The operational hierarchy is implemented as distinct business entities:

- `public.country_agents`: Country Agents created and controlled by Protection Giants/Admin.
- `public.dealers`: Dealers/Distributors. Every Dealer belongs to exactly one Country Agent.
- `public.installation_centers`: Installation Centers. A Center may be under one Dealer, directly under one Country Agent, or exceptionally direct to Protection Giants.

Entity identity is independent from Auth users. Multiple users may represent the same entity without changing the entity or its future custody history.

## Country Agent

Core fields are `id`, unique operational `code`, `name`, two-letter uppercase `country_code`, `status = active | suspended`, and `created_at`.

Country code is not unique; multiple Agents may exist in one country.

## Dealer

Every Dealer has `country_agent_id NOT NULL`. The database enforces that the Dealer country equals the selected Agent country.

Ordinary creation does not ask the operator to maintain a second independent country value: application actions derive the Dealer country from the selected Agent.

## Installation Center

Center parent rules are database-enforced:

- `dealer_id != null`, `country_agent_id = null`: under Dealer.
- `dealer_id = null`, `country_agent_id != null`: direct to Agent.
- both null: direct to Company.
- both non-null: invalid.

For Agent/Dealer parent paths, the Center country is derived from the parent and validated by composite foreign-key constraints. Company-direct Centers retain an explicit country because no parent supplies one.

## Operational Party and Transfer ID

Every Company/Agent/Dealer/Center receives exactly one row in `public.operational_parties`.

The party registry is intentionally thin. It exists only to provide:

1. one uniform future custody identity; and
2. one stable platform-wide `transfer_code` (Transfer ID).

Transfer IDs are generated automatically, globally unique, immutable through the Data API, and do not encode country. Creating an Agent, Dealer, or Center atomically ensures its party exists; entity creation fails if party creation fails.

Ordinary users cannot browse a global party directory. They can see parties only within their normal management scope. A separate exact Transfer-ID resolver may cross normal hierarchy visibility and returns only minimal recipient verification data.

## Management hierarchy and RLS

Read/management scope is enforced by database RLS, not hidden fields:

- Admin: all Agents, Dealers, Centers.
- Agent: own Agent, own Dealers, direct Centers, and Centers under own Dealers.
- Dealer: own Dealer and directly assigned Centers.
- Center: own Center only.

Company-direct Centers are Admin-only in ordinary visibility.

Child management follows the same hierarchy. Suspension does not cascade to descendant entity status.

## Profile binding

Operational profiles bind to exactly one represented entity:

- Admin: no entity binding.
- Agent: exactly one `country_agent_id`.
- Dealer: exactly one `dealer_id`.
- Center: exactly one `installation_center_id`.

These constraints are enforced in PostgreSQL and mirrored by application validation.

## Not part of this foundation

This foundation does not implement Roll custody/transfer records, warranty activation/approval, public approved-center pages, CRM/KYC, or a generic organization/RBAC engine. Those later modules consume the stable entities and party identities defined here.
