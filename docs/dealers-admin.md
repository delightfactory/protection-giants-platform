# Dealer Administration

## Current capability

Dealer administration is network-aware and functionally complete for the current foundation.

### Admin

Admin can list, create, edit, reassign, suspend, and reactivate any Dealer. A Dealer must always belong to a real Country Agent.

### Country Agent

An active Agent can list and manage Dealers belonging to its exact network only. It cannot create, read, mutate, reassign, or lifecycle another Agent's Dealer.

Agent-side forms do not trust a submitted Agent ID: server logic fixes the parent Agent to the caller's own `country_agent_id`.

## Country invariant

The operator does not independently maintain Dealer country. The server reads the selected/authorized Country Agent and stores its country with the Dealer. Database constraints enforce that both remain consistent.

Admin may move a Dealer to another active Country Agent. Agent users cannot reparent a Dealer outside themselves.

## Dealer account management

The Dealer edit surface includes scoped account management for Admin and the owning Agent:

- create a Dealer operational account;
- fixed `role=dealer` and fixed target `dealer_id`;
- suspend/reactivate that account across Auth + Profile lifecycle;
- reset its password.

Before any privileged Auth Admin operation, the target Dealer is first proven visible through the caller's ordinary RLS scope. Privileged Profile reads then include explicit `role=dealer` and exact `dealer_id` predicates.

The Agent never receives `/operations/users` global access or an Auth-user directory.

## Transfer identity

Every Dealer owns exactly one Operational Party and immutable Transfer ID. The Dealer administration surface displays that stable identifier without turning it into an authentication secret.

## Lifecycle

Dealer suspension blocks Dealer users through the operational access gate but does not alter Center statuses below it.

## Deferred downstream behavior

Dealer administration does not itself implement Roll stock/custody/transfers, commercial terms, warranty activation, or generic CRM functionality.
