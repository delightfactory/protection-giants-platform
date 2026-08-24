-- Cube M — Warranty Activation, increment 1
-- Durable Warranty persistence, Warranty Number sequence, immutable audit history,
-- RLS and direct-mutation denial only. Activation/read/support RPCs follow in later
-- small Cube M increments.

create sequence private.warranty_number_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no maxvalue
  no cycle;

revoke all on sequence private.warranty_number_seq
  from public, anon, authenticated, service_role;

comment on sequence private.warranty_number_seq is
  'Cube M monotonic Warranty Number source. Values are never recycled; gaps are acceptable.';

create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  roll_id uuid not null references public.rolls(id) on delete restrict,
  warranty_number text not null unique,
  record_state text not null default 'issued',

  activated_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  activating_center_party_id uuid not null references public.operational_parties(id) on delete restrict,
  activating_center_name_snapshot text not null,
  activated_at timestamptz not null,
  coverage_expires_at timestamptz not null,

  product_id uuid not null references public.products(id) on delete restrict,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  product_version_snapshot text,
  warranty_months_snapshot smallint not null,
  warranty_coverage_snapshot text not null,
  care_instructions_snapshot text not null,

  customer_name text not null,
  customer_phone text not null,
  customer_email text,

  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_year smallint,
  vehicle_plate text,
  vehicle_color text,
  vehicle_vin text not null,

  voided_by_profile_id uuid references public.profiles(id) on delete restrict,
  void_reason text,
  voided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranties_number_format
    check (warranty_number ~ '^PG-W-[0-9]{8,}$'),
  constraint warranties_record_state_allowed
    check (record_state in ('issued', 'voided_in_error')),
  constraint warranties_void_shape
    check (
      (
        record_state = 'issued'
        and voided_by_profile_id is null
        and void_reason is null
        and voided_at is null
      )
      or (
        record_state = 'voided_in_error'
        and voided_by_profile_id is not null
        and void_reason is not null
        and void_reason = btrim(void_reason)
        and char_length(void_reason) between 5 and 500
        and voided_at is not null
        and voided_at >= activated_at
      )
    ),
  constraint warranties_coverage_window
    check (coverage_expires_at > activated_at),
  constraint warranties_updated_at_shape
    check (updated_at >= created_at),
  constraint warranties_center_name_snapshot_shape
    check (
      activating_center_name_snapshot = btrim(activating_center_name_snapshot)
      and char_length(activating_center_name_snapshot) between 2 and 160
    ),
  constraint warranties_product_code_snapshot_shape
    check (
      product_code_snapshot = btrim(product_code_snapshot)
      and char_length(product_code_snapshot) between 2 and 40
    ),
  constraint warranties_product_name_snapshot_shape
    check (
      product_name_snapshot = btrim(product_name_snapshot)
      and char_length(product_name_snapshot) between 2 and 120
    ),
  constraint warranties_product_version_snapshot_shape
    check (
      product_version_snapshot is null
      or (
        product_version_snapshot = btrim(product_version_snapshot)
        and char_length(product_version_snapshot) between 1 and 80
      )
    ),
  constraint warranties_duration_snapshot_shape
    check (warranty_months_snapshot between 1 and 240),
  constraint warranties_coverage_snapshot_shape
    check (
      warranty_coverage_snapshot = btrim(warranty_coverage_snapshot)
      and char_length(warranty_coverage_snapshot) between 2 and 12000
    ),
  constraint warranties_care_snapshot_shape
    check (
      care_instructions_snapshot = btrim(care_instructions_snapshot)
      and char_length(care_instructions_snapshot) between 2 and 12000
    ),
  constraint warranties_customer_name_shape
    check (
      customer_name = btrim(customer_name)
      and char_length(customer_name) between 2 and 160
    ),
  constraint warranties_customer_phone_shape
    check (
      customer_phone = btrim(customer_phone)
      and char_length(customer_phone) between 5 and 32
    ),
  constraint warranties_customer_email_shape
    check (
      customer_email is null
      or (
        customer_email = btrim(customer_email)
        and char_length(customer_email) between 3 and 254
      )
    ),
  constraint warranties_vehicle_make_shape
    check (
      vehicle_make = btrim(vehicle_make)
      and char_length(vehicle_make) between 1 and 120
    ),
  constraint warranties_vehicle_model_shape
    check (
      vehicle_model = btrim(vehicle_model)
      and char_length(vehicle_model) between 1 and 120
    ),
  constraint warranties_vehicle_year_shape
    check (vehicle_year is null or vehicle_year between 1886 and 2200),
  constraint warranties_vehicle_plate_shape
    check (
      vehicle_plate is null
      or (
        vehicle_plate = btrim(vehicle_plate)
        and char_length(vehicle_plate) between 1 and 80
      )
    ),
  constraint warranties_vehicle_color_shape
    check (
      vehicle_color is null
      or (
        vehicle_color = btrim(vehicle_color)
        and char_length(vehicle_color) between 1 and 80
      )
    ),
  constraint warranties_vehicle_vin_shape
    check (
      vehicle_vin = upper(vehicle_vin)
      and vehicle_vin ~ '^[A-Z0-9]{6,40}$'
    )
);

create unique index warranties_one_issued_per_roll_idx
  on public.warranties (roll_id)
  where record_state = 'issued';

