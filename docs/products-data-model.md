# Products Data Model

This block introduces the product identity that future production orders, lots, rolls, and warranties can reference.

## Core product fields

`public.products` contains only fields that belong to the product's stable operational identity:

- `id`: internal UUID.
- `code`: unique operational product code.
- `slug`: unique stable URL identifier for the future public product page.
- `name`: product name.
- `default_warranty_months`: default warranty duration for future warranty activation logic.
- `status`: `active` or `archived`.
- `created_at`: creation timestamp.

## Why there are no families or variants yet

The earlier reference architecture included product families and variants. The approved current scope does not require those layers for the Protection Giants PPF flow.

The platform therefore starts with one concrete product entity. A future requirement must demonstrate a real operational distinction before another product hierarchy is introduced.

## Deferred product data

The following concerns are intentionally kept out of the core table and will be introduced as separate cubes only when needed:

- Public descriptions and translated content.
- Technical specifications.
- Product features.
- Images and media.
- PDF catalogues and datasheets.
- Warranty terms or policy versions.
- Public publish/unpublish state.

## Security boundary

RLS is enabled immediately. The core table currently grants no access to `anon` or `authenticated` roles.

Read and mutation policies will be introduced with the specific public-read and admin-management cubes. This prevents a temporary broad policy from becoming an accidental security dependency.

## Lifecycle

Products are not physically deleted through the planned operational interface. The initial lifecycle is intentionally limited to:

- `active`: available for current operational use.
- `archived`: retained for historical references but no longer available for new operational use.

Historical rolls and warranties will continue to reference archived products when those modules are introduced.
