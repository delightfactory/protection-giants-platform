-- Cube K detail read keeps historical Center access independent from later custody movement.

create function public.get_roll_preinstall_issue_detail(p_issue_id uuid)
returns table (
  issue_id uuid,
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  center_name text,
  opened_at timestamptz,
  category text,
  description text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  resolved_by_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_role text;
  v_party_id uuid;
begin
  if p_issue_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_NOT_FOUND';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_role := v_actor ->> 'role';
  v_party_id := (v_actor ->> 'party_id')::uuid;

  if v_role not in ('admin', 'center') then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.id = p_issue_id
      and (v_role = 'admin' or issue.reporting_center_party_id = v_party_id)
  ) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_NOT_FOUND';
  end if;

  return query
  select
    issue.id,
    issue.roll_id,
    roll.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    coalesce(center_entity.name, 'مركز تركيب')::text,
    opening.opened_at,
    issue.category,
    issue.description,
    issue.status,
    issue.created_at,
    issue.resolved_at,
    issue.resolution_reason,
    resolver.display_name
  from public.roll_preinstall_issues issue
  join public.rolls roll on roll.id = issue.roll_id
  join public.production_lots lot on lot.id = roll.production_lot_id
  join public.production_orders po on po.id = roll.production_order_id
  join public.roll_openings opening on opening.roll_id = roll.id
  join public.operational_parties center_party on center_party.id = issue.reporting_center_party_id
  left join public.installation_centers center_entity on center_entity.id = center_party.installation_center_id
  left join public.profiles resolver on resolver.id = issue.resolved_by_profile_id
  where issue.id = p_issue_id;
end;
$$;

revoke all on function public.get_roll_preinstall_issue_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_roll_preinstall_issue_detail(uuid)
  to authenticated;

comment on function public.get_roll_preinstall_issue_detail(uuid) is
  'Cube K exact issue detail for active Admin or the reporting Center. Historical Center access does not depend on still holding the Roll.';
