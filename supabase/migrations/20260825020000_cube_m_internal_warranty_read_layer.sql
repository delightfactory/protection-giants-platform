-- Cube M — Warranty Activation, increment 3
-- Bounded internal Warranty registry/detail reads for active Admin and the
-- activating Center only. Customer Warranty PII remains unavailable to
-- Agent/Dealer/Public and the underlying tables remain outside direct Data API
-- read access.

create function private.lock_warranty_read_context()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_role text;
  v_profile_status text;
  v_center_id uuid;
  v_center_status text;
  v_center_party_id uuid;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_FORBIDDEN';
  end if;

  select
    profile.role,
    profile.status,
    profile.installation_center_id
  into
    v_role,
    v_profile_status,
    v_center_id
  from public.profiles profile
  where profile.id = v_profile_id
  for share;

  if not found or v_profile_status <> 'active' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_FORBIDDEN';
  end if;

  if v_role = 'admin' then
    return jsonb_build_object(
      'profile_id', v_profile_id,
      'role', v_role,
      'party_id', null
    );
  end if;

  if v_role <> 'center' or v_center_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_FORBIDDEN';
  end if;

  select
    center_entity.status,
    center_party.id
  into
    v_center_status,
    v_center_party_id
  from public.installation_centers center_entity
  join public.operational_parties center_party
    on center_party.party_type = 'center'
   and center_party.installation_center_id = center_entity.id
  where center_entity.id = v_center_id
  for share of center_entity, center_party;

  if not found or v_center_party_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_FORBIDDEN';
  end if;

  if v_center_status <> 'active' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CENTER_INACTIVE';
  end if;

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'role', v_role,
    'party_id', v_center_party_id
  );
end;
$$;

revoke all on function private.lock_warranty_read_context()
  from public, anon, authenticated, service_role;

comment on function private.lock_warranty_read_context() is
  'Cube M bounded read authorization context. Only active Admin or active Center profiles may cross the internal Warranty PII boundary.';

create function public.list_internal_warranties(
  p_limit integer default 50,
  p_offset integer default 0,
  p_search text default null,
  p_record_state text default null
)
returns table (
  warranty_id uuid,
  warranty_number text,
  record_state text,
  derived_state text,
  customer_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_vin text,
  product_code text,
  product_name text,
  roll_serial text,
  activating_center_name text,
  activated_at timestamptz,
  coverage_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_role text;
  v_party_id uuid;
  v_search text;
  v_search_upper text;
  v_search_vin text;
  v_record_state text;
begin
  if p_limit is null
    or p_limit < 1
    or p_limit > 100
    or p_offset is null
    or p_offset < 0
    or p_offset > 10000
  then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_LIST_PAGING_INVALID';
  end if;

  v_record_state := nullif(btrim(coalesce(p_record_state, '')), '');
  if v_record_state is not null
    and v_record_state not in ('issued', 'voided_in_error')
  then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_FILTER_INVALID';
  end if;

  v_search := nullif(btrim(coalesce(p_search, '')), '');
  if v_search is not null
    and (char_length(v_search) < 3 or char_length(v_search) > 80)
  then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_SEARCH_INVALID';
  end if;

  v_search_upper := upper(v_search);
  v_search_vin := case
    when v_search is null then null
    else upper(regexp_replace(v_search, '[[:space:]]+', '', 'g'))
  end;

  v_actor := private.lock_warranty_read_context();
  v_role := v_actor ->> 'role';
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  return query
  select
    warranty.id,
    warranty.warranty_number,
    warranty.record_state,
    case
      when warranty.record_state = 'voided_in_error' then 'voided'
      when pg_catalog.now() < warranty.coverage_expires_at then 'active'
      else 'expired'
    end::text,
    warranty.customer_name,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_vin,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    roll.serial_number,
    warranty.activating_center_name_snapshot,
    warranty.activated_at,
    warranty.coverage_expires_at
  from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  where
    (v_role = 'admin' or warranty.activating_center_party_id = v_party_id)
    and (v_record_state is null or warranty.record_state = v_record_state)
    and (
      v_search is null
      or warranty.warranty_number = v_search_upper
      or roll.serial_number = v_search_upper
      or warranty.vehicle_vin = v_search_vin
      or warranty.customer_phone = v_search
    )
  order by warranty.activated_at desc, warranty.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_internal_warranties(integer, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_internal_warranties(integer, integer, text, text)
  to authenticated;

comment on function public.list_internal_warranties(integer, integer, text, text) is
  'Cube M mobile-friendly internal Warranty registry. Active Centers see only Warranties activated by their own Center party; active Admin sees all. Search is bounded exact lookup by Warranty Number, Roll serial, VIN/chassis, or customer phone.';

create function public.get_internal_warranty_detail(p_warranty_id uuid)
returns table (
  warranty_id uuid,
  warranty_number text,
  record_state text,
  derived_state text,
  roll_id uuid,
  roll_serial text,
  product_id uuid,
  product_code text,
  product_name text,
  product_version text,
  warranty_months smallint,
  warranty_coverage text,
  care_instructions text,
  activating_center_party_id uuid,
  activating_center_name text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text,
  voided_at timestamptz,
  admin_void_reason text
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
  if p_warranty_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  v_actor := private.lock_warranty_read_context();
  v_role := v_actor ->> 'role';
  v_party_id := nullif(v_actor ->> 'party_id', '')::uuid;

  if not exists (
    select 1
    from public.warranties warranty
    where warranty.id = p_warranty_id
      and (v_role = 'admin' or warranty.activating_center_party_id = v_party_id)
  ) then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  return query
  select
    warranty.id,
    warranty.warranty_number,
    warranty.record_state,
    case
      when warranty.record_state = 'voided_in_error' then 'voided'
      when pg_catalog.now() < warranty.coverage_expires_at then 'active'
      else 'expired'
    end::text,
    warranty.roll_id,
    roll.serial_number,
    warranty.product_id,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.warranty_months_snapshot,
    warranty.warranty_coverage_snapshot,
    warranty.care_instructions_snapshot,
    warranty.activating_center_party_id,
    warranty.activating_center_name_snapshot,
    warranty.activated_at,
    warranty.coverage_expires_at,
    warranty.customer_name,
    warranty.customer_phone,
    warranty.customer_email,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    warranty.vehicle_plate,
    warranty.vehicle_color,
    warranty.vehicle_vin,
    warranty.voided_at,
    case when v_role = 'admin' then warranty.void_reason else null end
  from public.warranties warranty
  join public.rolls roll on roll.id = warranty.roll_id
  where warranty.id = p_warranty_id;
end;
$$;

revoke all on function public.get_internal_warranty_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_internal_warranty_detail(uuid)
  to authenticated;

comment on function public.get_internal_warranty_detail(uuid) is
  'Cube M internal Warranty detail. Active Center access is constrained to its own activation history; Admin can inspect all and receives the internal void reason. Unauthorized callers receive no existence signal.';

-- Keep the customer Warranty tables closed to direct Data API reads. Internal
-- consumers must cross the role-aware RPC boundary above; writes remain owned
-- by authoritative lifecycle/support RPCs.
revoke all on table public.warranties
  from public, anon, authenticated, service_role;
revoke all on table public.warranty_events
  from public, anon, authenticated, service_role;
