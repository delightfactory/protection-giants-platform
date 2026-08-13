-- Center Location Foundation (Cube A)
-- Current projection + immutable audit + tightly-scoped Center/Admin mutation RPCs.

alter table public.installation_centers
  add column latitude double precision,
  add column longitude double precision,
  add column location_accuracy_m double precision,
  add column location_captured_at timestamptz,
  add column location_source text,
  add column location_updated_by_profile_id uuid
    references public.profiles(id) on delete restrict;

alter table public.installation_centers
  add constraint installation_centers_location_coordinates_consistent
  check (
    (latitude is null and longitude is null)
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90::double precision and 90::double precision
      and longitude between -180::double precision and 180::double precision
    )
  ),
  add constraint installation_centers_location_projection_consistent
  check (
    (
      latitude is null
      and longitude is null
      and location_accuracy_m is null
      and location_captured_at is null
      and location_source is null
      and location_updated_by_profile_id is null
    )
    or (
      latitude is not null
      and longitude is not null
      and location_captured_at is not null
      and location_source in ('center_device', 'admin')
      and location_updated_by_profile_id is not null
      and (
        location_accuracy_m is null
        or (
          location_accuracy_m > 0::double precision
          and location_accuracy_m < 'Infinity'::double precision
        )
      )
      and (
        location_source <> 'center_device'
        or (
          location_accuracy_m is not null
          and location_accuracy_m <= 50::double precision
        )
      )
      and (
        location_source <> 'admin'
        or location_accuracy_m is null
      )
    )
  );

-- Existing Center creation paths intentionally retain their current network-scoped
-- INSERT policies. Every new Center must, however, start without a geographic
-- projection so that the first location is always created by one of the audited
-- RPCs below rather than being smuggled through the entity INSERT.
create or replace function public.reject_center_location_on_entity_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.latitude is not null
    or new.longitude is not null
    or new.location_accuracy_m is not null
    or new.location_captured_at is not null
    or new.location_source is not null
    or new.location_updated_by_profile_id is not null
  then
    raise exception using
      errcode = '23514',
      message = 'Center location must be captured or corrected after Center creation';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_center_location_on_entity_insert() from public;
revoke all on function public.reject_center_location_on_entity_insert() from anon;
revoke all on function public.reject_center_location_on_entity_insert() from authenticated;
revoke all on function public.reject_center_location_on_entity_insert() from service_role;

create trigger installation_centers_initial_location_empty
before insert on public.installation_centers
for each row execute function public.reject_center_location_on_entity_insert();

create table public.center_location_events (
  id uuid primary key default gen_random_uuid(),
  installation_center_id uuid not null
    references public.installation_centers(id) on delete restrict,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  source text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),

  constraint center_location_events_latitude_valid
    check (latitude between -90::double precision and 90::double precision),
  constraint center_location_events_longitude_valid
    check (longitude between -180::double precision and 180::double precision),
  constraint center_location_events_accuracy_valid
    check (
      accuracy_m is null
      or (
        accuracy_m > 0::double precision
        and accuracy_m < 'Infinity'::double precision
      )
    ),
  constraint center_location_events_source_allowed
    check (source in ('center_device', 'admin')),
  constraint center_location_events_source_accuracy_consistent
    check (
      (source = 'center_device' and accuracy_m is not null and accuracy_m <= 50::double precision)
      or (source = 'admin' and accuracy_m is null)
    )
);

create index center_location_events_center_captured_idx
  on public.center_location_events (installation_center_id, captured_at desc, id desc);

alter table public.center_location_events enable row level security;

revoke all on table public.center_location_events from public;
revoke all on table public.center_location_events from anon;
revoke all on table public.center_location_events from authenticated;
revoke all on table public.center_location_events from service_role;

grant select on table public.center_location_events to authenticated;

create policy "center_location_events_admin_read"
on public.center_location_events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role = 'admin'
  )
);

create or replace function public.reject_center_location_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'center location events are immutable';
end;
$$;

revoke all on function public.reject_center_location_event_mutation() from public;
revoke all on function public.reject_center_location_event_mutation() from anon;
revoke all on function public.reject_center_location_event_mutation() from authenticated;
revoke all on function public.reject_center_location_event_mutation() from service_role;

create trigger center_location_events_immutable
before update or delete on public.center_location_events
for each row execute function public.reject_center_location_event_mutation();

