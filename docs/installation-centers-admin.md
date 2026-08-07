# Installation Center Administration

## Current capability

The admin operations portal exposes controlled installation-center listing, creation, and core-data editing.

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

## Deliberately not included yet

This cube does not add:
- suspension/reactivation;
- user provisioning or account assignment;
- addresses, contacts, maps, media, documents, or commercial terms.

Center lifecycle remains a separate following cube so operational suspension is not hidden inside ordinary profile editing.
