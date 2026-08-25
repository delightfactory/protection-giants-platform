-- Cube M — Warranty Activation, increment 2
-- Center preflight, atomic Warranty issuance, idempotency and the deferred
-- Cube J/K reverse guards. Internal reads/support/UI remain later increments.

create function private.lock_warranty_center_context()
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
  v_center_name text;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CENTER_REQUIRED';
  end if;

  select p.role, p.status, p.installation_center_id
    into v_role, v_profile_status, v_center_id
  from public.profiles p
  where p.id = v_profile_id
  for share;

  if not found or v_profile_status <> 'active' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CENTER_INACTIVE';
  end if;

  if v_role <> 'center' or v_center_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CENTER_REQUIRED';
  end if;

  select c.status, c.name, op.id
    into v_center_status, v_center_name, v_center_party_id
  from public.installation_centers c
  join public.operational_parties op
    on op.party_type = 'center'
   and op.installation_center_id = c.id
  where c.id = v_center_id
  for share of c, op;

  if not found or v_center_party_id is null then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CENTER_REQUIRED';
  end if;

  if v_center_status <> 'active' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CENTER_INACTIVE';
  end if;

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'center_id', v_center_id,
    'party_id', v_center_party_id,
    'center_name', v_center_name
  );
end;
$$;

revoke all on function private.lock_warranty_center_context()
  from public, anon, authenticated, service_role;

create function public.resolve_warranty_activation_candidate(p_roll_serial text)
returns table (
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  product_version text,
  opened_at timestamptz,
  acting_center_party_id uuid,
  acting_center_name text,
  warranty_months smallint,
  blocking_issue_state text,
  existing_warranty_id uuid,
  existing_warranty_number text,
  eligibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_center_party_id uuid;
  v_center_name text;
  v_serial text;
  v_roll_id uuid;
  v_custodian_party_id uuid;
begin
  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_SERIAL_INVALID';
  end if;

  v_actor := private.lock_warranty_center_context();
  v_center_party_id := (v_actor ->> 'party_id')::uuid;
  v_center_name := v_actor ->> 'center_name';

  select r.id
    into v_roll_id
  from public.rolls r
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_ROLL_NOT_FOUND';
  end if;

  select custody.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current custody
  where custody.roll_id = v_roll_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_CUSTODY_MISSING';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_NOT_CURRENT_CUSTODIAN';
  end if;

  return query
  select
    r.id,
    r.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    po.product_version_snapshot,
    opening.opened_at,
    v_center_party_id,
    btrim(v_center_name),
    product.default_warranty_months,
    case
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = r.id
          and issue.status = 'return_required'
      ) then 'return_required'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = r.id
          and issue.status = 'submitted'
      ) then 'submitted'
      else null
    end::text,
    issued_warranty.id,
    issued_warranty.warranty_number,
    case
      when po.status <> 'generated' then 'production_invalid'
      when reservation.roll_id is not null then 'transfer_reserved'
      when opening.roll_id is null then 'not_opened'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = r.id
          and issue.status = 'return_required'
      ) then 'return_required'
      when exists (
        select 1
        from public.roll_preinstall_issues issue
        where issue.roll_id = r.id
          and issue.status = 'submitted'
      ) then 'issue_pending'
      when issued_warranty.id is not null then 'already_activated'
      when product.default_warranty_months is null
        or product.default_warranty_months not between 1 and 240
        or product.warranty_coverage is null
        or char_length(btrim(product.warranty_coverage)) < 2
        or product.care_instructions is null
        or char_length(btrim(product.care_instructions)) < 2
      then 'policy_incomplete'
      else 'eligible'
    end::text
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.production_lots lot on lot.id = r.production_lot_id
  join public.products product on product.id = r.product_id
  left join public.roll_openings opening on opening.roll_id = r.id
  left join public.roll_transfer_reservations reservation on reservation.roll_id = r.id
  left join lateral (
    select warranty.id, warranty.warranty_number
    from public.warranties warranty
    where warranty.roll_id = r.id
      and warranty.record_state = 'issued'
    limit 1
  ) issued_warranty on true
  where r.id = v_roll_id;
end;
$$;

revoke all on function public.resolve_warranty_activation_candidate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_warranty_activation_candidate(text)
  to authenticated;

comment on function public.resolve_warranty_activation_candidate(text) is
  'Cube M Center-only exact-Roll Warranty preflight. It returns minimum safe operational state and never replaces final activation revalidation.';