create or replace function public.update_own_center_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns table (
  installation_center_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  source text,
  captured_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_center_id uuid;
  event_captured_at timestamptz := clock_timestamp();
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_latitude is null
    or p_latitude < -90::double precision
    or p_latitude > 90::double precision
  then
    raise exception using errcode = '22023', message = 'latitude must be between -90 and 90';
  end if;

  if p_longitude is null
    or p_longitude < -180::double precision
    or p_longitude > 180::double precision
  then
    raise exception using errcode = '22023', message = 'longitude must be between -180 and 180';
  end if;

  if p_accuracy_m is null
    or p_accuracy_m <= 0::double precision
    or p_accuracy_m > 50::double precision
    or p_accuracy_m >= 'Infinity'::double precision
  then
    raise exception using
      errcode = '22023',
      message = 'center location accuracy must be greater than 0 and no worse than 50 metres';
  end if;

  select p.installation_center_id
    into caller_center_id
  from public.profiles p
  where p.id = caller_id
    and p.status = 'active'
    and p.role = 'center'
    and p.installation_center_id is not null;

  if caller_center_id is null then
    raise exception using errcode = '42501', message = 'active Center profile required';
  end if;

  perform 1
  from public.installation_centers c
  where c.id = caller_center_id
    and c.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'active Center required';
  end if;

  update public.installation_centers c
  set latitude = p_latitude,
      longitude = p_longitude,
      location_accuracy_m = p_accuracy_m,
      location_captured_at = event_captured_at,
      location_source = 'center_device',
      location_updated_by_profile_id = caller_id
  where c.id = caller_center_id;

  insert into public.center_location_events (
    installation_center_id,
    latitude,
    longitude,
    accuracy_m,
    source,
    actor_profile_id,
    captured_at
  )
  values (
    caller_center_id,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    'center_device',
    caller_id,
    event_captured_at
  );

  return query
  select
    caller_center_id,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    'center_device'::text,
    event_captured_at;
end;
$$;

revoke all on function public.update_own_center_location(double precision, double precision, double precision) from public;
revoke all on function public.update_own_center_location(double precision, double precision, double precision) from anon;
revoke all on function public.update_own_center_location(double precision, double precision, double precision) from service_role;
grant execute on function public.update_own_center_location(double precision, double precision, double precision) to authenticated;

create or replace function public.admin_update_center_location(
  p_center_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  installation_center_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  source text,
  captured_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  event_captured_at timestamptz := clock_timestamp();
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = caller_id
      and p.status = 'active'
      and p.role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'active Admin profile required';
  end if;

  if p_center_id is null then
    raise exception using errcode = '22023', message = 'Center id is required';
  end if;

  if p_latitude is null
    or p_latitude < -90::double precision
    or p_latitude > 90::double precision
  then
    raise exception using errcode = '22023', message = 'latitude must be between -90 and 90';
  end if;

  if p_longitude is null
    or p_longitude < -180::double precision
    or p_longitude > 180::double precision
  then
    raise exception using errcode = '22023', message = 'longitude must be between -180 and 180';
  end if;

  perform 1
  from public.installation_centers c
  where c.id = p_center_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Center not found';
  end if;

  update public.installation_centers c
  set latitude = p_latitude,
      longitude = p_longitude,
      location_accuracy_m = null,
      location_captured_at = event_captured_at,
      location_source = 'admin',
      location_updated_by_profile_id = caller_id
  where c.id = p_center_id;

  insert into public.center_location_events (
    installation_center_id,
    latitude,
    longitude,
    accuracy_m,
    source,
    actor_profile_id,
    captured_at
  )
  values (
    p_center_id,
    p_latitude,
    p_longitude,
    null,
    'admin',
    caller_id,
    event_captured_at
  );

  return query
  select
    p_center_id,
    p_latitude,
    p_longitude,
    null::double precision,
    'admin'::text,
    event_captured_at;
end;
$$;

revoke all on function public.admin_update_center_location(uuid, double precision, double precision) from public;
revoke all on function public.admin_update_center_location(uuid, double precision, double precision) from anon;
revoke all on function public.admin_update_center_location(uuid, double precision, double precision) from service_role;
grant execute on function public.admin_update_center_location(uuid, double precision, double precision) to authenticated;
