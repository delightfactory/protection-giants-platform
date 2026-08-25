-- Cube M — Warranty Activation, increment 5
-- Narrow Admin-only support corrections and void-in-error lifecycle transition.
-- No public/customer surface and no generic support workflow engine.

create function private.lock_warranty_admin_context()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_role text;
  v_status text;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_ADMIN_REQUIRED';
  end if;

  select profile.role, profile.status
    into v_role, v_status
  from public.profiles profile
  where profile.id = v_profile_id
  for share;

  if not found or v_status <> 'active' or v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_ADMIN_REQUIRED';
  end if;

  return v_profile_id;
end;
$$;

revoke all on function private.lock_warranty_admin_context()
  from public, anon, authenticated, service_role;

comment on function private.lock_warranty_admin_context() is
  'Cube M support-write authorization context. Only an active Admin profile may mutate bounded Warranty support fields/state.';

create function public.correct_warranty_details(
  p_action_request_id uuid,
  p_warranty_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_year smallint,
  p_vehicle_plate text,
  p_vehicle_color text,
  p_vehicle_vin text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_reason text;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_vehicle_make text;
  v_vehicle_model text;
  v_vehicle_year smallint;
  v_vehicle_plate text;
  v_vehicle_color text;
  v_vehicle_vin text;
  v_existing_event public.warranty_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_event_id uuid := gen_random_uuid();
  v_event_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_REQUEST_ID_REQUIRED';
  end if;
  if p_warranty_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_CORRECTION_REASON_INVALID';
  end if;

  v_customer_name := btrim(coalesce(p_customer_name, ''));
  v_customer_phone := btrim(coalesce(p_customer_phone, ''));
  v_customer_email := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');
  v_vehicle_make := btrim(coalesce(p_vehicle_make, ''));
  v_vehicle_model := btrim(coalesce(p_vehicle_model, ''));
  v_vehicle_year := p_vehicle_year;
  v_vehicle_plate := nullif(btrim(coalesce(p_vehicle_plate, '')), '');
  v_vehicle_color := nullif(btrim(coalesce(p_vehicle_color, '')), '');
  v_vehicle_vin := upper(btrim(coalesce(p_vehicle_vin, '')));

  if char_length(v_customer_name) < 2
    or char_length(v_customer_name) > 160
    or char_length(v_customer_phone) < 5
    or char_length(v_customer_phone) > 32
    or (
      v_customer_email is not null
      and (char_length(v_customer_email) < 3 or char_length(v_customer_email) > 254)
    )
    or char_length(v_vehicle_make) < 1
    or char_length(v_vehicle_make) > 120
    or char_length(v_vehicle_model) < 1
    or char_length(v_vehicle_model) > 120
    or (v_vehicle_year is not null and v_vehicle_year not between 1886 and 2200)
    or (v_vehicle_plate is not null and char_length(v_vehicle_plate) > 80)
    or (v_vehicle_color is not null and char_length(v_vehicle_color) > 80)
    or v_vehicle_vin !~ '^[A-Z0-9]{6,40}$'
  then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_DETAILS_INVALID';
  end if;

  v_after := jsonb_build_object(
    'customer_name', v_customer_name,
    'customer_phone', v_customer_phone,
    'customer_email', v_customer_email,
    'vehicle_make', v_vehicle_make,
    'vehicle_model', v_vehicle_model,
    'vehicle_year', v_vehicle_year,
    'vehicle_plate', v_vehicle_plate,
    'vehicle_color', v_vehicle_color,
    'vehicle_vin', v_vehicle_vin
  );

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select *
    into v_existing_event
  from public.warranty_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.warranty_id <> p_warranty_id
      or v_existing_event.event_kind <> 'details_corrected'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
      or v_existing_event.change_snapshot -> 'after' is distinct from v_after
    then
      raise exception using errcode = '23505', message = 'PG_WARRANTY_REQUEST_CONFLICT';
    end if;

    return v_existing_event.id;
  end if;

  select *
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  if v_warranty.record_state = 'voided_in_error' then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_ALREADY_VOIDED';
  end if;

  v_before := jsonb_build_object(
    'customer_name', v_warranty.customer_name,
    'customer_phone', v_warranty.customer_phone,
    'customer_email', v_warranty.customer_email,
    'vehicle_make', v_warranty.vehicle_make,
    'vehicle_model', v_warranty.vehicle_model,
    'vehicle_year', v_warranty.vehicle_year,
    'vehicle_plate', v_warranty.vehicle_plate,
    'vehicle_color', v_warranty.vehicle_color,
    'vehicle_vin', v_warranty.vehicle_vin
  );

  if v_before = v_after then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_DETAILS_INVALID';
  end if;

  update public.warranties warranty
  set
    customer_name = v_customer_name,
    customer_phone = v_customer_phone,
    customer_email = v_customer_email,
    vehicle_make = v_vehicle_make,
    vehicle_model = v_vehicle_model,
    vehicle_year = v_vehicle_year,
    vehicle_plate = v_vehicle_plate,
    vehicle_color = v_vehicle_color,
    vehicle_vin = v_vehicle_vin
  where warranty.id = p_warranty_id;

  insert into public.warranty_events (
    id,
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason,
    change_snapshot,
    created_at
  ) values (
    v_event_id,
    p_warranty_id,
    p_action_request_id,
    'details_corrected',
    v_actor_profile_id,
    v_reason,
    jsonb_build_object('before', v_before, 'after', v_after),
    v_event_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.correct_warranty_details(uuid, uuid, text, text, text, text, text, smallint, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.correct_warranty_details(uuid, uuid, text, text, text, text, text, smallint, text, text, text, text)
  to authenticated;

comment on function public.correct_warranty_details(uuid, uuid, text, text, text, text, text, smallint, text, text, text, text) is
  'Cube M Admin-only idempotent correction of customer/vehicle details. Core Warranty identity, Roll, Center, Product/policy snapshots and coverage timestamps remain immutable; every real change stores immutable before/after audit.';

create function public.void_warranty_in_error(
  p_action_request_id uuid,
  p_warranty_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_reason text;
  v_existing_event public.warranty_events%rowtype;
  v_warranty public.warranties%rowtype;
  v_event_id uuid := gen_random_uuid();
  v_voided_at timestamptz := clock_timestamp();
begin
  if p_action_request_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_REQUEST_ID_REQUIRED';
  end if;
  if p_warranty_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_CORRECTION_REASON_INVALID';
  end if;

  v_actor_profile_id := private.lock_warranty_admin_context();

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action_request_id::text, 0)
  );

  select *
    into v_existing_event
  from public.warranty_events event
  where event.action_request_id = p_action_request_id;

  if found then
    if v_existing_event.warranty_id <> p_warranty_id
      or v_existing_event.event_kind <> 'voided_in_error'
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.reason <> v_reason
    then
      raise exception using errcode = '23505', message = 'PG_WARRANTY_REQUEST_CONFLICT';
    end if;

    return v_existing_event.id;
  end if;

  select *
    into v_warranty
  from public.warranties warranty
  where warranty.id = p_warranty_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_NOT_FOUND';
  end if;

  if v_warranty.record_state = 'voided_in_error' then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_ALREADY_VOIDED';
  end if;

  update public.warranties warranty
  set
    record_state = 'voided_in_error',
    voided_by_profile_id = v_actor_profile_id,
    void_reason = v_reason,
    voided_at = v_voided_at
  where warranty.id = p_warranty_id;

  insert into public.warranty_events (
    id,
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason,
    created_at
  ) values (
    v_event_id,
    p_warranty_id,
    p_action_request_id,
    'voided_in_error',
    v_actor_profile_id,
    v_reason,
    v_voided_at
  );

  return v_event_id;
end;
$$;

revoke all on function public.void_warranty_in_error(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.void_warranty_in_error(uuid, uuid, text)
  to authenticated;

comment on function public.void_warranty_in_error(uuid, uuid, text) is
  'Cube M Admin-only idempotent audit correction for a demonstrably mistaken activation. Transition is issued -> voided_in_error only; history and Warranty Number are retained permanently and no restore-to-issued path exists.';

-- Warranty persistence stays RPC-only. The support functions above are the only
-- new write surface; no direct table read/write grants are introduced here.
revoke all on table public.warranties
  from public, anon, authenticated, service_role;
revoke all on table public.warranty_events
  from public, anon, authenticated, service_role;
