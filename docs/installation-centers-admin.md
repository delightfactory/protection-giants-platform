# Installation Center Administration

## Current capability

The admin operations portal exposes controlled installation-center listing, creation, core-data editing, and lifecycle control.

The list page:
- requires an active `admin` operational profile;
- reads centers through the existing admin-scoped installation-center RLS policy;
- resolves optional parent dealer identities through the existing dealer read scope;
- shows center code, name, city, country, parent dealer when present, and lifecycle status;
- identifies centers with no dealer as direct parent-company centers.

Creation and core-data editing:
- require the same admin application gate;
- reuse one validation and normalization contract for code, name, dealer relationship, country, and city;
- use a real optional dealer UUID and preserve direct parent-company centers with a null relationship;
- rely on the dealer foreign key to reject stale or invalid parent references;
- create through an explicit admin-only `INSERT` policy;
- update only `code`, `name`, `dealer_id`, `country_code`, and `city` through column-scoped privileges plus admin RLS.

Lifecycle control:
- grants `status` update separately from ordinary center editing;
- accepts only `active` or `suspended` through the server action;
- reuses the active-admin update RLS boundary;
- immediately affects center-role operational access because the shared access gate requires the bound center to be active.

## Deliberately not included yet

The minimum center administration layer does not add:
- user provisioning or account assignment;
- addresses, contacts, maps, media, documents, or commercial terms.

The minimum dealer and installation-center entity layers are complete. Administrative user provisioning and binding is the next structural layer.
