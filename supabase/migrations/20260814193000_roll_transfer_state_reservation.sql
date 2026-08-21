-- Cube F — Roll Transfer State & Reservation Engine
-- Create pending Transfers, reserve selected physical Rolls without moving
-- confirmed custody, and release reservations through pre-receipt terminal paths.

create sequence public.roll_transfer_sequence
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

revoke all on sequence public.roll_transfer_sequence
  from public, anon, authenticated, service_role;

create table public.roll_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  request_id uuid not null unique,
  sender_party_id uuid not null
    references public.operational_parties(id) on delete restrict,
  recipient_party_id uuid not null
    references public.operational_parties(id) on delete restrict,
  status text not null,
  roll_count integer not null,
  created_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_at timestamptz,

  constraint roll_transfers_different_parties
    check (sender_party_id <> recipient_party_id),
  constraint roll_transfers_status_allowed
    check (status in ('pending', 'cancelled', 'rejected')),
  constraint roll_transfers_roll_count_bounds
    check (roll_count between 1 and 10000),
  constraint roll_transfers_closed_state
    check (
      (status = 'pending' and closed_at is null)
      or (status in ('cancelled', 'rejected') and closed_at is not null)
    ),
  constraint roll_transfers_number_format
    check (transfer_number ~ '^PG-T-[0-9]{8}-[0-9]{8}$')
);

create index roll_transfers_sender_recent_idx
  on public.roll_transfers (sender_party_id, created_at desc);

create index roll_transfers_recipient_status_recent_idx
  on public.roll_transfers (recipient_party_id, status, created_at desc);

create table public.roll_transfer_items (
  transfer_id uuid not null
    references public.roll_transfers(id) on delete restrict,
  roll_id uuid not null
    references public.rolls(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (transfer_id, roll_id)
);

create table public.roll_transfer_reservations (
  roll_id uuid primary key
    references public.rolls(id) on delete restrict,
  transfer_id uuid not null,
  reserved_at timestamptz not null default now(),
  constraint roll_transfer_reservations_item_fkey
    foreign key (transfer_id, roll_id)
    references public.roll_transfer_items(transfer_id, roll_id)
    on delete restrict
);

create index roll_transfer_reservations_transfer_idx
  on public.roll_transfer_reservations (transfer_id, roll_id);

create table public.roll_transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null
    references public.roll_transfers(id) on delete restrict,
  event_sequence integer not null check (event_sequence > 0),
  event_type text not null,
  actor_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  actor_party_id uuid
    references public.operational_parties(id) on delete restrict,
  reason text,
  occurred_at timestamptz not null default now(),

  constraint roll_transfer_events_transfer_sequence_unique
    unique (transfer_id, event_sequence),
  constraint roll_transfer_events_type_allowed
    check (event_type in ('created', 'cancelled', 'rejected', 'administrative_cancelled')),
  constraint roll_transfer_events_actor_reason_shape
    check (
      (
        event_type in ('created', 'cancelled', 'rejected')
        and actor_party_id is not null
        and reason is null
      )
      or
      (
        event_type = 'administrative_cancelled'
        and actor_party_id is null
        and reason is not null
        and char_length(btrim(reason)) between 5 and 500
      )
    )
);

comment on table public.roll_transfers is
  'Cube F Transfer header. Pending means selected Rolls are reserved but confirmed custody has not moved.';
comment on table public.roll_transfer_items is
  'Immutable physical Roll membership captured when a Transfer is created.';
comment on table public.roll_transfer_reservations is
  'Authoritative current active Transfer reservation projection. One row per reserved physical Roll.';
comment on table public.roll_transfer_events is
  'Immutable append-only audit timeline for Roll Transfer state transitions.';

-- Transfer identity and immutable membership/audit evidence are protected even
-- from accidental privileged SQL. Cube H may explicitly replace the header
-- transition guard when receipt states are introduced.
create function private.enforce_roll_transfer_header_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_HEADER_IMMUTABLE';
  end if;

  if new.transfer_number is distinct from old.transfer_number
    or new.request_id is distinct from old.request_id
    or new.sender_party_id is distinct from old.sender_party_id
    or new.recipient_party_id is distinct from old.recipient_party_id
    or new.roll_count is distinct from old.roll_count
    or new.created_by_profile_id is distinct from old.created_by_profile_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_IDENTITY_IMMUTABLE';
  end if;

  if old.status = 'pending'
    and new.status in ('cancelled', 'rejected')
    and new.closed_at is not null
  then
    return new;
  end if;

  raise exception using errcode = '23514', message = 'PG_TRANSFER_INVALID_STATE_TRANSITION';
