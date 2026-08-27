-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 8
-- Establish the authoritative replacement-material consumption-readiness boundary
-- and make a consumed Claim Roll terminal in Cube N's public Warranty resolver.
-- This increment intentionally does NOT expose a consume RPC and does NOT complete
-- a Resolution; the future completion engine will own reserved -> consumed atomically.

create function private.require_claim_replacement_roll_consumption_ready(
  p_resolution_id uuid,
  p_roll_id uuid
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claim_status text;
  v_claim_closed_at timestamptz;
  v_warranty_state text;
  v_resolution_status text;
  v_remedy_kind text;
  v_performing_center_party_id uuid;
  v_allocation public.warranty_claim_resolution_roll_allocations%rowtype;
  v_production_status text;
  v_custodian_party_id uuid;
  v_opening_count integer;
  v_opened_by_center_party_id uuid;
  v_opened_at timestamptz;
begin
  if p_resolution_id is null or p_roll_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_CONSUMPTION_REQUEST_INVALID';
  end if;

  select
    claim.status,
    claim.closed_at,
    warranty.record_state,
    resolution.status,
    resolution.remedy_kind,
    resolution.performing_center_party_id
  into
    v_claim_status,
    v_claim_closed_at,
    v_warranty_state,
    v_resolution_status,
    v_remedy_kind,
    v_performing_center_party_id
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id;

  if not found
    or v_warranty_state <> 'issued'
    or v_claim_status <> 'approved'
    or v_claim_closed_at is not null
    or v_resolution_status <> 'assigned'
    or v_remedy_kind <> 'replacement_roll_reinstall'
    or v_performing_center_party_id is null
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_RESOLUTION_INVALID';
  end if;

  select allocation.*
    into v_allocation
  from public.warranty_claim_resolution_roll_allocations allocation
  where allocation.resolution_id = p_resolution_id
    and allocation.roll_id = p_roll_id
    and allocation.status = 'reserved';

  if not found then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_ALLOCATION_INVALID';
  end if;

  if char_length(btrim(coalesce(v_allocation.product_eligibility_basis, ''))) < 2
    or char_length(btrim(coalesce(v_allocation.product_eligibility_basis, ''))) > 80
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_BASIS_INVALID';
  end if;

  select production_order.status
    into v_production_status
  from public.rolls roll
  join public.production_orders production_order on production_order.id = roll.production_order_id
  where roll.id = p_roll_id;

  if not found or v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_PRODUCTION_INVALID';
  end if;

  select custody.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current custody
  where custody.roll_id = p_roll_id;

  if not found or v_custodian_party_id <> v_performing_center_party_id then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_CUSTODY_INVALID';
  end if;

  if exists (
    select 1
    from public.roll_transfer_reservations reservation
    where reservation.roll_id = p_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_TRANSFER_CONFLICT';
  end if;

  if exists (
    select 1
    from public.warranties warranty
    where warranty.roll_id = p_roll_id
      and warranty.record_state = 'issued'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_WARRANTY_CONFLICT';
  end if;

  select
    count(*)::integer,
    max(opening.opened_by_center_party_id),
    max(opening.opened_at)
  into
    v_opening_count,
    v_opened_by_center_party_id,
    v_opened_at
  from public.roll_openings opening
  where opening.roll_id = p_roll_id;

  if v_opening_count <> 1
    or v_opened_by_center_party_id is distinct from v_performing_center_party_id
    or v_opened_at is null
    or v_opened_at < v_allocation.reserved_at
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_OPENING_INVALID';
  end if;

  if exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.roll_id = p_roll_id
      and issue.status = 'submitted'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_QUALITY_PENDING';
  end if;

  if exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.roll_id = p_roll_id
      and issue.status = 'return_required'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_CONSUMPTION_RETURN_REQUIRED';
  end if;

  return v_allocation.id;
end;
$$;

revoke all on function private.require_claim_replacement_roll_consumption_ready(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function private.require_claim_replacement_roll_consumption_ready(uuid, uuid) is
  'Cube R private material-readiness assertion for a future atomic completion transaction. Validates the recorded allocation basis and current physical/quality facts without re-running Product policy or mutating allocation state.';

-- Cube N compatibility: once replacement material has been consumed for Claim
-- fulfillment, its own permanent Public Code must never imply future activation.
create or replace function public.resolve_public_warranty(p_public_code text)
returns table (
  public_state text,
  product_name text,
  warranty_number text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  activating_center_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roll_id uuid;
  v_production_status text;
  v_production_product_name text;
  v_issued_count integer;
  v_voided_count integer;
  v_warranty public.warranties%rowtype;
begin
  if p_public_code is null
     or p_public_code !~ '^[0-9a-f]{64}$'
  then
    return;
  end if;

  select identity.roll_id
    into v_roll_id
  from private.roll_public_identities identity
  where identity.public_code = p_public_code;

  if not found then
    return;
  end if;

  select
    po.status,
    po.product_name_snapshot
  into
    v_production_status,
    v_production_product_name
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  where r.id = v_roll_id;

  if not found or v_production_product_name is null then
    return query
    select
      'temporarily_unavailable'::text,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  select
    count(*) filter (where warranty.record_state = 'issued')::integer,
    count(*) filter (where warranty.record_state = 'voided_in_error')::integer
  into
    v_issued_count,
    v_voided_count
  from public.warranties warranty
  where warranty.roll_id = v_roll_id;

  if v_issued_count > 1 then
    return query
    select
      'temporarily_unavailable'::text,
      null::text,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  if v_issued_count = 1 then
    select warranty.*
      into v_warranty
    from public.warranties warranty
    where warranty.roll_id = v_roll_id
      and warranty.record_state = 'issued';

    if not found then
      return query
      select
        'temporarily_unavailable'::text,
        null::text,
        null::text,
        null::timestamptz,
        null::timestamptz,
        null::text,
        null::text,
        null::text,
        null::smallint;
      return;
    end if;

    return query
    select
      case
        when now() < v_warranty.coverage_expires_at then 'active'
        else 'expired'
      end::text,
      v_warranty.product_name_snapshot,
      v_warranty.warranty_number,
      v_warranty.activated_at,
      v_warranty.coverage_expires_at,
      v_warranty.activating_center_name_snapshot,
      v_warranty.vehicle_make,
      v_warranty.vehicle_model,
      v_warranty.vehicle_year;
    return;
  end if;

  -- Public terminal-unavailable conditions take precedence over void history.
  -- Merely reserved/opened Claim material remains an internal hold and therefore
  -- still resolves as not_activated when no other terminal condition exists.
  if v_production_status <> 'generated'
     or exists (
       select 1
       from public.roll_preinstall_issues issue
       where issue.roll_id = v_roll_id
         and issue.status = 'return_required'
     )
     or exists (
       select 1
       from public.warranty_claim_resolution_roll_allocations allocation
       where allocation.roll_id = v_roll_id
         and allocation.status = 'consumed'
     )
  then
    return query
    select
      'unavailable_for_warranty'::text,
      v_production_product_name,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  if v_voided_count > 0 then
    return query
    select
      'no_current_warranty_after_void'::text,
      v_production_product_name,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::text,
      null::text,
      null::text,
      null::smallint;
    return;
  end if;

  return query
  select
    'not_activated'::text,
    v_production_product_name,
    null::text,
    null::timestamptz,
    null::timestamptz,
    null::text,
    null::text,
    null::text,
    null::smallint;
end;
$$;

revoke all on function public.resolve_public_warranty(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_public_warranty(text)
  to anon, authenticated;

comment on function public.resolve_public_warranty(text) is
  'Cube N exact bearer-code public resolver extended by Cube R: a consumed Claim replacement Roll with no effective Warranty resolves unavailable_for_warranty; reserved/opened Claim material remains private operational state.';