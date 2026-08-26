-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 6
-- Authoritative replacement Roll reserve/release lifecycle plus only the minimal
-- reverse guards required to keep mature Transfer, Opening and Warranty domains
-- compatible with a Claim-reserved Roll. No completion, consumption, UI, finance,
-- automatic Transfer/Recovery or Claim-specific Opening subsystem is introduced.

create function private.prevent_transfer_reservation_for_claim_allocated_roll()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = new.roll_id
      and allocation.status in ('reserved', 'consumed')
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_ROLL_CLAIM_ALLOCATED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_transfer_reservation_for_claim_allocated_roll()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_reservations_claim_allocation_guard
  before insert on public.roll_transfer_reservations
  for each row execute function private.prevent_transfer_reservation_for_claim_allocated_roll();

create function private.guard_claim_allocated_roll_opening()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reserved_at timestamptz;
  v_resolution_status text;
  v_remedy_kind text;
  v_performing_center_party_id uuid;
  v_claim_status text;
  v_claim_closed_at timestamptz;
begin
  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = new.roll_id
      and allocation.status = 'consumed'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_CLAIM_CONTEXT_INVALID';
  end if;

  select
    allocation.reserved_at,
    resolution.status,
    resolution.remedy_kind,
    resolution.performing_center_party_id,
    claim.status,
    claim.closed_at
  into
    v_reserved_at,
    v_resolution_status,
    v_remedy_kind,
    v_performing_center_party_id,
    v_claim_status,
    v_claim_closed_at
  from public.warranty_claim_resolution_roll_allocations allocation
  join public.warranty_claim_resolutions resolution on resolution.id = allocation.resolution_id
  join public.warranty_claims claim on claim.id = resolution.claim_id
  where allocation.roll_id = new.roll_id
    and allocation.status = 'reserved';

  if not found then
    return new;
  end if;

  if v_claim_status <> 'approved'
    or v_claim_closed_at is not null
    or v_resolution_status <> 'assigned'
    or v_remedy_kind <> 'replacement_roll_reinstall'
    or v_performing_center_party_id is null
    or v_performing_center_party_id <> new.opened_by_center_party_id
    or new.opened_at < v_reserved_at
  then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_CLAIM_CONTEXT_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_claim_allocated_roll_opening()
  from public, anon, authenticated, service_role;

create trigger roll_openings_claim_allocation_guard
  before insert on public.roll_openings
  for each row execute function private.guard_claim_allocated_roll_opening();

create function private.prevent_warranty_for_claim_allocated_roll()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = new.roll_id
      and allocation.status in ('reserved', 'consumed')
  ) then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_ROLL_CLAIM_ALLOCATED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_warranty_for_claim_allocated_roll()
  from public, anon, authenticated, service_role;

create trigger warranties_claim_allocation_guard
  before insert on public.warranties
  for each row execute function private.prevent_warranty_for_claim_allocated_roll();

