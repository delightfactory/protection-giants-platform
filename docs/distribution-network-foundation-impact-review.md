# Distribution Network Foundation — Implementation Impact Review

**Specification:** `docs/distribution-network-flow-spec.md`  
**Implementation branch:** `agent/agent-network-foundation`  
**Review state:** implementation present; double-review gates must pass before merge.

## Implemented surfaces

The approved network foundation has been implemented without redesigning Product or Production.

### Database / hierarchy

- distinct `country_agents` entity;
- strict Dealer → Country Agent relationship and country consistency;
- Center parent modes: Company / Agent / Dealer with country consistency;
- `agent` Profile role and exact entity binding;
- network-scoped RLS for Admin/Agent/Dealer/Center;
- non-cascading entity lifecycle.

### Operational Party / Transfer ID

- singleton Company party plus one party per Agent/Dealer/Center;
- atomic entity→party creation/backfill;
- immutable high-entropy Transfer ID;
- no ordinary global party directory;
- exact authenticated recipient resolver with minimal response;
- Agent operational Product reference read added without Product mutation access.

### Application management

- Admin Country Agent CRUD/lifecycle;
- Agent-scoped Dealer CRUD/lifecycle;
- Agent/Dealer-scoped Center CRUD/lifecycle;
- parent/country values derived/validated server-side rather than trusted from hidden inputs;
- role-aware mobile/desktop navigation and operations home;
- Agent-scoped Dealer account create/suspend/reactivate/password reset without exposing global User Administration;
- global User Administration extended to Agent role/binding.

### Center invitation onboarding

- server-only invitation audit with no raw tokens;
- one Open (`pending|accepted`) invitation per Center/email/Auth user;
- server-side Auth invitation and exact email conflict check;
- token-hash confirmation route;
- dedicated authenticated pre-Profile onboarding route;
- staged non-security metadata before protected app metadata;
- conditional invitation claim before Profile provisioning;
- cancellation/reissue race protection and compensating Auth cleanup;
- exact resulting Profile verification and fail-closed exceptional handling.

## Security boundaries retained

- public operational signup stays disabled;
- `pg_provisioning` remains the only automatic authorization-sensitive Profile creation contract;
- service/secret key remains server-only;
- table RLS remains the normal entity authorization boundary;
- ordinary users receive no global entity/Auth/invitation directory;
- Transfer ID is a shareable recipient identifier, not an authentication secret;
- operational Center lifecycle is not warranty approval.

## Migration/deployment behavior

The implementation is append-only relative to merged historical migrations. The strict Dealer→Agent migration deliberately refuses to invent placeholder Agents if non-empty legacy Dealer data exists.

The future hosted production project can start directly with the strict schema. Hosted Center invitation delivery still requires production Site URL/redirect configuration, equivalent invite template, and production-grade SMTP. These are deployment prerequisites and are not committed secrets.

## Verification matrix implemented

Database Quality rebuilds a fresh local Supabase stack from all migrations and checks:

- Auth configuration/public-signup boundary;
- profile auto-provisioning and Admin profile read scope;
- explicit Data API grants;
- operational user lifecycle;
- operational entity lifecycle and access status;
- Agent/network hierarchy, cross-network isolation and Company-direct Center isolation;
- party/Transfer-ID generation, immutability, exact resolver and suspended-recipient behavior;
- Center onboarding audit privacy and protected provisioning;
- Center onboarding state/race contracts (`pending`, `accepted`, `cancelled`, `superseded`);
- Product constraints/access/storage;
- Production foundation and large boundary behavior;
- generated `database.types.ts` parity.

PR Quality checks TypeScript, production Next.js build, and build integrity.

## Double-review gate

No merge is allowed merely because CI is green.

### Review 1 — comprehensive implementation review

Must inspect the complete DB/Auth/RLS/Server/UI/failure-path surface and fix every confirmed finding, then rerun all gates on the resulting head.

### Review 2 — independent fresh review

Must reread the approved specification/product decisions and re-review the complete final diff against `main`, including cross-network regressions and mobile reachability, then rerun the final unchanged head through CI.

The PR remains Draft until both reviews pass. Merge still requires explicit approval after the review report.

## Explicit non-goals

This foundation does not implement Roll transfer/custody records, pending-transfer reservation, warranty activation/approval, public approved-center discovery, KYC/CRM onboarding, or a generalized RBAC/ERP framework. Those remain later cubes built on this completed network identity foundation.
