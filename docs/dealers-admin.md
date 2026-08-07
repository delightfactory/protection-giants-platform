# Dealer Administration

## Current capability

The admin operations portal exposes `/operations/dealers` as the controlled list of dealer/agent records and `/operations/dealers/new` as the minimal creation path.

The list page:
- requires an active `admin` operational profile;
- reads dealer records through the existing admin-scoped dealer RLS policy;
- shows code, name, country code, and lifecycle status;
- exposes the create action only after the secured insert path exists.

The creation path:
- requires the same admin application gate;
- validates and normalizes the operational code and two-letter country code;
- inserts through an explicit dealer `INSERT` RLS policy restricted to active admins;
- reports invalid and duplicate data without bypassing database constraints;
- returns to the controlled dealer list after a successful insert.

## Deliberately not included yet

This cube does not add:
- dealer editing;
- suspension/reactivation actions;
- installation-center administration;
- user provisioning or account assignment;
- addresses, contacts, documents, commercial terms, or other dealer-profile extensions.

Dealer edit and lifecycle controls remain separate following cubes so each write path can be reviewed independently.
