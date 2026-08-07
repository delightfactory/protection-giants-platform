# Installation Center Administration

## Current capability

The admin operations portal exposes controlled installation-center listing and creation.

The list page:
- requires an active `admin` operational profile;
- reads centers through the existing admin-scoped installation-center RLS policy;
- resolves optional parent dealer identities through the existing dealer read scope;
- shows center code, name, city, country, parent dealer when present, and lifecycle status;
- identifies centers with no dealer as direct parent-company centers.

The creation path:
- requires the same admin application gate;
- validates and normalizes center code, name, country and city;
- accepts an optional real dealer UUID rather than free-text ownership;
- relies on the dealer foreign key to reject stale or invalid parent references;
- inserts through an explicit installation-center `INSERT` policy restricted to active admins.

## Deliberately not included yet

This cube does not add:
- center editing;
- suspension/reactivation;
- user provisioning or account assignment;
- addresses, contacts, maps, media, documents, or commercial terms.

Core editing follows as the next independent write cube.
