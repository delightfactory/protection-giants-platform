-- Cube D — remove cross-table RLS recursion from custody visibility.
-- Security-definer helpers return only booleans / the caller's own Party id;
-- they are not exposed as public Data API RPCs.

grant execute on function private.current_active_operational_party_id()
  to authenticated;

create function private.roll_is_generated(p_roll_id uuid)
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
      and po.status = 'generated'
  )
$$;

revoke all on function private.roll_is_generated(uuid)
  from public, anon, service_role;
grant execute on function private.roll_is_generated(uuid)
  to authenticated;

create function private.roll_is_held_by_current_party(p_roll_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.roll_custody_current rc
    join public.rolls r on r.id = rc.roll_id
    join public.production_orders po on po.id = r.production_order_id
    where rc.roll_id = p_roll_id
      and rc.custodian_party_id = private.current_active_operational_party_id()
      and po.status = 'generated'
  )
$$;

revoke all on function private.roll_is_held_by_current_party(uuid)
  from public, anon, service_role;
grant execute on function private.roll_is_held_by_current_party(uuid)
  to authenticated;

drop policy if exists "roll_custody_current_holder_read" on public.roll_custody_current;
create policy "roll_custody_current_holder_read"
on public.roll_custody_current
for select
to authenticated
using (
  custodian_party_id = (select private.current_active_operational_party_id())
  and (select private.roll_is_generated(roll_id))
);

drop policy if exists "rolls_current_holder_read" on public.rolls;
create policy "rolls_current_holder_read"
on public.rolls
for select
to authenticated
using ((select private.roll_is_held_by_current_party(id)));
