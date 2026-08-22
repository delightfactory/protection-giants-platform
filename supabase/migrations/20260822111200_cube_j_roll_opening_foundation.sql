-- Cube J — Roll Opening / Claiming, increment 1
-- Record immutable Center opening, serialize it against Transfer reservation,
-- and reserve a narrow Transfer kind for later opened-Roll recovery.

alter table public.roll_transfers
  add column transfer_kind text not null default 'standard';

alter table public.roll_transfers
  add constraint roll_transfers_kind_allowed
  check (transfer_kind in ('standard', 'opened_roll_recovery'));

comment on column public.roll_transfers.transfer_kind is
  'Immutable Transfer kind. Existing/ordinary business transfers are standard; opened_roll_recovery is reserved for Cube J authorized physical recovery.';

create function private.reject_roll_transfer_kind_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.transfer_kind is distinct from old.transfer_kind then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_KIND_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_roll_transfer_kind_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_transfers_kind_immutable
  before update of transfer_kind on public.roll_transfers
  for each row
  execute function private.reject_roll_transfer_kind_mutation();

create table public.roll_openings (
  roll_id uuid primary key
    references public.rolls(id) on delete restrict,
  request_id uuid not null unique,
  opened_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  opened_by_center_party_id uuid not null
    references public.operational_parties(id) on delete restrict,
  opened_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index roll_openings_center_recent_idx
  on public.roll_openings (opened_by_center_party_id, opened_at desc, roll_id);

comment on table public.roll_openings is
  'Cube J immutable one-row-per-Roll record that an eligible confirmed-custodian Center physically opened/claimed the Roll.';
comment on column public.roll_openings.request_id is
  'Idempotency key for the successful Roll Opening mutation.';
comment on column public.roll_openings.opened_by_center_party_id is
  'The Center Operational Party holding confirmed custody at the atomic Opening transition.';

-- Opening identity is historical physical evidence. It cannot be rewritten or
-- deleted even by accidental privileged SQL after insertion.
create function private.reject_roll_opening_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_ROLL_OPENING_IMMUTABLE';
end;
$$;

revoke all on function private.reject_roll_opening_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_openings_immutable
  before update or delete on public.roll_openings
  for each row
  execute function private.reject_roll_opening_mutation();

-- Defense in depth for privileged/internal insertion: the recorded actor and
-- Center party must describe the same Center binding.
create function private.validate_roll_opening_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_profile_center_id uuid;
  v_profile_role text;
begin
  select op.installation_center_id
    into v_center_id
  from public.operational_parties op
  where op.id = new.opened_by_center_party_id
    and op.party_type = 'center';

  if v_center_id is null then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_CENTER_PARTY_INVALID';
  end if;

  select p.role, p.installation_center_id
    into v_profile_role, v_profile_center_id
  from public.profiles p
  where p.id = new.opened_by_profile_id;

  if not found
    or v_profile_role <> 'center'
    or v_profile_center_id is distinct from v_center_id
  then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_ACTOR_CENTER_MISMATCH';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_roll_opening_identity()
  from public, anon, authenticated, service_role;

create trigger roll_openings_validate_identity
  before insert on public.roll_openings
  for each row
  execute function private.validate_roll_opening_identity();

alter table public.roll_openings enable row level security;

revoke all on table public.roll_openings
  from public, anon, authenticated, service_role;

grant select on table public.roll_openings to authenticated;

create policy "roll_openings_admin_read"
on public.roll_openings
for select
to authenticated
using ((select private.is_active_admin()));

create policy "roll_openings_origin_center_read"
on public.roll_openings
for select
to authenticated
using (
  opened_by_center_party_id = (select private.current_active_operational_party_id())
);

create function public.open_roll(
  p_request_id uuid,
  p_roll_serial text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_center_party_id uuid;
  v_serial text;
  v_roll_id uuid;
  v_production_order_id uuid;
  v_custodian_party_id uuid;
  v_existing_roll_id uuid;
  v_existing_profile_id uuid;
  v_existing_center_party_id uuid;
  v_now timestamptz := now();
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_OPENING_REQUEST_ID_REQUIRED';
  end if;

  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_OPENING_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_role := v_actor ->> 'role';
  v_center_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role <> 'center' then
    raise exception using errcode = '42501', message = 'PG_ROLL_OPENING_CENTER_REQUIRED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_center_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_OPENING_CENTER_INACTIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select r.id, r.production_order_id
    into v_roll_id, v_production_order_id
  from public.rolls r
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_OPENING_ROLL_NOT_FOUND';
  end if;

  select
    ro.roll_id,
    ro.opened_by_profile_id,
    ro.opened_by_center_party_id
  into
    v_existing_roll_id,
    v_existing_profile_id,
    v_existing_center_party_id
  from public.roll_openings ro
  where ro.request_id = p_request_id;

  if found then
    if v_existing_roll_id <> v_roll_id
      or v_existing_profile_id <> v_actor_profile_id
      or v_existing_center_party_id <> v_center_party_id
    then
      raise exception using errcode = '23505', message = 'PG_ROLL_OPENING_REQUEST_CONFLICT';
    end if;

    return v_existing_roll_id;
  end if;

  -- Match Transfer creation lock order: Production Order -> current custody.
  -- This serializes Production void, Opening and new Transfer reservation.
  perform 1
  from public.production_orders po
  where po.id = v_production_order_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_PRODUCTION_MISSING';
  end if;

  if exists (
    select 1
    from public.production_orders po
    where po.id = v_production_order_id
      and po.status <> 'generated'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_PRODUCTION_INVALID';
  end if;

  select rc.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current rc
  where rc.roll_id = v_roll_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_CUSTODY_MISSING';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_ROLL_OPENING_NOT_CURRENT_CUSTODIAN';
  end if;

  if exists (
    select 1
    from public.roll_transfer_reservations reservation
    where reservation.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_TRANSFER_RESERVED';
  end if;

  if exists (
    select 1
    from public.roll_openings ro
    where ro.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ALREADY_OPENED';
  end if;

  insert into public.roll_openings (
    roll_id,
    request_id,
    opened_by_profile_id,
    opened_by_center_party_id,
    opened_at
  ) values (
    v_roll_id,
    p_request_id,
    v_actor_profile_id,
    v_center_party_id,
    v_now
  );

  return v_roll_id;
end;
$$;

revoke all on function public.open_roll(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.open_roll(uuid, text)
  to authenticated;

comment on function public.open_roll(uuid, text) is
  'Cube J Center-only atomic Roll Opening. Requires active Center, confirmed current custody, generated Production Order, no active Transfer reservation, and no prior Opening.';

-- Ordinary Transfer creation still owns reservation creation. This guard makes
-- opened-Roll exclusion database-enforced without copying/replacing the mature
-- Cube F/G/H Transfer RPC. Future opened_roll_recovery may reserve an opened
-- Roll only through its dedicated kind and authorization path.
create function private.guard_opened_roll_transfer_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transfer_kind text;
begin
  select rt.transfer_kind
    into v_transfer_kind
  from public.roll_transfers rt
  where rt.id = new.transfer_id;

  if v_transfer_kind is null then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_KIND_MISSING';
  end if;

  if v_transfer_kind = 'standard'
    and exists (
      select 1
      from public.roll_openings ro
      where ro.roll_id = new.roll_id
    )
  then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_ROLL_OPENED';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_opened_roll_transfer_reservation()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_reservations_opened_roll_guard
  before insert on public.roll_transfer_reservations
  for each row
  execute function private.guard_opened_roll_transfer_reservation();
