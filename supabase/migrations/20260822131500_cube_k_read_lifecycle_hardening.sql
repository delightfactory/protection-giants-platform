-- Cube K final security hardening.
-- SECURITY DEFINER read models must enforce the same active-Center lifecycle
-- boundary as direct RLS reads and the application shell.

create or replace function public.list_roll_preinstall_issues(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  issue_id uuid,
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  center_name text,
  category text,
  description text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  evidence_count integer
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
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_LIST_PAGING_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_role := v_actor ->> 'role';
  v_party_id := (v_actor ->> 'party_id')::uuid;

  if v_role not in ('admin', 'center') then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_FORBIDDEN';
  end if;

  if v_role = 'center' and not private.lock_transfer_party_lifecycle(v_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_INACTIVE';
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
    issue.category,
    issue.description,
    issue.status,
    issue.created_at,
    issue.resolved_at,
    issue.resolution_reason,
    count(evidence.id)::integer
  from public.roll_preinstall_issues issue
  join public.rolls roll on roll.id = issue.roll_id
  join public.production_lots lot on lot.id = roll.production_lot_id
  join public.production_orders po on po.id = roll.production_order_id
  join public.operational_parties center_party on center_party.id = issue.reporting_center_party_id
  left join public.installation_centers center_entity on center_entity.id = center_party.installation_center_id
  left join public.roll_preinstall_issue_evidence evidence on evidence.issue_id = issue.id
  where v_role = 'admin' or issue.reporting_center_party_id = v_party_id
  group by issue.id, roll.id, lot.id, po.id, center_entity.id
  order by (issue.status = 'submitted') desc, issue.created_at desc, issue.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_roll_preinstall_issues(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_roll_preinstall_issues(integer, integer)
  to authenticated;

create or replace function public.get_roll_preinstall_issue_detail(p_issue_id uuid)
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

  if v_role = 'center' and not private.lock_transfer_party_lifecycle(v_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_INACTIVE';
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

comment on function public.list_roll_preinstall_issues(integer, integer) is
  'Cube K Admin/active-reporting-Center issue queue/history. SECURITY DEFINER read enforces Center entity lifecycle before returning data.';
comment on function public.get_roll_preinstall_issue_detail(uuid) is
  'Cube K exact issue detail for active Admin or the active reporting Center. Historical access remains independent from later Roll custody movement.';