-- Cube O / O1 — bounded Admin-only Warranty print identity read.
-- The private Roll public identity table remains closed to direct Data API browsing.
-- This function returns only the Roll id + permanent Public Code mapping required
-- by the server-side Roll Print Pack path for one exact Production Order.

create function private.lock_roll_print_admin_context()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_role text;
  v_status text;
begin
  if v_profile_id is null then
    raise exception using
      errcode = '42501',
      message = 'PG_ROLL_PRINT_ADMIN_REQUIRED';
  end if;

  select profile.role, profile.status
    into v_role, v_status
  from public.profiles profile
  where profile.id = v_profile_id;

  if not found or v_status <> 'active' or v_role <> 'admin' then
    raise exception using
      errcode = '42501',
      message = 'PG_ROLL_PRINT_ADMIN_REQUIRED';
  end if;

  return v_profile_id;
end;
$$;

revoke all on function private.lock_roll_print_admin_context()
  from public, anon, authenticated, service_role;

comment on function private.lock_roll_print_admin_context() is
  'Cube O print-read authorization context. Only an active Admin profile may resolve private Roll Warranty print identities.';

create function public.list_roll_warranty_print_identities(
  p_production_order_id uuid
)
returns table (
  roll_id uuid,
  public_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_identity_count integer;
begin
  if p_production_order_id is null then
    raise exception using
      errcode = '22023',
      message = 'PG_ROLL_PRINT_ORDER_REQUIRED';
  end if;

  perform private.lock_roll_print_admin_context();

  select count(*)::integer
    into v_expected_count
  from public.rolls roll
  where roll.production_order_id = p_production_order_id;

  if v_expected_count = 0 then
    if not exists (
      select 1
      from public.production_orders production_order
      where production_order.id = p_production_order_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'PG_ROLL_PRINT_ORDER_NOT_FOUND';
    end if;
  end if;

  select count(*)::integer
    into v_identity_count
  from public.rolls roll
  join private.roll_public_identities identity
    on identity.roll_id = roll.id
  where roll.production_order_id = p_production_order_id;

  if v_identity_count <> v_expected_count then
    raise exception using
      errcode = '23514',
      message = 'PG_ROLL_PRINT_IDENTITY_INCOMPLETE';
  end if;

  return query
  select
    roll.id,
    identity.public_code
  from public.rolls roll
  join private.roll_public_identities identity
    on identity.roll_id = roll.id
  where roll.production_order_id = p_production_order_id
  order by roll.id;
end;
$$;

revoke all on function public.list_roll_warranty_print_identities(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.list_roll_warranty_print_identities(uuid)
  to authenticated;

comment on function public.list_roll_warranty_print_identities(uuid) is
  'Admin-only bounded Cube O source for server-side Warranty QR printing. Returns only Roll UUID + permanent Public Code for one exact Production Order.';