end;
$$;

revoke all on function private.enforce_roll_transfer_header_immutability()
  from public, anon, authenticated, service_role;

create trigger roll_transfers_immutable_identity
  before update or delete on public.roll_transfers
  for each row
  execute function private.enforce_roll_transfer_header_immutability();

create function private.reject_roll_transfer_membership_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_TRANSFER_MEMBERSHIP_IMMUTABLE';
end;
$$;

revoke all on function private.reject_roll_transfer_membership_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_items_immutable
  before update or delete on public.roll_transfer_items
  for each row
  execute function private.reject_roll_transfer_membership_mutation();

create function private.reject_roll_transfer_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_TRANSFER_EVENT_IMMUTABLE';
end;
$$;

revoke all on function private.reject_roll_transfer_event_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_events_immutable
  before update or delete on public.roll_transfer_events
  for each row
  execute function private.reject_roll_transfer_event_mutation();

-- Lock the caller Profile against concurrent suspension/binding changes and
-- derive only that Profile's own acting Operational Party. Entity lifecycle is
-- locked separately so creation can also revalidate an exact recipient.
create function private.lock_transfer_actor_context()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_role text;
  v_status text;
  v_country_agent_id uuid;
  v_dealer_id uuid;
  v_center_id uuid;
  v_party_id uuid;
begin
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_UNAUTHENTICATED';
  end if;

  select
    p.role,
    p.status,
    p.country_agent_id,
    p.dealer_id,
    p.installation_center_id
  into
    v_role,
    v_status,
    v_country_agent_id,
    v_dealer_id,
    v_center_id
  from public.profiles p
  where p.id = v_profile_id
  for share;

  if not found or v_status <> 'active' then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  if v_role = 'admin' then
    select op.id into v_party_id
    from public.operational_parties op
    where op.party_type = 'company';
  elsif v_role = 'agent' then
    select op.id into v_party_id
    from public.operational_parties op
    where op.party_type = 'agent'
      and op.country_agent_id = v_country_agent_id;
  elsif v_role = 'dealer' then
    select op.id into v_party_id
    from public.operational_parties op
    where op.party_type = 'dealer'
      and op.dealer_id = v_dealer_id;
  elsif v_role = 'center' then
    select op.id into v_party_id
    from public.operational_parties op
    where op.party_type = 'center'
      and op.installation_center_id = v_center_id;
  else
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_ROLE_INVALID';
  end if;

  if v_party_id is null then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_ACTOR_PARTY_MISSING';
  end if;

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'role', v_role,
    'party_id', v_party_id
  );
end;
$$;

revoke all on function private.lock_transfer_actor_context()
  from public, anon, authenticated, service_role;

