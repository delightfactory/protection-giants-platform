# Installation Center Administration

## Current cube: read access

The admin operations portal exposes `/operations/centers` as the controlled list of installation-center records.

The page:
- requires an active `admin` operational profile;
- reads centers through the existing admin-scoped installation-center RLS policy;
- reads dealer identities through the existing admin dealer scope to resolve optional parent relationships;
- shows center code, name, city, country, parent dealer when present, and lifecycle status;
- identifies centers with no dealer as direct parent-company centers.

## Deliberately not included yet

This read cube does not add:
- center creation;
- center editing;
- suspension/reactivation;
- user provisioning or account assignment;
- addresses, contacts, maps, media, documents, or commercial terms.

Creation follows only after this read path is stable.
