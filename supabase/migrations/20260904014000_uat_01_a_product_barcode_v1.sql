-- UAT-01-A / BAR-01: V1 Product Barcode semantics.
-- Keep products.gtin as the compatibility storage column. V1 does not claim
-- that a stored Product Barcode is an official GS1 GTIN.

alter table public.products
  drop constraint if exists products_gtin_valid;

alter table public.products
  add constraint products_barcode_v1_valid
  check (
    gtin is null
    or (
      gtin = btrim(gtin)
      and gtin ~ '^[0-9]{1,32}$'
    )
  );

create or replace function private.prevent_produced_product_gtin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.gtin is not null
     and new.gtin is distinct from old.gtin
     and exists (
       select 1
       from public.production_orders as production_order
       where production_order.product_id = old.id
         and production_order.status = 'generated'
     )
  then
    raise exception 'Produced Product barcode is locked after assignment. Create a new Product/SKU for a different barcode identity.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on column public.products.gtin is
  'V1 Product Barcode compatibility column. Optional numeric barcode (1-32 digits); not necessarily an official GS1 GTIN.';

comment on function private.prevent_produced_product_gtin_change() is
  'Allows one-time NULL-to-barcode assignment after production, then preserves the Product barcode identity while generated production exists.';