create function public.activate_roll_warranty(
  p_request_id uuid,
  p_roll_serial text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_year smallint,
  p_vehicle_plate text,
  p_vehicle_color text,
  p_vehicle_vin text
)
returns table (
  warranty_id uuid,
  warranty_number text,
  record_state text,
  activated_at timestamptz,
  coverage_expires_at timestamptz,
  product_code text,
  product_name text,
  product_version text,
  activating_center_name text,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_center_party_id uuid;
  v_center_name text;
  v_serial text;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_vehicle_make text;
  v_vehicle_model text;
  v_vehicle_year smallint;
  v_vehicle_plate text;
  v_vehicle_color text;
  v_vehicle_vin text;
  v_roll_id uuid;
  v_production_order_id uuid;
  v_product_id uuid;
  v_production_status text;
  v_product_code_snapshot text;
  v_product_name_snapshot text;
  v_product_version_snapshot text;
  v_custodian_party_id uuid;
  v_warranty_months smallint;
  v_warranty_coverage text;
  v_care_instructions text;
  v_sequence bigint;
  v_sequence_text text;
  v_warranty_number text;
  v_warranty_id uuid := gen_random_uuid();
  v_activated_at timestamptz;
  v_coverage_expires_at timestamptz;
  v_existing public.warranties%rowtype;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_REQUEST_ID_REQUIRED';
  end if;

  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_SERIAL_INVALID';
  end if;

  v_customer_name := btrim(coalesce(p_customer_name, ''));
  v_customer_phone := btrim(coalesce(p_customer_phone, ''));
  v_customer_email := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');

  if char_length(v_customer_name) < 2
    or char_length(v_customer_name) > 160
    or char_length(v_customer_phone) < 5
    or char_length(v_customer_phone) > 32
    or (
      v_customer_email is not null
      and (char_length(v_customer_email) < 3 or char_length(v_customer_email) > 254)
    )
  then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_CUSTOMER_INVALID';
  end if;

  v_vehicle_make := btrim(coalesce(p_vehicle_make, ''));
  v_vehicle_model := btrim(coalesce(p_vehicle_model, ''));
  v_vehicle_year := p_vehicle_year;
  v_vehicle_plate := nullif(btrim(coalesce(p_vehicle_plate, '')), '');
  v_vehicle_color := nullif(btrim(coalesce(p_vehicle_color, '')), '');
  v_vehicle_vin := upper(btrim(coalesce(p_vehicle_vin, '')));

  if char_length(v_vehicle_make) < 1
    or char_length(v_vehicle_make) > 120
    or char_length(v_vehicle_model) < 1
    or char_length(v_vehicle_model) > 120
    or (v_vehicle_year is not null and v_vehicle_year not between 1886 and 2200)
    or (v_vehicle_plate is not null and char_length(v_vehicle_plate) > 80)
    or (v_vehicle_color is not null and char_length(v_vehicle_color) > 80)
    or v_vehicle_vin !~ '^[A-Z0-9]{6,40}$'
  then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_VEHICLE_INVALID';
  end if;

  v_actor := private.lock_warranty_center_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_center_party_id := (v_actor ->> 'party_id')::uuid;
  v_center_name := btrim(coalesce(v_actor ->> 'center_name', ''));

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select r.id, r.production_order_id, r.product_id
    into v_roll_id, v_production_order_id, v_product_id
  from public.rolls r
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_WARRANTY_ROLL_NOT_FOUND';
  end if;

  select *
    into v_existing
  from public.warranties warranty
  where warranty.request_id = p_request_id;

  if found then
    if v_existing.activated_by_profile_id <> v_actor_profile_id
      or v_existing.roll_id <> v_roll_id
      or v_existing.customer_name <> v_customer_name
      or v_existing.customer_phone <> v_customer_phone
      or v_existing.customer_email is distinct from v_customer_email
      or v_existing.vehicle_make <> v_vehicle_make
      or v_existing.vehicle_model <> v_vehicle_model
      or v_existing.vehicle_year is distinct from v_vehicle_year
      or v_existing.vehicle_plate is distinct from v_vehicle_plate
      or v_existing.vehicle_color is distinct from v_vehicle_color
      or v_existing.vehicle_vin <> v_vehicle_vin
    then
      raise exception using errcode = '23505', message = 'PG_WARRANTY_REQUEST_CONFLICT';
    end if;

    return query
    select
      warranty.id,
      warranty.warranty_number,
      warranty.record_state,
      warranty.activated_at,
      warranty.coverage_expires_at,
      warranty.product_code_snapshot,
      warranty.product_name_snapshot,
      warranty.product_version_snapshot,
      warranty.activating_center_name_snapshot,
      warranty.customer_name,
      warranty.customer_phone,
      warranty.customer_email,
      warranty.vehicle_make,
      warranty.vehicle_model,
      warranty.vehicle_year,
      warranty.vehicle_plate,
      warranty.vehicle_color,
      warranty.vehicle_vin
    from public.warranties warranty
    where warranty.id = v_existing.id;
    return;
  end if;

  -- Preserve the Cube J/K physical lifecycle lock order exactly:
  -- Production Order -> current custody.
  select
    po.status,
    po.product_id,
    po.product_code_snapshot,
    po.product_name_snapshot,
    po.product_version_snapshot
  into
    v_production_status,
    v_product_id,
    v_product_code_snapshot,
    v_product_name_snapshot,
    v_product_version_snapshot
  from public.production_orders po
  where po.id = v_production_order_id
  for update;

  if not found or v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_PRODUCTION_INVALID';
  end if;

  select custody.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current custody
  where custody.roll_id = v_roll_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_CUSTODY_MISSING';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_NOT_CURRENT_CUSTODIAN';
  end if;

  if exists (
    select 1
    from public.roll_transfer_reservations reservation
    where reservation.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_TRANSFER_RESERVED';
  end if;

  if not exists (
    select 1
    from public.roll_openings opening
    where opening.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_ROLL_NOT_OPENED';
  end if;

  if exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id
      and issue.status = 'return_required'
  ) then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_RETURN_REQUIRED';
  end if;

  if exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id
      and issue.status = 'submitted'
  ) then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_ISSUE_PENDING';
  end if;

  if exists (
    select 1
    from public.warranties warranty
    where warranty.roll_id = v_roll_id
      and warranty.record_state = 'issued'
  ) then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_ALREADY_ACTIVATED';
  end if;

  -- Product policy is locked only after the physical Roll lifecycle locks. A
  -- Product UPDATE therefore cannot produce a mixed duration/coverage/care snapshot.
  select
    product.default_warranty_months,
    btrim(product.warranty_coverage),
    btrim(product.care_instructions)
  into
    v_warranty_months,
    v_warranty_coverage,
    v_care_instructions
  from public.products product
  where product.id = v_product_id
  for share;

  if not found
    or v_warranty_months is null
    or v_warranty_months not between 1 and 240
    or v_warranty_coverage is null
    or char_length(v_warranty_coverage) < 2
    or v_care_instructions is null
    or char_length(v_care_instructions) < 2
  then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_POLICY_INCOMPLETE';
  end if;

  if char_length(v_center_name) < 2 or char_length(v_center_name) > 160 then
    raise exception using errcode = '23514', message = 'PG_WARRANTY_CENTER_INACTIVE';
  end if;

  v_sequence := nextval('private.warranty_number_seq'::regclass);
  v_sequence_text := v_sequence::text;
  if char_length(v_sequence_text) < 8 then
    v_sequence_text := lpad(v_sequence_text, 8, '0');
  end if;
  v_warranty_number := format('PG-W-%s', v_sequence_text);

  v_activated_at := clock_timestamp();
  v_coverage_expires_at := (
    (v_activated_at at time zone 'UTC') + make_interval(months => v_warranty_months)
  ) at time zone 'UTC';

  insert into public.warranties (
    id,
    request_id,
    roll_id,
    warranty_number,
    activated_by_profile_id,
    activating_center_party_id,
    activating_center_name_snapshot,
    activated_at,
    coverage_expires_at,
    product_id,
    product_code_snapshot,
    product_name_snapshot,
    product_version_snapshot,
    warranty_months_snapshot,
    warranty_coverage_snapshot,
    care_instructions_snapshot,
    customer_name,
    customer_phone,
    customer_email,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_plate,
    vehicle_color,
    vehicle_vin
  ) values (
    v_warranty_id,
    p_request_id,
    v_roll_id,
    v_warranty_number,
    v_actor_profile_id,
    v_center_party_id,
    v_center_name,
    v_activated_at,
    v_coverage_expires_at,
    v_product_id,
    v_product_code_snapshot,
    v_product_name_snapshot,
    v_product_version_snapshot,
    v_warranty_months,
    v_warranty_coverage,
    v_care_instructions,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    v_vehicle_make,
    v_vehicle_model,
    v_vehicle_year,
    v_vehicle_plate,
    v_vehicle_color,
    v_vehicle_vin
  );

  insert into public.warranty_events (
    warranty_id,
    action_request_id,
    event_kind,
    actor_profile_id
  ) values (
    v_warranty_id,
    p_request_id,
    'activated',
    v_actor_profile_id
  );

  return query
  select
    warranty.id,
    warranty.warranty_number,
    warranty.record_state,
    warranty.activated_at,
    warranty.coverage_expires_at,
    warranty.product_code_snapshot,
    warranty.product_name_snapshot,
    warranty.product_version_snapshot,
    warranty.activating_center_name_snapshot,
    warranty.customer_name,
    warranty.customer_phone,
    warranty.customer_email,
    warranty.vehicle_make,
    warranty.vehicle_model,
    warranty.vehicle_year,
    warranty.vehicle_plate,
    warranty.vehicle_color,
    warranty.vehicle_vin
  from public.warranties warranty
  where warranty.id = v_warranty_id;
end;
$$;

revoke all on function public.activate_roll_warranty(uuid, text, text, text, text, text, text, smallint, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_roll_warranty(uuid, text, text, text, text, text, text, smallint, text, text, text)
  to authenticated;

comment on function public.activate_roll_warranty(uuid, text, text, text, text, text, text, smallint, text, text, text) is
  'Cube M authoritative Center-only Warranty issuance. Preserves Production Order -> custody lock order and snapshots current Product Warranty policy atomically.';

-- Reverse guard for Cube K. The normal RPC reaches this INSERT only after its
-- established Production Order -> custody locks, so Activation/Issue races have
-- exactly one durable winner. The trigger also protects privileged accidental inserts.
create function private.prevent_preinstall_issue_after_warranty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.warranties warranty
    where warranty.roll_id = new.roll_id
      and warranty.record_state = 'issued'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_WARRANTY_ACTIVATED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_preinstall_issue_after_warranty()
  from public, anon, authenticated, service_role;

create trigger roll_preinstall_issues_warranty_guard
  before insert on public.roll_preinstall_issues
  for each row execute function private.prevent_preinstall_issue_after_warranty();

-- Reverse guard for Cube J Recovery. recover_opened_roll reaches reservation
-- creation only after the same Production Order -> custody locks. Standard
-- Transfers are unaffected; they remain governed by the existing Opening guard.
create function private.prevent_opened_roll_recovery_after_warranty()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.roll_transfers transfer
    where transfer.id = new.transfer_id
      and transfer.transfer_kind = 'opened_roll_recovery'
  ) and exists (
    select 1
    from public.warranties warranty
    where warranty.roll_id = new.roll_id
      and warranty.record_state = 'issued'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_WARRANTY_ACTIVATED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_opened_roll_recovery_after_warranty()
  from public, anon, authenticated, service_role;

create trigger roll_recovery_warranty_guard
  before insert on public.roll_transfer_reservations
  for each row execute function private.prevent_opened_roll_recovery_after_warranty();

-- Surface the deferred Warranty state in the existing Cube K preflight without
-- changing its public shape.
create or replace function public.resolve_roll_preinstall_issue_candidate(p_roll_serial text)
returns table (
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  opened_at timestamptz,
  center_name text,
  eligibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_role text;
  v_center_party_id uuid;
  v_serial text;
  v_roll_id uuid;
  v_production_status text;
  v_custodian_party_id uuid;
begin
  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_role := v_actor ->> 'role';
  v_center_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role <> 'center' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_REQUIRED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_center_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_INACTIVE';
  end if;

  select r.id, po.status, custody.custodian_party_id
    into v_roll_id, v_production_status, v_custodian_party_id
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_ROLL_NOT_FOUND';
  end if;

  if v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_PRODUCTION_INVALID';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN';
  end if;

  if not exists (select 1 from public.roll_openings opening where opening.roll_id = v_roll_id) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ROLL_NOT_OPENED';
  end if;

  return query
  select
    r.id,
    r.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    opening.opened_at,
    coalesce(center_entity.name, 'مركز تركيب')::text,
    case
      when exists (
        select 1 from public.warranties warranty
        where warranty.roll_id = r.id and warranty.record_state = 'issued'
      ) then 'warranty_activated'
      when exists (
        select 1 from public.roll_preinstall_issues issue
        where issue.roll_id = r.id and issue.status = 'return_required'
      ) then 'return_required'
      when exists (
        select 1 from public.roll_preinstall_issues issue
        where issue.roll_id = r.id and issue.status = 'submitted'
      ) then 'active_issue'
      else 'eligible'
    end::text
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.production_lots lot on lot.id = r.production_lot_id
  join public.roll_openings opening on opening.roll_id = r.id
  join public.operational_parties center_party on center_party.id = v_center_party_id
  left join public.installation_centers center_entity on center_entity.id = center_party.installation_center_id
  where r.id = v_roll_id;
end;
$$;

revoke all on function public.resolve_roll_preinstall_issue_candidate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_roll_preinstall_issue_candidate(text)
  to authenticated;

-- Surface the deferred Warranty state in the existing Cube J Recovery preflight
-- without changing its public shape.
create or replace function public.resolve_opened_roll_recovery_candidate(p_roll_serial text)
returns table (
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  opened_at timestamptz,
  opening_center_name text,
  current_custodian_type text,
  current_custodian_name text,
  recovery_destination_name text,
  eligibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_role text;
  v_recipient_party_id uuid;
  v_agent_id uuid;
  v_serial text;
  v_roll_id uuid;
  v_production_status text;
  v_sender_party_id uuid;
  v_sender_party_type text;
  v_sender_center_id uuid;
  v_destination_name text;
begin
  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_role := v_actor ->> 'role';
  v_recipient_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role not in ('admin', 'agent') then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_NOT_AUTHORIZED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_recipient_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_ACTOR_INACTIVE';
  end if;

  if v_actor_role = 'agent' then
    select op.country_agent_id, ca.name
      into v_agent_id, v_destination_name
    from public.operational_parties op
    join public.country_agents ca on ca.id = op.country_agent_id
    where op.id = v_recipient_party_id
      and op.party_type = 'agent'
      and ca.status = 'active'
      and ca.opened_roll_recovery_enabled = true;

    if not found or v_agent_id is null then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_NOT_ENABLED';
    end if;
  else
    v_destination_name := 'Protection Giants';
  end if;

  select
    r.id,
    po.status,
    custody.custodian_party_id,
    current_party.party_type,
    current_party.installation_center_id
  into
    v_roll_id,
    v_production_status,
    v_sender_party_id,
    v_sender_party_type,
    v_sender_center_id
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  join public.operational_parties current_party on current_party.id = custody.custodian_party_id
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_ROLL_NOT_FOUND';
  end if;

  if v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_PRODUCTION_INVALID';
  end if;

  if not exists (
    select 1 from public.roll_openings opening where opening.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_NOT_OPENED';
  end if;

  if v_actor_role = 'agent' then
    if v_sender_party_type <> 'center' or v_sender_center_id is null then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_CENTER_REQUIRED';
    end if;

    if not exists (
      select 1
      from public.installation_centers center_entity
      left join public.dealers dealer_entity on dealer_entity.id = center_entity.dealer_id
      where center_entity.id = v_sender_center_id
        and (
          center_entity.country_agent_id = v_agent_id
          or dealer_entity.country_agent_id = v_agent_id
        )
    ) then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_OUTSIDE_AGENT_SCOPE';
    end if;
  end if;

  return query
  select
    r.id,
    r.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    opening.opened_at,
    coalesce(opening_center.name, 'مركز تركيب')::text,
    current_party.party_type,
    case current_party.party_type
      when 'company' then 'Protection Giants'
      when 'agent' then coalesce(current_agent.name, 'وكيل دولة')
      when 'dealer' then coalesce(current_dealer.name, 'موزع')
      when 'center' then coalesce(current_center.name, 'مركز تركيب')
      else 'جهة تشغيلية'
    end::text,
    v_destination_name,
    case
      when exists (
        select 1 from public.warranties warranty
        where warranty.roll_id = r.id and warranty.record_state = 'issued'
      ) then 'warranty_activated'
      when current_party.id = v_recipient_party_id then 'already_at_destination'
      when reservation.roll_id is not null then 'transfer_reserved'
      else 'eligible'
    end::text
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.production_lots lot on lot.id = r.production_lot_id
  join public.roll_openings opening on opening.roll_id = r.id
  join public.operational_parties opening_party on opening_party.id = opening.opened_by_center_party_id
  left join public.installation_centers opening_center on opening_center.id = opening_party.installation_center_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  join public.operational_parties current_party on current_party.id = custody.custodian_party_id
  left join public.country_agents current_agent on current_agent.id = current_party.country_agent_id
  left join public.dealers current_dealer on current_dealer.id = current_party.dealer_id
  left join public.installation_centers current_center on current_center.id = current_party.installation_center_id
  left join public.roll_transfer_reservations reservation on reservation.roll_id = r.id
  where r.id = v_roll_id;
end;
$$;

revoke all on function public.resolve_opened_roll_recovery_candidate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_opened_roll_recovery_candidate(text)
  to authenticated;
