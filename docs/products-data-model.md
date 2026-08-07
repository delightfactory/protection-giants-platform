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

RLS is enabled on the core table.

Authenticated users receive table-level `SELECT`, but the `products_admin_read` policy only returns rows when the current user's own profile is both `active` and `admin`. Dealer and center sessions therefore cannot read the product core through the Data API.

Authenticated users also receive table-level `INSERT`, but the `products_admin_insert` policy accepts a new row only when the current user's own profile is both `active` and `admin`.

The operations application mirrors those boundaries with an admin route gate. Product creation is executed by a server action that validates all submitted fields before attempting the insert and maps duplicate-code or duplicate-slug database errors to a user-safe message.

No update, delete, archive action, or anonymous access is granted yet. Those operations will be introduced only with the cubes that actually need them.

## Creation behavior

The first creation flow accepts only:

- product code;
- product name;
- explicit lowercase ASCII URL slug;
- default warranty duration in months.

The status is not exposed in the creation form. New products use the database default of `active`.

The slug is explicit rather than silently generated from the Arabic product name because it becomes a stable public URL identifier later.

## Lifecycle

Products are not physically deleted through the planned operational interface. The initial lifecycle is intentionally limited to:

- `active`: available for current operational use.
- `archived`: retained for historical references but no longer available for new operational use.

Historical rolls and warranties will continue to reference archived products when those modules are introduced.
