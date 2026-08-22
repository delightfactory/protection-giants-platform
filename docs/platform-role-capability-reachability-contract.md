# Protection Giants — Role Capability & Reachability Contract

**Date:** 2026-08-22  
**Track:** Platform Experience Harmonization — **NOT a Product Cube**  
**Status:** FROZEN non-regression contract for UX improvements.

## 1. Purpose

This contract protects a core rule:

> A cleaner UI is a regression if it removes, hides, dead-ends or materially obstructs a capability that a role is already authorized to use or needs to complete an approved operational flow.

Platform Experience Harmonization may change navigation, grouping, labels, hierarchy and presentation, but must preserve the role's legitimate capabilities and contextual flow reachability.

Authorization remains owned by Product-domain/RLS contracts. This document does not grant any new permission.

## 2. Three independent dimensions

Every UX change must distinguish:

### Authorization

Can the role actually perform/read the capability under current Product/RLS rules?

### Discoverability

Can the user find the capability without knowing internal module architecture?

### Flow reachability

Can the user reach the capability at the correct point in an operational journey and return/continue without a dead end?

A capability can be authorized but still have poor UX if Discoverability or Flow Reachability fails.

## 3. Destination classes

Every operational destination is classified as one of:

- **Primary destination:** high-frequency role workspace, suitable for persistent navigation;
- **Attention queue:** current work waiting for action, surfaced from Home/notifications/context;
- **Contextual task:** reached at the moment it is needed from another object/flow;
- **Reference / settings / administration:** legitimate but not necessarily persistent bottom-navigation item.

Removing a destination from Bottom Navigation is allowed only if another obvious, tested entry path exists.

## 4. Admin / Company reachability

### 4.1 Must remain reachable

| Capability | Current route family | Class | Non-regression requirement |
|---|---|---|---|
| Operations Home | `/operations` | Primary | Always reachable from shell |
| Operational Accounts | `/operations/users...` | Administration | Admin management access preserved |
| Country Agents | `/operations/agents...` | Administration | list/create/edit preserved |
| Dealers | `/operations/dealers...` | Administration | global Admin management preserved |
| Installation Centers | `/operations/centers...` | Primary/Admin | list/create/edit/support preserved |
| Center approval | `/operations/centers/[id]/approval` | Contextual/queue | reachable from Center context and attention entry |
| Admin Center location correction | `/operations/centers/[id]/location` | Contextual/Admin | reachable from Center detail/edit when needed |
| Products | `/operations/products...` | Reference/Admin | list/create/edit/lifecycle preserved |
| Production Orders | `/operations/production...` | Primary/Admin | list/create/detail/print preserved |
| Roll custody | `/operations/rolls` | Primary | operational custody view preserved |
| Opened Roll Recovery | `/operations/rolls/recovery` | Contextual | Admin access preserved; must not look like ordinary Transfer |
| Pre-install Issues | `/operations/rolls/issues...` | Attention queue | Admin submitted queue/detail/decision preserved |
| Transfers | `/operations/transfers...` | Primary/queue | hub/send/detail/receive/support-resolution preserved where authorized |
| Future Notifications | `/operations/notifications...` after Cube L | Attention/reference | Product-owned capability; UX may place but not redefine |

### 4.2 Admin flow links that must survive

- Center list/detail → approval;
- Center detail → Admin location correction where permitted;
- Production → generated Roll/labels/print context;
- Roll custody → exceptional Recovery only when valid;
- Transfer attention → detail → receive/resolution according to party role;
- Issue queue → issue detail → terminal decision confirmation;
- `return_required` issue → relevant physical Recovery path when actual receipt occurs;
- notification deep links after Cube L → target routes through normal authorization.

## 5. Country Agent reachability

### 5.1 Must remain reachable

| Capability | Current route family | Class | Non-regression requirement |
|---|---|---|---|
| Agent Operations Home | `/operations` | Primary | role-specific entry preserved |
| Own Dealers | `/operations/dealers...` | Primary | create/edit own-scope Dealers preserved |
| Own-network Centers | `/operations/centers...` | Primary | direct/Dealer-child management preserved |
| Center approval | `/operations/centers/[id]/approval` | Contextual/queue | own-network approval/revoke preserved |
| Product reference | `/operations/products` | Reference | **read access must become actually reachable; do not hide capability** |
| Own Roll custody | `/operations/rolls` | Primary | scoped custody view preserved |
| Transfers | `/operations/transfers...` | Primary/queue | send/receive/detail according to current Transfer rules preserved |
| Opened Roll Recovery | `/operations/rolls/recovery` | Contextual | only when Company enabled; scope restrictions preserved |
| Future Notifications | Cube L surface | Attention/reference | only events intended for Agent authority |

### 5.2 Agent flow links that must survive

- Dealer → its Centers where management UX exposes relationship;
- Center → approval task;
- pending incoming Transfer → receipt;
- partial Transfer state → appropriate detail/action;
- custody → Transfer Send;
- eligible exceptional opened-Roll → Recovery when capability enabled;
- Product reference remains read-only; no Admin management controls appear.

## 6. Dealer / Distributor reachability

### 6.1 Must remain reachable

