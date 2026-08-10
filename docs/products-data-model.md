# Products Data Model

This document defines the stable Product Foundation used by future production orders, lots, rolls, labels, public product pages, and warranties.

## Product boundary

`public.products` represents a reusable product definition. It stores values that describe the product itself and remain meaningful across many production orders and physical rolls.

It must not store production-instance data such as lot numbers, batch dates, physical roll serials, ownership, transfers, installation events, activation codes, or customer warranty records.

## Canonical identity

- `id`: internal UUID.
- `code`: canonical SKU / operational product code for the first release.
- `slug`: unique stable lowercase ASCII URL identifier.
- `name`: product name.
- `product_type`: operational product type. The first release defaults to `PPF`.
- `category`: optional business category.
- `version_name`: optional model/version designation.
- `status`: operational lifecycle state: `active` or `archived`.
- `created_at`: creation timestamp.

A second SKU field is intentionally not introduced. Physical roll serials, ERP serials, lot numbers, and warranty/activation codes are separate identifiers owned by their later business objects.

## Reference commercial data

- `reference_price`: optional non-negative reference/display price.
- `currency_code`: required three-letter uppercase currency code when a reference price is present.

This is not a transaction ledger. Future orders, invoices, or sales must snapshot their own financial values if historical pricing is required.

## Nominal PPF specification data

The product can store the stable nominal values required by the client and future labels/production flows:

- `width_mm`;
- `length_m`;
- `thickness_mil`;
- `weight_kg`;
- `origin_country`.

These values describe the product definition. Actual lot/roll measurements, if later required, belong to those later records rather than overwriting product reference data.

## Product content

- `marketing_description`: customer/public-facing description.
- `technical_description`: technical product description.
- `features`: ordered feature statements stored as a text array.
- `publication_status`: `draft` or `published`, separate from operational `status`.

A product may remain operationally active while its public content is still a draft. Publishing requires a non-empty marketing description.

The marketing QR defined by PD-005 is derived from the public product route/slug and is informational only; no QR token is stored on the Product row.

## Warranty policy source

- `default_warranty_months`: current default warranty duration.
- `warranty_coverage`: current customer-facing coverage information.
- `care_instructions`: current customer-facing care information.

When customer warranties are implemented, each created warranty must snapshot the applicable policy values. Historical warranties must not change when Product Foundation values are edited later.

## Product assets

Images, datasheets, catalogues, and related documents are part of the Product module but are not embedded as URL/path columns on `public.products`.

They will be represented by a small product-assets relation backed by Supabase Storage in the next Product Foundation sub-step. This preserves multiple assets per product without turning the product row into a file-management structure.

## Product types and categories

The first release remains PPF-first according to PD-002. `product_type`, `category`, and `version_name` provide the required classification data without introducing an unused family/variant hierarchy.

A separate taxonomy-management subsystem is not introduced unless a later operational requirement demonstrates that centrally managed category/type records are necessary.

## Security boundary

RLS remains enabled on `public.products`.

Authenticated users have table-level read/insert/update capabilities only where explicitly granted, while the existing product RLS policies require an active parent-company admin for every operational Product action.

The Product Foundation completion migration extends the existing column-scoped update grant only to the new Product fields. `status` remains controlled by the separate lifecycle grant/action.

`id` and `created_at` remain outside the editable Product contract. There is no hard delete and no anonymous Product table access at this stage.

The modern explicit Data API migration continues to deny `service_role` table access to Products because current Product CRUD uses the authenticated admin server session and RLS rather than the Auth Admin client.

## Creation and editing contract

The operational form and service parser will treat these as the required stable PPF values before Product Foundation is considered complete for normal use:

- canonical SKU / product code;
- product name;
- product type;
- explicit public slug;
- nominal width, length, thickness, and weight;
- origin country;
- default warranty duration;
- warranty coverage;
- care instructions.

Category, version, reference price/currency, descriptions, and feature statements remain optional unless the product is published. A published product requires a marketing description.

## Lifecycle

Products are not physically deleted through the operational interface:

- `active`: available for current operational use;
- `archived`: retained for historical references and no longer considered current.

Historical production records, rolls, and warranties will continue to reference archived products when those modules are introduced.
