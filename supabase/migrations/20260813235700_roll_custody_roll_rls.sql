-- Cube D — final ordinary-role Roll visibility reads custody directly from the Roll.
-- The existing rolls_current_holder_read policy already calls this helper.

create or replace function private.roll_is_held_by_current_party(p_roll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rolls r
    join public.production_orders po on po.id = r.production_order_id
    where r.id = p_roll_id
      and r.custodian_party_id = private.current_active_operational_party_id()
      and po.status = 'generated'
  )
$$;

revoke all on function private.roll_is_held_by_current_party(uuid)
  from public, anon, service_role;
grant execute on function private.roll_is_held_by_current_party(uuid)
  to authenticated;
