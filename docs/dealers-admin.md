# Dealer Administration

## Current capability

The admin operations portal exposes controlled dealer listing, creation, and core-data editing.

The list page:
- requires an active `admin` operational profile;
- reads dealer records through the existing admin-scoped dealer RLS policy;
- shows code, name, country code, and lifecycle status;
- exposes only write actions whose secured paths already exist.

Creation and core-data editing:
- require the same admin application gate;
- reuse one validation and normalization contract for code, name, and two-letter country code;
- create through an explicit admin-only `INSERT` policy;
- update only the `code`, `name`, and `country_code` columns through column-scoped database privileges plus admin RLS;
- report invalid and duplicate data without bypassing database constraints.

## Deliberately not included yet

This cube does not add:
- suspension/reactivation actions;
- installation-center administration;
- user provisioning or account assignment;
- addresses, contacts, documents, commercial terms, or other dealer-profile extensions.

Dealer lifecycle remains a separate following cube so changing operational status cannot be hidden inside ordinary profile editing.
