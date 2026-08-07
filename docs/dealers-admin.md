# Dealer Administration

## Current cube: read access

The admin operations portal exposes `/operations/dealers` as the controlled list of dealer/agent records.

The page:
- requires an active `admin` operational profile;
- reads dealer records through the existing admin-scoped dealer RLS policy;
- shows only the stable operational identity currently stored: code, name, country code, and lifecycle status;
- reuses the existing responsive operations card layout.

## Deliberately not included yet

This read cube does not add:
- dealer creation;
- editing;
- suspension/reactivation actions;
- installation-center administration;
- user provisioning or account assignment.

Those capabilities are added in following cubes after this read path is stable.
