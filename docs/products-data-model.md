# Products Data Model

This document defines the stable Product Foundation used by future production orders, lots, rolls, labels, public product pages, and warranties.

## Product boundary

`public.products` represents a reusable product definition. It stores values that describe the product itself and remain meaningful across many production orders and physical rolls.

It must not store production-instance data such as lot numbers, batch dates, physical roll serials, ownership, transfers, installation events, activation codes, or customer warranty records.

## Canonical identity

- `id`: internal UUID. It is also readable for active published Products so the public server route can correlate explicitly public asset metadata. It is not a customer-facing business identifier.
- `code`: canonical SKU / operational product code for the first release.
- `slug`: unique stable lowercase ASCII URL identifier.
- `name`: product name.
- `product_type`: operational product type. The first release defaults to `PPF`.
- `category`: optional business category.
- `version_name`: optional model/version designation.
- `status`: operational lifecycle state: `active` or `archived`.
- `created_at`: creation timestamp; not exposed anonymously.

A second SKU field is intentionally not introduced. Physical roll serials, ERP serials, lot numbers, and warranty/activation codes are separate identifiers owned by their later business objects.

## Reference commercial data

- `reference_price`: optional non-negative reference/display price.
- `currency_code`: required three-letter uppercase currency code when a reference price is present.

This is not a transaction ledger. Future orders, invoices, or sales must snapshot their own financial values if historical pricing is required.

Reference price and currency are intentionally excluded from anonymous Product reads until a later business decision explicitly makes pricing public.

## Nominal PPF specification data

The product stores the stable nominal values required by the client and future labels/production flows:

- `width_mm`;
- `length_m`;
- `thickness_mil`;
- `weight_kg`;
- `origin_country`.

These values describe the product definition. Actual lot/roll measurements, if later required, belong to those later records rather than overwriting Product reference data.

## Product content

- `marketing_description`: customer/public-facing description.
- `technical_description`: technical product description.
- `features`: ordered feature statements stored as a text array.
- `publication_status`: `draft` or `published`, separate from operational `status`.

A Product may remain operationally active while its public content is still a draft.

A Product cannot be published unless it has:

- marketing description;
- nominal width, length, thickness, and weight;
- origin country;
- warranty coverage;
- care instructions.

The marketing QR defined by PD-005 is derived from the public Product route/slug and is informational only; no QR token is stored on the Product row.

## Warranty policy source

- `default_warranty_months`: current default warranty duration.
- `warranty_coverage`: current customer-facing coverage information.
- `care_instructions`: current customer-facing care information.

When customer warranties are implemented, each created warranty must snapshot the applicable policy values. Historical warranties must not change when Product Foundation values are edited later.

## Product assets

Product images, datasheets, catalogues, and related PDF documents are implemented as a separate `public.product_assets` relation rather than URL/path columns on `public.products`.

Each asset stores:

- owning `product_id`;
- kind: `image`, `datasheet`, `catalogue`, or `document`;
- optional display label;
- private Storage path;
- original file name;
- MIME type and size;
- visibility: `internal` or `public`;
- sort order and creation time.

Allowed files are JPEG, PNG, WEBP, AVIF, and PDF with a 20 MiB maximum. Database constraints keep asset kind consistent with MIME type: images must be image MIME types; datasheets/catalogues/documents are PDF in the first release.

The configured Supabase Storage bucket is `product-assets` and is private. Upload/delete operations use the Storage API from server-only admin actions. Storage tables are not mutated directly.

Normal authenticated admin sessions manage Product asset metadata under RLS. Public pages do not receive anonymous access to `product_assets`; instead, a server-only client reads only metadata marked `public` and creates short-lived signed URLs for those objects. Internal/draft assets remain private even if their Storage path is known.

### Hosted Supabase deployment

The SQL migrations create Product metadata tables and policies, but the Storage bucket is configuration rather than a Product SQL table.

For local development, `supabase start` provisions the bucket from `supabase/config.toml`.

For a newly linked hosted project, apply the database migrations first and then seed the configured Storage buckets using:

```bash
supabase seed buckets --linked
```

Production Site URLs/redirects and environment keys must still be configured for the hosted environment before launch.

## Product types and categories

The first release remains PPF-first according to PD-002. `product_type`, `category`, and `version_name` provide the required classification data without introducing an unused family/variant hierarchy.

A separate taxonomy-management subsystem is not introduced unless a later operational requirement demonstrates that centrally managed category/type records are necessary.

## Security boundary

RLS remains enabled on `public.products`.

Every active authenticated operational profile (`admin`, `dealer`, or `center`) may read Product reference rows because downstream roll and warranty flows need the Product definition. Product create/edit/lifecycle policies remain restricted to an active parent-company admin.

The Product Foundation completion migration extends the existing column-scoped admin update grant only to the new Product fields. `status` remains controlled by the separate lifecycle grant/action.

Anonymous access is intentionally narrower than operational access. RLS returns Product rows only when both `status = 'active'` and `publication_status = 'published'`, and the anonymous role receives only the explicitly public columns. `reference_price`, `currency_code`, and `created_at` are not exposed anonymously.

There is no hard delete. The modern explicit Data API migration continues to deny `service_role` access to the `products` table because current Product CRUD uses the authenticated admin server session and RLS. `service_role` has SELECT-only access to `product_assets` metadata because the public server route needs to resolve explicitly public assets and generate signed URLs.

## Creation and editing contract

The operational form and service parser require these stable PPF values for normal Product creation/editing:

- canonical SKU / product code;
- product name;
- product type;
- explicit public slug;
- nominal width, length, thickness, and weight;
- origin country;
- default warranty duration;
- warranty coverage;
- care instructions.

Category, version, reference price/currency, descriptions, feature statements, and assets remain optional. Publishing additionally requires the complete public definition listed above.

## Public Product flow

`/products` lists only active, published Products. `/products/[slug]` shows the Product definition, nominal specifications, current warranty/care content, public images, and public PDF documents.

The public route does not expose internal reference price or draft/internal assets.

## Lifecycle

Products are not physically deleted through the operational interface:

- `active`: available for current operational use;
- `archived`: retained for historical references and no longer considered current.

Archived Products immediately disappear from the anonymous Product catalogue even if `publication_status` remains `published`.

Historical production records, rolls, and warranties will continue to reference archived Products when those modules are introduced.
