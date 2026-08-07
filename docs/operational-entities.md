# Operational Entities Core

This block establishes the minimum business entities required before operational users can be bound to a real dealer or installation center.

## Why this precedes user administration

A `dealer` or `center` profile must not rely on a free-text organization name. The represented operational entity exists first and receives its own stable identifier; user administration binds accounts to those identifiers rather than duplicating organization data inside profiles.

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

The optional dealer relationship is the ownership/scope boundary available for dealer-specific operations. It does not by itself grant data access.

## Profile binding

The identity layer now references these entities directly:

- a dealer-role profile references one dealer;
- a center-role profile references one installation center;
- an admin profile references neither.

The database enforces that role/entity combination, so future permissions can scope operations by stable IDs instead of names or UI state.

## Security boundary

RLS is enabled on both entity tables.

No anonymous or general authenticated table permissions were granted by the core entity block. Admin management, dealer visibility, center visibility, and business-module access remain explicit permission cubes so each path can be reviewed independently.

## Intentionally deferred

This entity core does not include:
- admin management screens;
- account provisioning;
- role-specific business-module permissions;
- public approved-center pages;
- addresses, maps, media, documents, commercial terms, or other profile content;
- roll, stock, transfer, activation, warranty, or claim logic.
