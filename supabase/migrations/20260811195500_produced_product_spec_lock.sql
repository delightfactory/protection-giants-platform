-- One SKU represents one physical Product specification.
-- Once a Product has operational production, changing the fields that define
-- that physical identity would make later Rolls under the same SKU ambiguous.

create function private.prevent_produced_product_spec_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.production_orders as production_order
    where production_order.product_id = old.id
      and production_order.status = 'generated'
  )
  and (
    new.code is distinct from old.code
    or new.product_type is distinct from old.product_type
    or new.version_name is distinct from old.version_name
    or new.width_mm is distinct from old.width_mm
    or new.length_m is distinct from old.length_m
    or new.thickness_mil is distinct from old.thickness_mil
    or new.weight_kg is distinct from old.weight_kg
    or new.origin_country is distinct from old.origin_country
  ) then
    raise exception 'Production identity/specification is locked after the Product enters operational production. Create a new SKU for a different physical specification.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_produced_product_spec_change()
  from public, anon, authenticated, service_role;

create trigger products_lock_produced_specification
before update of code, product_type, version_name, width_mm, length_m, thickness_mil, weight_kg, origin_country
on public.products
for each row
execute function private.prevent_produced_product_spec_change();

comment on function private.prevent_produced_product_spec_change() is
  'Preserves the one-SKU/one-physical-spec contract after operational production while leaving non-physical Product content editable.';
