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

The following concerns remain outside the core table and will be introduced as separate cubes only when needed:

- Public descriptions and translated content.
- Technical specifications.
- Product features.
- Images and media.
- PDF catalogues and datasheets.
- Warranty terms or policy versions.
- Public publish/unpublish state.

## Security boundary

RLS is enabled on the core table.

Authenticated users receive table-level `SELECT`, but `products_admin_read` only returns rows when the current profile is both `active` and `admin`.

Authenticated users receive `INSERT`, but `products_admin_insert` only accepts rows from an active admin.

Update access is intentionally column-scoped. Authenticated users are granted UPDATE only for `code`, `name`, `slug`, and `default_warranty_months`, and `products_admin_update` additionally requires an active admin profile for both the existing and resulting row.

The operational interface mirrors those rules with an admin route gate. Create and edit actions both use the same Product Core parser and convert duplicate code/slug failures into user-safe messages.

`id`, `created_at`, and `status` are not covered by the current UPDATE grant. Archive/reactivate will therefore require its own explicit lifecycle cube rather than piggybacking on general product editing.

No delete or anonymous access is granted.

## Creation and editing

Product Core accepts only:

- product code;
- product name;
- explicit lowercase ASCII URL slug;
- default warranty duration in months.

New products use the database default `active` status. The edit form cannot change lifecycle state.

The slug is explicit rather than silently generated from the Arabic product name because it becomes a stable public URL identifier later.

## Lifecycle

Products are not physically deleted through the planned operational interface. The initial lifecycle is intentionally limited to:

- `active`: available for current operational use.
- `archived`: retained for historical references but no longer available for new operational use.

Historical rolls and warranties will continue to reference archived products when those modules are introduced.
