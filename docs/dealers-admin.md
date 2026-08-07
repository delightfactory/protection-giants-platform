# Dealer Administration

## Current capability

The admin operations portal exposes controlled dealer listing, creation, core-data editing, and lifecycle control.

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

Lifecycle control:
- grants `status` update separately from ordinary profile editing;
- accepts only `active` or `suspended` through the server action;
- reuses the active-admin update RLS boundary;
- immediately affects dealer-role operational access because the shared access gate requires the bound dealer to be active.

## Deliberately not included yet

Dealer administration does not yet add:
- installation-center administration;
- user provisioning or account assignment;
- addresses, contacts, documents, commercial terms, or other dealer-profile extensions.

The minimum dealer administration layer is complete at this point. Installation centers are the next dependent entity layer.