create index warranties_center_recent_idx
  on public.warranties (activating_center_party_id, activated_at desc, id desc);

create index warranties_admin_recent_idx
  on public.warranties (activated_at desc, id desc);

create index warranties_vehicle_vin_idx
  on public.warranties (vehicle_vin);

create index warranties_customer_phone_idx
  on public.warranties (customer_phone);

create table public.warranty_events (
  id uuid primary key default gen_random_uuid(),
  warranty_id uuid not null references public.warranties(id) on delete restrict,
  action_request_id uuid not null unique,
  event_kind text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  change_snapshot jsonb,
  created_at timestamptz not null default now(),

  constraint warranty_events_kind_allowed
    check (event_kind in ('activated', 'details_corrected', 'voided_in_error')),
  constraint warranty_events_reason_shape
    check (
      (event_kind = 'activated' and reason is null)
      or (
        event_kind in ('details_corrected', 'voided_in_error')
        and reason is not null
        and reason = btrim(reason)
        and char_length(reason) between 5 and 500
      )
    ),
  constraint warranty_events_change_snapshot_shape
    check (
      (event_kind = 'activated' and change_snapshot is null)
      or event_kind in ('details_corrected', 'voided_in_error')
    )
);

create index warranty_events_warranty_timeline_idx
  on public.warranty_events (warranty_id, created_at, id);

comment on table public.warranties is
  'Cube M customer Warranty created by successful Roll activation. Core issuance identity/policy/Center snapshots are immutable; only bounded support corrections are allowed.';
comment on table public.warranty_events is
  'Cube M append-only audit timeline for activation, bounded customer/vehicle correction, and void-in-error support actions.';

-- Core issuance identity and snapshots never change. While issued, the later
-- Admin support RPC may correct only customer/vehicle detail fields. The only
-- state transition is issued -> voided_in_error, and that transition may not be
-- combined with customer/vehicle correction. Once voided, the row is immutable.
create function private.guard_warranty_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_IMMUTABLE';
  end if;

  if old.record_state = 'voided_in_error' then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_VOIDED_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.roll_id is distinct from old.roll_id
    or new.warranty_number is distinct from old.warranty_number
    or new.activated_by_profile_id is distinct from old.activated_by_profile_id
    or new.activating_center_party_id is distinct from old.activating_center_party_id
    or new.activating_center_name_snapshot is distinct from old.activating_center_name_snapshot
    or new.activated_at is distinct from old.activated_at
    or new.coverage_expires_at is distinct from old.coverage_expires_at
    or new.product_id is distinct from old.product_id
    or new.product_code_snapshot is distinct from old.product_code_snapshot
    or new.product_name_snapshot is distinct from old.product_name_snapshot
    or new.product_version_snapshot is distinct from old.product_version_snapshot
    or new.warranty_months_snapshot is distinct from old.warranty_months_snapshot
    or new.warranty_coverage_snapshot is distinct from old.warranty_coverage_snapshot
    or new.care_instructions_snapshot is distinct from old.care_instructions_snapshot
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_WARRANTY_CORE_IMMUTABLE';
  end if;

  if new.record_state = old.record_state then
    if new.voided_by_profile_id is distinct from old.voided_by_profile_id
      or new.void_reason is distinct from old.void_reason
      or new.voided_at is distinct from old.voided_at
    then
      raise exception using errcode = '42501', message = 'PG_WARRANTY_VOID_METADATA_IMMUTABLE';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if old.record_state = 'issued' and new.record_state = 'voided_in_error' then
    if new.customer_name is distinct from old.customer_name
      or new.customer_phone is distinct from old.customer_phone
      or new.customer_email is distinct from old.customer_email
      or new.vehicle_make is distinct from old.vehicle_make
      or new.vehicle_model is distinct from old.vehicle_model
      or new.vehicle_year is distinct from old.vehicle_year
      or new.vehicle_plate is distinct from old.vehicle_plate
      or new.vehicle_color is distinct from old.vehicle_color
      or new.vehicle_vin is distinct from old.vehicle_vin
    then
      raise exception using errcode = '42501', message = 'PG_WARRANTY_VOID_WITH_DETAILS_CHANGE';
    end if;

    new.updated_at := now();
    return new;
  end if;

  raise exception using errcode = '42501', message = 'PG_WARRANTY_INVALID_TRANSITION';
end;
$$;

revoke all on function private.guard_warranty_mutation()
  from public, anon, authenticated, service_role;

create trigger warranties_guard_mutation
  before update or delete on public.warranties
  for each row execute function private.guard_warranty_mutation();

create function private.reject_warranty_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_WARRANTY_HISTORY_IMMUTABLE';
end;
$$;

revoke all on function private.reject_warranty_event_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_events_immutable
  before update or delete on public.warranty_events
  for each row execute function private.reject_warranty_event_mutation();

alter table public.warranties enable row level security;
alter table public.warranty_events enable row level security;

-- Increment 1 intentionally exposes no direct Data API surface. Center/Admin
-- read policies and SELECT grants arrive with the bounded read increment. All
-- writes remain authoritative-RPC-only throughout Cube M.
revoke all on table public.warranties from public, anon, authenticated, service_role;
revoke all on table public.warranty_events from public, anon, authenticated, service_role;
