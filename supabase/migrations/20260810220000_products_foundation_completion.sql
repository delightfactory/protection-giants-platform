-- Complete the stable product data needed by production, labeling, public content, and warranty policy.
-- Lot, batch, physical roll, serial, and warranty-instance data remain separate business objects.

alter table public.products
  add column product_type text not null default 'PPF',
  add column category text,
  add column version_name text,
  add column reference_price numeric(12, 2),
  add column currency_code text,
  add column width_mm numeric(10, 2),
  add column length_m numeric(10, 2),
  add column thickness_mil numeric(8, 3),
  add column weight_kg numeric(10, 3),
  add column origin_country text,
  add column marketing_description text,
  add column technical_description text,
  add column features text[] not null default '{}'::text[],
  add column warranty_coverage text,
  add column care_instructions text,
  add column publication_status text not null default 'draft';

alter table public.products
  add constraint products_code_canonical_format
    check (
      code = upper(btrim(code))
      and code ~ '^[A-Z0-9][A-Z0-9._-]*$'
    ),
  add constraint products_product_type_length
    check (char_length(btrim(product_type)) between 2 and 60),
  add constraint products_category_length
    check (category is null or char_length(btrim(category)) between 2 and 80),
  add constraint products_version_name_length
    check (version_name is null or char_length(btrim(version_name)) between 1 and 80),
  add constraint products_reference_price
    check (reference_price is null or reference_price >= 0),
  add constraint products_currency_pair
    check (
      (reference_price is null and currency_code is null)
      or (
        reference_price is not null
        and currency_code is not null
        and currency_code = upper(btrim(currency_code))
        and currency_code ~ '^[A-Z]{3}$'
      )
    ),
  add constraint products_width_mm
    check (width_mm is null or width_mm > 0),
  add constraint products_length_m
    check (length_m is null or length_m > 0),
  add constraint products_thickness_mil
    check (thickness_mil is null or thickness_mil > 0),
  add constraint products_weight_kg
    check (weight_kg is null or weight_kg > 0),
  add constraint products_origin_country_length
    check (origin_country is null or char_length(btrim(origin_country)) between 2 and 80),
  add constraint products_marketing_description_length
    check (marketing_description is null or char_length(marketing_description) <= 5000),
  add constraint products_technical_description_length
    check (technical_description is null or char_length(technical_description) <= 10000),
  add constraint products_warranty_coverage_length
    check (warranty_coverage is null or char_length(warranty_coverage) <= 12000),
  add constraint products_care_instructions_length
    check (care_instructions is null or char_length(care_instructions) <= 12000),
  add constraint products_publication_status_allowed
    check (publication_status in ('draft', 'published')),
  add constraint products_published_content_present
    check (
      publication_status <> 'published'
      or (
        marketing_description is not null
        and char_length(btrim(marketing_description)) >= 2
      )
    );

-- Product code is the canonical SKU/operational code in the first release.
-- Existing table-level INSERT and SELECT grants remain unchanged; extend only the admin-editable columns.
grant update (
  product_type,
  category,
  version_name,
  reference_price,
  currency_code,
  width_mm,
  length_m,
  thickness_mil,
  weight_kg,
  origin_country,
  marketing_description,
  technical_description,
  features,
  warranty_coverage,
  care_instructions,
  publication_status
)
on table public.products
to authenticated;

-- Product reference data is required by future dealer/center operational flows.
-- Replace the admin-only read policy with one active-account policy; admin write policies remain unchanged.
drop policy "products_admin_read" on public.products;

create policy "products_operational_read"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.status = 'active'
  )
);

-- Public pages can read only explicitly public columns and only active, published products.
-- Reference price/currency remain internal until a later business decision explicitly publishes them.
grant select (
  id,
  code,
  slug,
  name,
  product_type,
  category,
  version_name,
  width_mm,
  length_m,
  thickness_mil,
  weight_kg,
  origin_country,
  marketing_description,
  technical_description,
  features,
  default_warranty_months,
  warranty_coverage,
  care_instructions,
  publication_status,
  status
)
on table public.products
to anon;

create policy "products_public_read"
on public.products
for select
to anon
using (
  status = 'active'
  and publication_status = 'published'
);
