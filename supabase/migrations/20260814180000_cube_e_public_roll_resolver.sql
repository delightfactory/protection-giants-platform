-- Cube E closure fix: narrow public Roll -> Product slug resolver.
--
-- The Data API intentionally does not grant service_role/anon/authenticated direct
-- SELECT on rolls. Public QR resolution therefore goes through this exact-match,
-- SECURITY DEFINER function and exposes only an eligible public Product slug.

create function public.resolve_public_roll_product_slug(p_serial text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product_slug text;
begin
  if p_serial is null
     or p_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$'
  then
    return null;
  end if;

  select product.slug
  into v_product_slug
  from public.rolls as roll
  join public.production_orders as production_order
    on production_order.id = roll.production_order_id
  join public.products as product
    on product.id = roll.product_id
  where roll.serial_number = p_serial
    and production_order.status = 'generated'
    and product.status = 'active'
    and product.publication_status = 'published'
  limit 1;

  return v_product_slug;
end;
$$;

revoke all on function public.resolve_public_roll_product_slug(text)
  from public, anon, authenticated, service_role;

grant execute on function public.resolve_public_roll_product_slug(text)
  to anon, authenticated, service_role;

comment on function public.resolve_public_roll_product_slug(text) is
  'Exact-match public Roll QR resolver. Returns only the eligible public Product slug; never exposes Roll, ERP, custody, Transfer or internal identity data.';
