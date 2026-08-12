-- Close the Product-update / Production-create race at the database boundary.
-- The insert locks the Product row for the transaction and verifies that the
-- snapshot being persisted still matches the active PPF definition.

create function private.enforce_production_snapshot_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  select product.*
    into v_product
  from public.products as product
  where product.id = new.product_id
  for share;

  if not found
     or v_product.status <> 'active'
     or v_product.product_type <> 'PPF' then
    raise exception 'Production requires the current active PPF Product definition.' using errcode = '23514';
  end if;

  if new.product_code_snapshot is distinct from v_product.code
     or new.product_name_snapshot is distinct from v_product.name
     or new.product_version_snapshot is distinct from v_product.version_name
     or new.width_mm_snapshot is distinct from v_product.width_mm
     or new.length_m_snapshot is distinct from v_product.length_m
     or new.thickness_mil_snapshot is distinct from v_product.thickness_mil
     or new.weight_kg_snapshot is distinct from v_product.weight_kg
     or new.origin_country_snapshot is distinct from v_product.origin_country then
    raise exception 'Product changed while production was being generated. Retry the production request.' using errcode = '40001';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_production_snapshot_consistency()
  from public, anon, authenticated, service_role;

create trigger production_orders_snapshot_consistency
before insert on public.production_orders
for each row
execute function private.enforce_production_snapshot_consistency();

comment on function private.enforce_production_snapshot_consistency() is
  'Locks the Product row during Production Order insertion and prevents a concurrent Product edit/archive from creating mixed historical/operational specifications.';