| Capability | Current route family | Class | Non-regression requirement |
|---|---|---|---|
| Dealer Operations Home | `/operations` | Primary | role-specific entry preserved |
| Own Centers | `/operations/centers...` | Primary | create/edit direct Centers preserved |
| Product reference | `/operations/products` | Reference | read access must be reachable without Admin controls |
| Own Roll custody | `/operations/rolls` | Primary | scoped custody preserved |
| Transfers | `/operations/transfers...` | **Primary/queue** | must remain easy to discover on mobile; send/receive preserved |
| Future Notifications | Cube L surface | Attention/reference | only exact Dealer-relevant events |

### 6.2 Dealer flow links that must survive

- Centers list → create/edit Center;
- Center edit/detail → first-user invite/onboarding management where currently allowed;
- custody → Transfer Send;
- incoming Transfer → receipt;
- Product reference available without edit affordances;
- Dealer must never gain Center network-approval authority through UX simplification.

## 7. Installation Center reachability

Center is the primary field/mobile role. Its required flow is a physical Roll journey rather than a collection of modules.

### 7.1 Must remain reachable

| Capability | Current route family | Class | Non-regression requirement |
|---|---|---|---|
| Center Operations Home | `/operations` | Primary | task-oriented entry preserved |
| Own location | `/operations/location` | Reference/contextual | capture/update own device location preserved |
| Product reference | `/operations/products` | Reference | read-only Product access reachable |
| Own Roll custody | `/operations/rolls` | Primary | exact current custody visible |
| Transfer hub/send/detail/receive | `/operations/transfers...` | Primary/queue | shipment receipt/send reachability preserved |
| Roll Opening | `/operations/rolls/open` | Contextual/primary task | QR/manual exact Roll opening preserved |
| Pre-install Issue new | `/operations/rolls/issues/new` | Contextual | reachable immediately after Opening and from issue/history context |
| Own Pre-install Issue history/detail | `/operations/rolls/issues...` | Queue/history | own historical access preserved under Cube K rules |
| Future Warranty Activation | future Product route | Contextual/primary | not invented by UX before Product Cube exists |
| Future Notifications | Cube L | Attention/reference | Center-relevant events only |

### 7.2 Center physical-journey continuity contract

UX changes must preserve and improve these paths:

**Receipt path**

`incoming Transfer → verify physical Rolls → receive exact items → custody updated`

**Normal installation preparation**

`custody → exact Roll → Open Roll → Roll is healthy → continue toward future Activation when that Product Cube exists`

**Issue path**

`custody/open → pre-install problem → submit Issue → clear “Company reviewing / do not use” state → Company result → appropriate next action`

**Return-required path**

`Issue return_required → Center understands Roll must not be used → physical custody changes only when Company/enabled Agent actually performs Recovery`

The Center UI must not describe internal architecture (Cube names, database states, “Recovery” jargon) where a direct operational phrase is clearer.

## 8. Public / pre-auth reachability

UX Harmonization must preserve:

- `/` brand/public entry;
- `/products` published Product directory;
- `/products/[slug]` Product detail;
- `/centers` public registered/approved Center directory;
- `/r/[serial]` contextual Roll QR destination;
- `/login`;
- `/onboarding/center` controlled invite path;
- `/warranty` remains a future lifecycle surface until its Product capability exists.

Public UX changes may not leak private operational identifiers, Transfer IDs, Auth ids or internal hierarchy/audit information.

## 9. Known access contradiction — P0

Current state:

- Agent/Dealer/Center UI exposes Products as an available/reference capability;
- current database contracts permit active operational read access;
- `/operations/products` page itself is Admin-only.

UX closure requirement:

- Admin retains Product management controls;
- Agent/Dealer/Center receive a real read-only operational Product Reference experience using existing authorized data;
- no role loses Product access merely to remove the contradiction;
- no non-Admin gains create/edit/lifecycle controls.

This is Access Correctness, not a new Product capability.

## 10. Before/after evidence required for every UX Slice

Before implementation document:

1. affected roles;
2. affected capability/routes;
3. current entry paths;
4. destination class;
5. upstream/downstream flow links;
6. current authorization contract.

After implementation prove:

- every valid capability remains reachable;
- at least one understandable entry path exists;
- high-frequency/attention tasks are not demoted into obscurity;
- contextual links still appear at point of need;
- no unauthorized role gains controls/data;
- back/cancel/next-step behavior remains coherent;
- mobile and desktop rendered QA passes for affected routes;
- relevant Product-domain regression tests remain unchanged/green.

## 11. Navigation rule

Persistent navigation is not an exhaustive permission list.

A role may have more authorized destinations than fit safely in mobile Bottom Navigation. The UX may use Home/workbench, contextual CTAs or an explicit More/Operations surface for lower-frequency destinations.

However:

> “Not in bottom nav” must never become “practically undiscoverable”.

Navigation design must be justified by role frequency/attention, not by module implementation order.

## 12. Product-track escalation

If an apparent UX fix requires any of the following, stop and move it to Product Development planning:

- new persistent business state;
- new role authority;
- new source-domain lifecycle;
- new cross-role event semantics;
- a new delivery engine/integration;
- a new workflow the user could not previously execute.

Example: Notification Engine was discovered during UX review but correctly escalated to Product Cube L.

## 13. Acceptance

This contract remains in force throughout Platform Experience Harmonization. No UX Slice is merge-ready if it violates role capability reachability even when the resulting screen is visually cleaner.
