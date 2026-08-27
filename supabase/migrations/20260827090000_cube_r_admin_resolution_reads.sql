-- Cube R — Admin Resolution operational read foundation, increment 12A1.
-- Adds only bounded Admin queue/detail reads and the advisory replacement-Roll
-- candidate resolver required by the frozen R workflow. Underlying tables remain
-- closed; reservation remains the authoritative locked eligibility decision.

create function public.list_admin_warranty_claim_resolutions(
  p_limit integer default 50,
  p_offset integer default 0,
  p_scope text default 'open',
  p_status text default null
)
returns table (
  resolution_id uuid,
  claim_id uuid,
  claim_number text,
  claim_status text,
  resolution_status text,
  remedy_kind text,
  performing_center_party_id uuid,
  performing_center_name text,
  authorized_at timestamptz,
  assigned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  product_code text,
  product_name text,
  product_version text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_scope text := btrim(coalesce(p_scope, ''));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_LIST_PAGING_INVALID';
  end if;

  if v_scope not in ('open', 'closed', 'all') then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_LIST_SCOPE_INVALID';
  end if;

  if v_status is not null
    and v_status not in ('authorized', 'assigned', 'completed', 'cancelled')
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_LIST_STATUS_INVALID';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  return query
  select
    resolution.id,
    claim.id,
    claim.claim_number,
    claim.status,
    resolution.status,
    resolution.remedy_kind,
    resolution.performing_center_party_id,
    center.name,
    resolution.authorized_at,
    resolution.assigned_at,
    resolution.completed_at,
    resolution.cancelled_at,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  left join public.operational_parties party
    on party.id = resolution.performing_center_party_id
   and party.party_type = 'center'
  left join public.installation_centers center on center.id = party.installation_center_id
  where (v_status is null or resolution.status = v_status)
    and (
      v_scope = 'all'
      or (v_scope = 'open' and resolution.status in ('authorized', 'assigned'))
      or (v_scope = 'closed' and resolution.status in ('completed', 'cancelled'))
    )
  order by resolution.updated_at desc, resolution.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_admin_warranty_claim_resolutions(integer, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_warranty_claim_resolutions(integer, integer, text, text)
  to authenticated;

comment on function public.list_admin_warranty_claim_resolutions(integer, integer, text, text) is
  'Cube R bounded Admin Resolution queue. Exposes only authenticated active Admin reads through the existing Claim read authorization boundary; underlying R tables remain ungranted.';

create function public.get_admin_warranty_claim_resolution_detail(p_resolution_id uuid)
returns table (
  resolution_id uuid,
  resolution_status text,
  authorized_at timestamptz,
  remedy_kind text,
  performing_center_party_id uuid,
  performing_center_name text,
  performing_center_status text,
  active_operator_count bigint,
  assigned_at timestamptz,
  completion_actor_kind text,
  completion_note text,
  completed_at timestamptz,
  cancellation_reason text,
  customer_cancellation_message text,
  cancelled_at timestamptz,
  claim_id uuid,
  claim_number text,
  claim_status text,
  claim_closed_at timestamptz,
  category text,
  affected_area text,
  description text,
  warranty_id uuid,
  warranty_number text,
  product_code text,
  product_name text,
  product_version text,
  warranty_coverage text,
  care_instructions text,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text,
  allocation_id uuid,
  allocation_status text,
  product_eligibility_basis text,
  allocation_reserved_at timestamptz,
  allocation_released_at timestamptz,
  allocation_consumed_at timestamptz,
  replacement_roll_id uuid,
  replacement_roll_serial text,
  replacement_roll_product_code text,
  replacement_roll_product_name text,
  replacement_roll_product_version text,
  replacement_opened_at timestamptz,
  replacement_quality_state text,
  completion_evidence_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
begin
  if p_resolution_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_NOT_FOUND';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.warranty_claim_resolutions resolution
    where resolution.id = p_resolution_id
  ) then
    raise exception using errcode = '22023', message = 'PG_CLAIM_RESOLUTION_NOT_FOUND';
  end if;

  return query
  select
    resolution.id,
    resolution.status,
    resolution.authorized_at,
    resolution.remedy_kind,
    resolution.performing_center_party_id,
    center.name,
    center.status,
    case
      when center.id is null then 0::bigint
      else (
        select count(*)::bigint
        from public.profiles profile
        where profile.role = 'center'
          and profile.status = 'active'
          and profile.installation_center_id = center.id
      )
    end,
    resolution.assigned_at,
    resolution.completion_actor_kind,
    resolution.completion_note,
    resolution.completed_at,
    resolution.cancellation_reason,
    resolution.customer_cancellation_message,
    resolution.cancelled_at,
    claim.id,
    claim.claim_number,
    claim.status,
    claim.closed_at,
    claim.category,
    claim.affected_area,
    claim.description,
    warranty.id,
    warranty.warranty_number,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.warranty_coverage_snapshot,
    warranty.care_instructions_snapshot,
    warranty.customer_name,
    warranty.customer_phone,
    warranty.customer_email,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    warranty.vehicle_plate,
    warranty.vehicle_color,
    warranty.vehicle_vin,
    allocation.id,
    allocation.status,
    allocation.product_eligibility_basis,
    allocation.reserved_at,
    allocation.released_at,
    allocation.consumed_at,
    replacement_roll.id,
    replacement_roll.serial_number,
    replacement_product.code,
    replacement_product.name,
    replacement_product.version_name,
    opening.opened_at,
    case
      when allocation.id is null then null::text
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = allocation.roll_id
          and issue.status = 'submitted'
      ) then 'pending'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = allocation.roll_id
          and issue.status = 'return_required'
      ) then 'return_required'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = allocation.roll_id
      ) then 'clear_history'
      else 'none'
    end,
    (
      select count(*)::bigint
      from public.warranty_claim_resolution_evidence evidence
      where evidence.resolution_id = resolution.id
    )
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  left join public.operational_parties party
    on party.id = resolution.performing_center_party_id
   and party.party_type = 'center'
  left join public.installation_centers center on center.id = party.installation_center_id
  left join lateral (
    select candidate_allocation.*
    from public.warranty_claim_resolution_roll_allocations candidate_allocation
    where candidate_allocation.resolution_id = resolution.id
    order by
      case candidate_allocation.status
        when 'reserved' then 0
        when 'consumed' then 1
        else 2
      end,
      candidate_allocation.created_at desc,
      candidate_allocation.id desc
    limit 1
  ) allocation on true
  left join public.rolls replacement_roll on replacement_roll.id = allocation.roll_id
  left join public.products replacement_product on replacement_product.id = replacement_roll.product_id
  left join public.roll_openings opening on opening.roll_id = replacement_roll.id
  where resolution.id = p_resolution_id;