-- FOR SHARE is sufficient to serialize lifecycle status against UPDATE while
-- remaining mutually compatible across concurrent Transfer actions.
create function private.lock_transfer_party_lifecycle(p_party_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_party_type text;
  v_country_agent_id uuid;
  v_dealer_id uuid;
  v_center_id uuid;
  v_status text;
begin
  select
    op.party_type,
    op.country_agent_id,
    op.dealer_id,
    op.installation_center_id
  into
    v_party_type,
    v_country_agent_id,
    v_dealer_id,
    v_center_id
  from public.operational_parties op
  where op.id = p_party_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_PARTY_MISSING';
  end if;

  if v_party_type = 'company' then
    return true;
  elsif v_party_type = 'agent' then
    select ca.status into v_status
    from public.country_agents ca
    where ca.id = v_country_agent_id
    for share;
  elsif v_party_type = 'dealer' then
    select d.status into v_status
    from public.dealers d
    where d.id = v_dealer_id
    for share;
  elsif v_party_type = 'center' then
    select c.status into v_status
    from public.installation_centers c
    where c.id = v_center_id
    for share;
  else
    raise exception using errcode = '23514', message = 'PG_TRANSFER_PARTY_TYPE_INVALID';
  end if;

  if not found then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_PARTY_ENTITY_MISSING';
  end if;

  return v_status = 'active';
end;
$$;

revoke all on function private.lock_transfer_party_lifecycle(uuid)
  from public, anon, authenticated, service_role;

create function public.create_roll_transfer(
  p_request_id uuid,
  p_recipient_transfer_code text,
  p_roll_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_sender_party_id uuid;
  v_recipient_party_id uuid;
  v_normalized_recipient_code text;
  v_roll_count integer;
  v_existing_transfer_id uuid;
  v_existing_profile_id uuid;
  v_existing_recipient_party_id uuid;
  v_order_count integer;
  v_locked_custody_count integer;
  v_sequence bigint;
  v_transfer_number text;
  v_transfer_id uuid := gen_random_uuid();
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_REQUEST_ID_REQUIRED';
  end if;

  v_normalized_recipient_code := upper(btrim(coalesce(p_recipient_transfer_code, '')));
  if v_normalized_recipient_code !~ '^PG-[PADC]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECIPIENT_INVALID';
  end if;

  v_roll_count := cardinality(p_roll_ids);
  if p_roll_ids is null or v_roll_count is null or v_roll_count < 1 or v_roll_count > 10000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ROLL_COUNT_INVALID';
  end if;

  if exists (select 1 from unnest(p_roll_ids) as selected(roll_id) where selected.roll_id is null) then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ROLL_ID_NULL';
  end if;

  if exists (
    select selected.roll_id
    from unnest(p_roll_ids) as selected(roll_id)
    group by selected.roll_id
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ROLL_ID_DUPLICATE';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_sender_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_sender_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select op.id into v_recipient_party_id
  from public.operational_parties op
  where op.transfer_code = v_normalized_recipient_code;

  if v_recipient_party_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECIPIENT_NOT_FOUND';
  end if;

  select
    rt.id,
    rt.created_by_profile_id,
    rt.recipient_party_id
  into
    v_existing_transfer_id,
    v_existing_profile_id,
    v_existing_recipient_party_id
  from public.roll_transfers rt
  where rt.request_id = p_request_id;

  if found then
    if v_existing_profile_id <> v_actor_profile_id then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_REQUEST_ACTOR_CONFLICT';
    end if;

    if v_existing_recipient_party_id <> v_recipient_party_id
      or (select count(*) from public.roll_transfer_items i where i.transfer_id = v_existing_transfer_id) <> v_roll_count
      or exists (
        select selected.roll_id
        from unnest(p_roll_ids) as selected(roll_id)
        except
        select i.roll_id
        from public.roll_transfer_items i
        where i.transfer_id = v_existing_transfer_id
      )
      or exists (
        select i.roll_id
        from public.roll_transfer_items i
        where i.transfer_id = v_existing_transfer_id
        except
        select selected.roll_id
        from unnest(p_roll_ids) as selected(roll_id)
      )
    then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_REQUEST_PAYLOAD_CONFLICT';
    end if;

    return v_existing_transfer_id;
  end if;

  if v_recipient_party_id = v_sender_party_id then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_SENDER_RECIPIENT_SAME';
  end if;

  if not private.lock_transfer_party_lifecycle(v_recipient_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_RECIPIENT_INACTIVE';
  end if;

  if (select count(*) from public.rolls r where r.id = any(p_roll_ids)) <> v_roll_count then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ROLL_NOT_FOUND';
  end if;

  select count(distinct r.production_order_id)
    into v_order_count
  from public.rolls r
  where r.id = any(p_roll_ids);

  perform 1
  from public.production_orders po
  where po.id in (
    select distinct r.production_order_id
    from public.rolls r
    where r.id = any(p_roll_ids)
  )
  order by po.id
  for update;

  if exists (
    select 1
    from public.rolls r
    join public.production_orders po on po.id = r.production_order_id
    where r.id = any(p_roll_ids)
      and po.status <> 'generated'
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_PRODUCTION_VOIDED';
  end if;

  select count(*) into v_locked_custody_count
  from (
    select rc.roll_id
    from public.roll_custody_current rc
    where rc.roll_id = any(p_roll_ids)
    order by rc.roll_id
    for update
  ) as locked_custody;

  if v_locked_custody_count <> v_roll_count then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_CUSTODY_MISSING';
  end if;

  if exists (
    select 1
    from public.roll_custody_current rc
    where rc.roll_id = any(p_roll_ids)
      and rc.custodian_party_id <> v_sender_party_id
  ) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ROLL_NOT_HELD';
  end if;

  if exists (
    select 1
    from public.roll_transfer_reservations reservation
    where reservation.roll_id = any(p_roll_ids)
  ) then
    raise exception using errcode = '23505', message = 'PG_TRANSFER_ROLL_RESERVED';
  end if;

  v_sequence := nextval('public.roll_transfer_sequence'::regclass);
  if v_sequence > 99999999 then
    raise exception using errcode = '54000', message = 'PG_TRANSFER_SEQUENCE_EXHAUSTED';
  end if;

  v_transfer_number := format(
    'PG-T-%s-%s',
    to_char(pg_catalog.timezone('Africa/Cairo', pg_catalog.now()), 'YYYYMMDD'),
    lpad(v_sequence::text, 8, '0')
  );

  insert into public.roll_transfers (
    id,
    transfer_number,
    request_id,
    sender_party_id,
    recipient_party_id,
    status,
    roll_count,
    created_by_profile_id
  ) values (
    v_transfer_id,
    v_transfer_number,
    p_request_id,
    v_sender_party_id,
    v_recipient_party_id,
    'pending',
    v_roll_count,
    v_actor_profile_id
  );

  insert into public.roll_transfer_items (transfer_id, roll_id)
  select v_transfer_id, selected.roll_id
  from unnest(p_roll_ids) as selected(roll_id);

  begin
    insert into public.roll_transfer_reservations (roll_id, transfer_id)
    select selected.roll_id, v_transfer_id
    from unnest(p_roll_ids) as selected(roll_id);
  exception
    when unique_violation then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_ROLL_RESERVED';
  end;

  insert into public.roll_transfer_events (
    transfer_id,
    event_sequence,
    event_type,
    actor_profile_id,
    actor_party_id
  ) values (
    v_transfer_id,
    1,
    'created',
    v_actor_profile_id,
    v_sender_party_id
  );

  return v_transfer_id;
end;
$$;

revoke all on function public.create_roll_transfer(uuid, text, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_roll_transfer(uuid, text, uuid[])
  to authenticated;

create function public.cancel_roll_transfer(p_transfer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_actor_party_id uuid;
  v_sender_party_id uuid;
  v_status text;
begin
  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_actor_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  select rt.sender_party_id, rt.status
    into v_sender_party_id, v_status
  from public.roll_transfers rt
  where rt.id = p_transfer_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_NOT_FOUND';
  end if;

  if v_actor_party_id <> v_sender_party_id then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_NOT_SENDER';
  end if;

  if v_status = 'cancelled'
    and exists (
      select 1
      from public.roll_transfer_events event
      where event.transfer_id = p_transfer_id
        and event.event_type = 'cancelled'
        and event.actor_party_id = v_actor_party_id
    )
  then
    return p_transfer_id;
  end if;

  if v_status <> 'pending' then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_INVALID_STATE';
  end if;

  update public.roll_transfers
  set status = 'cancelled', closed_at = now()
  where id = p_transfer_id;

  delete from public.roll_transfer_reservations
  where transfer_id = p_transfer_id;

  insert into public.roll_transfer_events (
    transfer_id,
    event_sequence,
    event_type,
    actor_profile_id,
    actor_party_id
  ) values (
    p_transfer_id,
    2,
    'cancelled',
    v_actor_profile_id,
    v_actor_party_id
  );

  return p_transfer_id;
end;
$$;

revoke all on function public.cancel_roll_transfer(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_roll_transfer(uuid)
  to authenticated;

create function public.reject_roll_transfer(p_transfer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_actor_party_id uuid;
  v_recipient_party_id uuid;
  v_status text;
begin
  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_actor_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  select rt.recipient_party_id, rt.status
    into v_recipient_party_id, v_status
  from public.roll_transfers rt
  where rt.id = p_transfer_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_NOT_FOUND';
  end if;

  if v_actor_party_id <> v_recipient_party_id then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_NOT_RECIPIENT';
  end if;

  if v_status = 'rejected'
    and exists (
      select 1
      from public.roll_transfer_events event
      where event.transfer_id = p_transfer_id
        and event.event_type = 'rejected'
        and event.actor_party_id = v_actor_party_id
    )
  then
    return p_transfer_id;
  end if;

  if v_status <> 'pending' then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_INVALID_STATE';
  end if;

  update public.roll_transfers
  set status = 'rejected', closed_at = now()
  where id = p_transfer_id;

  delete from public.roll_transfer_reservations
  where transfer_id = p_transfer_id;

  insert into public.roll_transfer_events (
    transfer_id,
    event_sequence,
    event_type,
    actor_profile_id,
    actor_party_id
  ) values (
    p_transfer_id,
    2,
    'rejected',
    v_actor_profile_id,
    v_actor_party_id
  );

  return p_transfer_id;
end;
$$;

revoke all on function public.reject_roll_transfer(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reject_roll_transfer(uuid)
  to authenticated;

create function public.admin_cancel_pending_roll_transfer(
  p_transfer_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_admin_profile_id uuid;
  v_sender_party_id uuid;
  v_recipient_party_id uuid;
  v_status text;
  v_reason text;
  v_party_id uuid;
  v_party_active boolean;
  v_any_inactive boolean := false;
begin
  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ADMIN_REASON_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  if v_actor ->> 'role' <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ADMIN_REQUIRED';
  end if;
  v_admin_profile_id := (v_actor ->> 'profile_id')::uuid;

  select rt.sender_party_id, rt.recipient_party_id, rt.status
    into v_sender_party_id, v_recipient_party_id, v_status
  from public.roll_transfers rt
  where rt.id = p_transfer_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_NOT_FOUND';
  end if;

  if v_status <> 'pending' then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_INVALID_STATE';
  end if;

  for v_party_id in
    select party_id
    from unnest(array[v_sender_party_id, v_recipient_party_id]) as parties(party_id)
    order by party_id
  loop
    select op.party_type = 'company'
      into v_party_active
    from public.operational_parties op
    where op.id = v_party_id;

    if v_party_active then
      continue;
    end if;

    v_party_active := private.lock_transfer_party_lifecycle(v_party_id);
    if not v_party_active then
      v_any_inactive := true;
    end if;
  end loop;

  if not v_any_inactive then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_ADMIN_RECOVERY_NOT_ALLOWED';
  end if;

  update public.roll_transfers
  set status = 'cancelled', closed_at = now()
  where id = p_transfer_id;

  delete from public.roll_transfer_reservations
  where transfer_id = p_transfer_id;

  insert into public.roll_transfer_events (
    transfer_id,
    event_sequence,
    event_type,
    actor_profile_id,
    actor_party_id,
    reason
  ) values (
    p_transfer_id,
    2,
    'administrative_cancelled',
    v_admin_profile_id,
    null,
    v_reason
  );

  return p_transfer_id;
end;
$$;

revoke all on function public.admin_cancel_pending_roll_transfer(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_cancel_pending_roll_transfer(uuid, text)
  to authenticated;

-- A generated Production Order cannot become void while any of its Rolls is
-- actively reserved. Because Transfer creation locks affected order rows before
-- inserting reservations, this trigger closes the create-vs-void race.
create function private.prevent_void_with_transfer_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'generated'
    and new.status = 'voided'
    and exists (
      select 1
      from public.rolls r
      join public.roll_transfer_reservations reservation
        on reservation.roll_id = r.id
      where r.production_order_id = old.id
    )
  then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_PRODUCTION_VOID_RESERVED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_void_with_transfer_reservation()
  from public, anon, authenticated, service_role;

create trigger production_orders_transfer_reservation_void_guard
  before update of status on public.production_orders
  for each row
  execute function private.prevent_void_with_transfer_reservation();

-- Read access is deliberately narrower than the existing hierarchy browsing
-- model: only the business sender/recipient and active Admin can read a Transfer.
create function private.can_read_roll_transfer(p_transfer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.roll_transfers rt
    where rt.id = p_transfer_id
      and (
        private.is_active_admin()
        or rt.sender_party_id = private.current_active_operational_party_id()
        or rt.recipient_party_id = private.current_active_operational_party_id()
      )
  )
$$;

revoke all on function private.can_read_roll_transfer(uuid)
  from public, anon, service_role;
grant execute on function private.can_read_roll_transfer(uuid)
  to authenticated;

alter table public.roll_transfers enable row level security;
alter table public.roll_transfer_items enable row level security;
alter table public.roll_transfer_reservations enable row level security;
alter table public.roll_transfer_events enable row level security;

revoke all on table public.roll_transfers
  from public, anon, authenticated, service_role;
revoke all on table public.roll_transfer_items
  from public, anon, authenticated, service_role;
revoke all on table public.roll_transfer_reservations
  from public, anon, authenticated, service_role;
revoke all on table public.roll_transfer_events
  from public, anon, authenticated, service_role;

grant select on table public.roll_transfers to authenticated;
grant select on table public.roll_transfer_items to authenticated;
grant select on table public.roll_transfer_events to authenticated;

create policy "roll_transfers_read_participant_scope"
on public.roll_transfers
for select
to authenticated
using (
  (select private.is_active_admin())
  or sender_party_id = (select private.current_active_operational_party_id())
  or recipient_party_id = (select private.current_active_operational_party_id())
);

create policy "roll_transfer_items_read_participant_scope"
on public.roll_transfer_items
for select
to authenticated
using ((select private.can_read_roll_transfer(transfer_id)));

create policy "roll_transfer_events_read_participant_scope"
on public.roll_transfer_events
for select
to authenticated
using ((select private.can_read_roll_transfer(transfer_id)));
