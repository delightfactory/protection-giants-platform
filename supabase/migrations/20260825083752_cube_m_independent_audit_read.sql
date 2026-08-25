-- Cube M independent audit closure
-- Admin-only read projection for the immutable Warranty audit timeline.

create function public.get_internal_warranty_audit(p_warranty_id uuid)
returns table (
  event_id uuid,
  event_kind text,
  actor_profile_id uuid,
  reason text,
  change_snapshot jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
begin
  if p_warranty_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  v_context := private.resolve_internal_warranty_read_context();

  if v_context ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.warranties warranty
    where warranty.id = p_warranty_id
  ) then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  return query
  select
    event.id,
    event.event_kind,
    event.actor_profile_id,
    event.reason,
    event.change_snapshot,
    event.created_at
  from public.warranty_events event
  where event.warranty_id = p_warranty_id
  order by event.created_at asc, event.id asc;
end;
$$;

revoke all on function public.get_internal_warranty_audit(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_internal_warranty_audit(uuid)
  to authenticated;

comment on function public.get_internal_warranty_audit(uuid) is
  'Cube M Admin-only immutable Warranty audit timeline. Centers and other operational roles cannot read support audit events.';