end;
$$;

revoke all on function public.get_admin_warranty_claim_resolution_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_warranty_claim_resolution_detail(uuid)
  to authenticated;

comment on function public.get_admin_warranty_claim_resolution_detail(uuid) is
  'Cube R Admin Resolution detail. Includes internal assignment/cancellation/completion and current-most-relevant allocation/physical facts for operational handling; no direct R table grant is opened.';

create function public.list_admin_claim_resolution_replacement_roll_candidates(
  p_resolution_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  roll_id uuid,
  serial_number text,
  erp_serial text,
  product_code text,
  product_name text,
  product_version text,
  product_eligibility_basis text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_warranty_id uuid;
  v_performing_center_party_id uuid;
  v_center_id uuid;
  v_resolution_status text;
  v_remedy_kind text;
  v_claim_status text;
  v_claim_closed_at timestamptz;
  v_warranty_state text;
begin
  if p_resolution_id is null
    or p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 10000
  then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REPLACEMENT_CANDIDATES_REQUEST_INVALID';
  end if;

  v_actor := private.lock_claim_read_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_ADMIN_REQUIRED';
  end if;

  select
    claim.warranty_id,
    resolution.performing_center_party_id,
    party.installation_center_id,
    resolution.status,
    resolution.remedy_kind,
    claim.status,
    claim.closed_at,
    warranty.record_state
  into
    v_warranty_id,
    v_performing_center_party_id,
    v_center_id,
    v_resolution_status,
    v_remedy_kind,
    v_claim_status,
    v_claim_closed_at,
    v_warranty_state
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  left join public.operational_parties party
    on party.id = resolution.performing_center_party_id
   and party.party_type = 'center'
  left join public.installation_centers center on center.id = party.installation_center_id
  where resolution.id = p_resolution_id
    and center.status = 'active';

  if not found
    or v_warranty_state <> 'issued'
    or v_claim_status <> 'approved'
    or v_claim_closed_at is not null
    or v_resolution_status <> 'assigned'
    or v_remedy_kind <> 'replacement_roll_reinstall'
    or v_performing_center_party_id is null
    or v_center_id is null
    or not exists (
      select 1
      from public.profiles profile
      where profile.role = 'center'
        and profile.status = 'active'
        and profile.installation_center_id = v_center_id
    )
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_REPLACEMENT_CANDIDATES_STATE_INVALID';
  end if;

  -- Once one material relationship is active, Admin works with that allocation
  -- rather than browsing for a hidden second candidate. Release first if unused.
  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.resolution_id = p_resolution_id
      and allocation.status in ('reserved', 'consumed')
  ) then
    return;
  end if;

  return query
  select
    roll.id,
    roll.serial_number,
    roll.erp_serial,
    product.code,
    product.name,
    product.version_name,
    btrim(policy.basis_code)
  from public.rolls roll
  join public.production_orders production_order on production_order.id = roll.production_order_id
  join public.roll_custody_current custody on custody.roll_id = roll.id
  join public.products product on product.id = roll.product_id
  cross join lateral private.resolve_claim_replacement_roll_eligibility(v_warranty_id, roll.id) policy
  where production_order.status = 'generated'
    and custody.custodian_party_id = v_performing_center_party_id
    and coalesce(policy.eligible, false)
    and char_length(btrim(coalesce(policy.basis_code, ''))) between 2 and 80
    and not exists (
      select 1 from public.roll_transfer_reservations reservation
      where reservation.roll_id = roll.id
    )
    and not exists (
      select 1 from public.roll_openings opening
      where opening.roll_id = roll.id
    )
    and not exists (
      select 1 from public.warranties candidate_warranty
      where candidate_warranty.roll_id = roll.id
        and candidate_warranty.record_state = 'issued'
    )
    and not exists (
      select 1 from public.roll_preinstall_issues issue
      where issue.roll_id = roll.id
        and issue.status = 'return_required'
    )
    and not exists (
      select 1
      from public.warranty_claim_resolution_roll_allocations allocation
      where allocation.roll_id = roll.id
        and allocation.status in ('reserved', 'consumed')
    )
  order by roll.serial_number, roll.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_admin_claim_resolution_replacement_roll_candidates(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_admin_claim_resolution_replacement_roll_candidates(uuid, integer, integer)
  to authenticated;

comment on function public.list_admin_claim_resolution_replacement_roll_candidates(uuid, integer, integer) is
  'Cube R advisory Admin replacement-Roll candidate list scoped to current performing-Center custody. It reuses the centralized replacement Product policy and current physical exclusions; reserve_claim_resolution_roll remains the authoritative locked revalidation and mutation.';
