# Operational Entities Core

This block establishes the minimum business entities required before operational users can be bound to a real dealer or installation center.

## Why this precedes user administration

A `dealer` or `center` profile must not rely on a free-text organization name. The represented operational entity must exist first and receive its own stable identifier. User-to-entity binding and role-specific permissions are therefore built only after this entity layer is stable.

## Dealers

`public.dealers` represents a country dealer or agent.

Core fields:
- `id`: internal UUID.
- `code`: unique uppercase operational code.
- `name`: dealer/agent name.
- `country_code`: two-letter uppercase country code.
- `status`: `active` or `suspended`.
- `created_at`: creation timestamp.

## Installation centers

`public.installation_centers` represents an approved installation-center business record.

Core fields:
- `id`: internal UUID.
- `code`: unique uppercase operational code.
- `name`: center name.
- `dealer_id`: optional parent dealer. A null value keeps direct parent-company centers possible without inventing another hierarchy.
- `country_code`: two-letter uppercase country code.
- `city`: operational city name.
- `status`: `active` or `suspended`.
- `created_at`: creation timestamp.

The optional dealer relationship is the future ownership/scope boundary for dealer-specific operations. It does not yet grant any data access.

## Security boundary

RLS is enabled on both tables immediately.

No anonymous or authenticated table permissions are granted in this block. Admin CRUD, dealer visibility, center visibility, and user binding are intentionally separate cubes so each permission path can be reviewed independently.

## Intentionally deferred

This block does not include:
- user-to-dealer or user-to-center foreign keys;
- admin management screens;
- account provisioning;
- role-specific route/module permissions;
- public approved-center pages;
- addresses, maps, media, documents, commercial terms, or other profile content;
- roll, stock, transfer, activation, warranty, or claim logic.

## Next dependency

The next identity cube may safely bind a `dealer` profile to one dealer and a `center` profile to one installation center, because both target entities now have stable database identities.