create function public.reserve_claim_resolution_roll(
  p_action_request_id uuid,
  p_resolution_id uuid,
  p_roll_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing_event public.warranty_claim_resolution_events%rowtype;
  v_existing_allocation_id uuid;
  v_claim public.warranty_claims%rowtype;
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_warranty public.warranties%rowtype;
  v_claim_id uuid;
  v_candidate_production_order_id uuid;
  v_production_status text;
  v_custodian_party_id uuid;
  v_eligible boolean;
  v_basis_code text;
  v_allocation_id uuid := gen_random_uuid();
  v_reserved_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_resolution_id is null or p_roll_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_ROLL_RESERVE_REQUEST_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_resolution_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.resolution_id is distinct from p_resolution_id
      or v_existing_event.event_kind <> 'replacement_roll_reserved'
      or v_existing_event.actor_profile_id is distinct from v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or (v_existing_event.event_data ->> 'roll_id') is distinct from p_roll_id::text
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    begin
      v_existing_allocation_id := nullif(v_existing_event.event_data ->> 'allocation_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_EVENT_INVALID';
    end;

    if v_existing_allocation_id is null
      or not exists (
        select 1
        from public.warranty_claim_resolution_roll_allocations allocation
        where allocation.id = v_existing_allocation_id
          and allocation.resolution_id = p_resolution_id
          and allocation.roll_id = p_roll_id
      )
    then
      raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_EVENT_INVALID';
    end if;

    return v_existing_allocation_id;
  end if;

  -- Resolution identity is immutable. Read the authoritative Warranty identity, then
  -- preserve the Claims lock order Warranty -> Claim -> Resolution before entering
  -- the physical Roll lock order Production Order -> current custody.
  select warranty.*, claim.id
    into v_warranty, v_claim_id
  from public.warranty_claim_resolutions resolution
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where resolution.id = p_resolution_id
  for update of warranty;

  if not found or v_warranty.record_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RESERVE_STATE_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_claim_id
  for update;

  if not found or v_claim.status <> 'approved' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RESERVE_STATE_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = p_resolution_id
  for update;

  if not found
    or v_resolution.claim_id <> v_claim.id
    or v_resolution.status <> 'assigned'
    or v_resolution.remedy_kind <> 'replacement_roll_reinstall'
    or v_resolution.performing_center_party_id is null
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RESERVE_STATE_INVALID';
  end if;

  perform private.lock_actionable_claim_center_party(v_resolution.performing_center_party_id);

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.resolution_id = v_resolution.id
      and allocation.status in ('reserved', 'consumed')
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_ALREADY_ALLOCATED';
  end if;

  select roll.production_order_id
    into v_candidate_production_order_id
  from public.rolls roll
  where roll.id = p_roll_id;

  if not found then
    raise exception using errcode = '22023', message = 'PG_CLAIM_REPLACEMENT_ROLL_NOT_FOUND';
  end if;

  select production_order.status
    into v_production_status
  from public.production_orders production_order
  where production_order.id = v_candidate_production_order_id
  for update;

  if not found or v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_PRODUCTION_INVALID';
  end if;

  select custody.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current custody
  where custody.roll_id = p_roll_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_CUSTODY_MISSING';
  end if;

  if v_custodian_party_id <> v_resolution.performing_center_party_id then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_NOT_PERFORMING_CENTER';
  end if;

  if exists (
    select 1 from public.roll_transfer_reservations reservation
    where reservation.roll_id = p_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_TRANSFER_RESERVED';
  end if;

  if exists (
    select 1 from public.roll_openings opening
    where opening.roll_id = p_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_ALREADY_OPENED';
  end if;

  if exists (
    select 1 from public.warranties warranty
    where warranty.roll_id = p_roll_id
      and warranty.record_state = 'issued'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_WARRANTY_EXISTS';
  end if;

  if exists (
    select 1 from public.roll_preinstall_issues issue
    where issue.roll_id = p_roll_id
      and issue.status = 'return_required'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RETURN_REQUIRED';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = p_roll_id
      and allocation.status = 'consumed'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_PREVIOUSLY_CONSUMED';
  end if;

  if exists (
    select 1
    from public.warranty_claim_resolution_roll_allocations allocation
    where allocation.roll_id = p_roll_id
      and allocation.status = 'reserved'
  ) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_ALREADY_ALLOCATED';
  end if;

  select policy.eligible, policy.basis_code
    into v_eligible, v_basis_code
  from private.resolve_claim_replacement_roll_eligibility(v_claim.warranty_id, p_roll_id) policy;

  v_basis_code := btrim(coalesce(v_basis_code, ''));
  if not coalesce(v_eligible, false) then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_PRODUCT_INELIGIBLE';
  end if;

  if char_length(v_basis_code) < 2 or char_length(v_basis_code) > 80 then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_POLICY_BASIS_INVALID';
  end if;

  insert into public.warranty_claim_resolution_roll_allocations (
    id,
    resolution_id,
    roll_id,
    product_eligibility_basis,
    status,
    reserved_by_profile_id,
    reserved_at,
    created_at
  ) values (
    v_allocation_id,
    v_resolution.id,
    p_roll_id,
    v_basis_code,
    'reserved',
    v_actor_profile_id,
    v_reserved_at,
    v_reserved_at
  );

  insert into public.warranty_claim_resolution_events (
    resolution_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_resolution.id,
    p_action_request_id,
    'replacement_roll_reserved',
    v_actor_profile_id,
    'admin',
    null,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'allocation_id', v_allocation_id,
      'roll_id', p_roll_id,
      'product_eligibility_basis', v_basis_code
    ),
    v_reserved_at
  );

  return v_allocation_id;
end;
$$;

revoke all on function public.reserve_claim_resolution_roll(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_claim_resolution_roll(uuid, uuid, uuid)
  to authenticated;

create function public.release_claim_resolution_roll(
  p_action_request_id uuid,
  p_allocation_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_existing_event public.warranty_claim_resolution_events%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_allocation public.warranty_claim_resolution_roll_allocations%rowtype;
  v_warranty_state text;
  v_claim_id uuid;
  v_resolution_id uuid;
  v_reason text;
  v_released_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null or p_allocation_id is null then
    raise exception using errcode = '22023', message = 'PG_CLAIM_ROLL_RELEASE_REQUEST_INVALID';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_CLAIM_ROLL_RELEASE_REASON_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select event.*
    into v_existing_event
  from public.warranty_claim_resolution_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.event_kind <> 'replacement_roll_released'
      or v_existing_event.actor_profile_id is distinct from v_actor_profile_id
      or v_existing_event.actor_kind <> 'admin'
      or v_existing_event.reason is distinct from v_reason
      or (v_existing_event.event_data ->> 'allocation_id') is distinct from p_allocation_id::text
    then
      raise exception using errcode = '23505', message = 'PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT';
    end if;

    return p_allocation_id;
  end if;

  select claim.id, resolution.id, warranty.record_state
    into v_claim_id, v_resolution_id, v_warranty_state
  from public.warranty_claim_resolution_roll_allocations allocation
  join public.warranty_claim_resolutions resolution on resolution.id = allocation.resolution_id
  join public.warranty_claims claim on claim.id = resolution.claim_id
  join public.warranties warranty on warranty.id = claim.warranty_id
  where allocation.id = p_allocation_id
  for update of warranty;

  if not found or v_warranty_state <> 'issued' then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RELEASE_STATE_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_claim_id
  for update;

  if not found or v_claim.status <> 'approved' or v_claim.closed_at is not null then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RELEASE_STATE_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = v_resolution_id
  for update;

  if not found
    or v_resolution.claim_id <> v_claim.id
    or v_resolution.status <> 'assigned'
    or v_resolution.remedy_kind <> 'replacement_roll_reinstall'
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RELEASE_STATE_INVALID';
  end if;

  select allocation.*
    into v_allocation
  from public.warranty_claim_resolution_roll_allocations allocation
  where allocation.id = p_allocation_id
  for update;

  if not found
    or v_allocation.resolution_id <> v_resolution.id
    or v_allocation.status <> 'reserved'
  then
    raise exception using errcode = '23514', message = 'PG_CLAIM_ROLL_RELEASE_STATE_INVALID';
  end if;

  update public.warranty_claim_resolution_roll_allocations allocation
  set
    status = 'released',
    released_by_profile_id = v_actor_profile_id,
    release_reason = v_reason,
    released_at = v_released_at
  where allocation.id = v_allocation.id;

  insert into public.warranty_claim_resolution_events (
    resolution_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    actor_kind,
    reason,
    event_data,
    created_at
  ) values (
    v_resolution.id,
    p_action_request_id,
    'replacement_roll_released',
    v_actor_profile_id,
    'admin',
    v_reason,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'allocation_id', v_allocation.id,
      'roll_id', v_allocation.roll_id,
      'product_eligibility_basis', v_allocation.product_eligibility_basis
    ),
    v_released_at
  );

  return v_allocation.id;
end;
$$;

revoke all on function public.release_claim_resolution_roll(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.release_claim_resolution_roll(uuid, uuid, text)
  to authenticated;

comment on function public.reserve_claim_resolution_roll(uuid, uuid, uuid) is
  'Cube R Admin-only atomic replacement Roll reservation. Revalidates approved/open Claim, assigned replacement Resolution, actionable performing Center, generated Production, current custody, Transfer/Opening/Warranty/quality/allocation exclusions and the centralized Product policy under authoritative locks; creates no Transfer or Opening.';
comment on function public.release_claim_resolution_roll(uuid, uuid, text) is
  'Cube R Admin-only release of one still-unused reserved replacement allocation. Preserves immutable Opening, custody, issue and Product-policy history and performs no automatic Transfer or Recovery.';
comment on function private.guard_claim_allocated_roll_opening() is
  'Minimal Cube R compatibility guard around the existing Cube J Opening row. A reserved Claim Roll opens only for its exact active assigned replacement Resolution and performing Center; no Claim-specific Opening record is created.';
comment on function private.prevent_transfer_reservation_for_claim_allocated_roll() is
  'Reverse guard preventing ordinary Transfer reservation while a Roll is actively reserved/consumed by Claim fulfillment.';
comment on function private.prevent_warranty_for_claim_allocated_roll() is
  'Reverse guard preventing a replacement Claim Roll from receiving a second customer Warranty while reserved/consumed; the original Warranty remains authoritative.';
