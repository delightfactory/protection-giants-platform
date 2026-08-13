-- Cube D — Roll Custody Foundation
-- Keep confirmed Roll custody separate from Production creation and future Transfer state.

create table public.roll_custody_current (
  roll_id uuid primary key
    references public.rolls(id) on delete restrict,
  custodian_party_id uuid not null
    references public.operational_parties(id) on delete restrict,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index roll_custody_current_custodian_idx
  on public.roll_custody_current (custodian_party_id, roll_id);

create table public.roll_custody_events (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null
    references public.rolls(id) on delete restrict,
  custody_sequence integer not null
    check (custody_sequence > 0),
  custodian_party_id uuid not null
    references public.operational_parties(id) on delete restrict,
  confirmed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint roll_custody_events_roll_sequence_unique
    unique (roll_id, custody_sequence)
);

create index roll_custody_events_roll_timeline_idx
  on public.roll_custody_events (roll_id, custody_sequence desc);

create index roll_custody_events_custodian_idx
  on public.roll_custody_events (custodian_party_id, roll_id);

comment on table public.roll_custody_current is
  'Authoritative one-row-per-Roll projection of confirmed physical custody. Pending Transfers do not change this table.';
comment on table public.roll_custody_events is
  'Immutable append-only history of confirmed Roll custodians. Cube D creates only the initial Company event; later receipt flows may append confirmed custody events.';
comment on column public.roll_custody_current.custodian_party_id is
  'Operational Party holding confirmed custody. Never an Auth user/profile id.';
comment on column public.roll_custody_events.custody_sequence is
  'Monotonic confirmed-custody sequence inside one Roll. Sequence 1 is the initial Company custody event.';

-- Existing Rolls are historical physical identities and all begin at Protection Giants.
-- Fail closed if the Network foundation is not in the expected singleton-Company state.
do $$
declare
  v_company_party_id uuid;
  v_company_count integer;
begin
  select count(*), min(id)
    into v_company_count, v_company_party_id
  from public.operational_parties
  where party_type = 'company';

  if v_company_count <> 1 or v_company_party_id is null then
    raise exception 'Roll custody requires exactly one Company operational party.' using errcode = '23514';
  end if;

  insert into public.roll_custody_current (
    roll_id,
    custodian_party_id,
    confirmed_at
  )
  select
    r.id,
    v_company_party_id,
    r.created_at
  from public.rolls r;

  insert into public.roll_custody_events (
    roll_id,
    custody_sequence,
    custodian_party_id,
    confirmed_at
  )
  select
    r.id,
    1,
    v_company_party_id,
    r.created_at
  from public.rolls r;
end;
$$;

-- Future Rolls acquire Company custody through a narrow database-owned path.
-- Production RPC stays closed and unchanged.
create function private.initialize_roll_company_custody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_party_id uuid;
begin
  select op.id
    into v_company_party_id
  from public.operational_parties op
  where op.party_type = 'company';

  if v_company_party_id is null then
    raise exception 'Company operational party is missing; Roll custody cannot be initialized.' using errcode = '23514';
  end if;

  insert into public.roll_custody_current (
    roll_id,
    custodian_party_id,
    confirmed_at
  ) values (
    new.id,
    v_company_party_id,
    new.created_at
  );

  insert into public.roll_custody_events (
    roll_id,
    custody_sequence,
    custodian_party_id,
    confirmed_at
  ) values (
    new.id,
    1,
    v_company_party_id,
    new.created_at
  );

  return new;
end;
$$;

revoke all on function private.initialize_roll_company_custody()
  from public, anon, authenticated, service_role;

create trigger rolls_initialize_company_custody
  after insert on public.rolls
  for each row
  execute function private.initialize_roll_company_custody();

-- Custody history is audit evidence: clients, service-role Data API paths and
-- accidental SQL updates must not rewrite or delete an event once recorded.
create function private.reject_roll_custody_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Confirmed Roll custody history is immutable.' using errcode = '42501';
end;
$$;

revoke all on function private.reject_roll_custody_event_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_custody_events_immutable
  before update or delete on public.roll_custody_events
  for each row
  execute function private.reject_roll_custody_event_mutation();

-- Determine only the caller's own active Operational Party. This helper is
-- deliberately private so it cannot become a browse/search API for parties.
create function private.current_active_operational_party_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select op.id
  from public.profiles p
  join public.operational_parties op
    on (
      (p.role = 'agent' and op.party_type = 'agent' and op.country_agent_id = p.country_agent_id)
      or (p.role = 'dealer' and op.party_type = 'dealer' and op.dealer_id = p.dealer_id)
      or (p.role = 'center' and op.party_type = 'center' and op.installation_center_id = p.installation_center_id)
    )
  where p.id = (select auth.uid())
    and p.status = 'active'
    and (
      (p.role = 'agent' and exists (
        select 1 from public.country_agents ca
        where ca.id = p.country_agent_id and ca.status = 'active'
      ))
      or (p.role = 'dealer' and exists (
        select 1 from public.dealers d
        where d.id = p.dealer_id and d.status = 'active'
      ))
      or (p.role = 'center' and exists (
        select 1 from public.installation_centers c
        where c.id = p.installation_center_id and c.status = 'active'
      ))
    )
  limit 1
$$;

revoke all on function private.current_active_operational_party_id()
  from public, anon, authenticated, service_role;

alter table public.roll_custody_current enable row level security;
alter table public.roll_custody_events enable row level security;

revoke all on table public.roll_custody_current
  from public, anon, authenticated, service_role;
revoke all on table public.roll_custody_events
  from public, anon, authenticated, service_role;

grant select on table public.roll_custody_current to authenticated;
grant select on table public.roll_custody_events to authenticated;

create policy "roll_custody_current_admin_read"
on public.roll_custody_current
for select
to authenticated
using ((select private.is_active_admin()));

create policy "roll_custody_current_holder_read"
on public.roll_custody_current
for select
to authenticated
using (
  custodian_party_id = (select private.current_active_operational_party_id())
  and exists (
    select 1
    from public.rolls r
    join public.production_orders po on po.id = r.production_order_id
    where r.id = roll_custody_current.roll_id
      and po.status = 'generated'
  )
);

-- Historical custody is an administrative audit surface in this foundation.
-- Ordinary parties see only their authoritative current projection; transfer
-- timeline visibility belongs to the later Transfer cubes.
create policy "roll_custody_events_admin_read"
on public.roll_custody_events
for select
to authenticated
using ((select private.is_active_admin()));

-- Extend Roll read visibility without opening Production Orders/Lots.
-- Admin keeps historical/audit access including voided orders. An ordinary
-- operational user sees only eligible Rolls currently confirmed in its custody.
drop policy if exists "rolls_admin_read" on public.rolls;

create policy "rolls_admin_read"
on public.rolls
for select
to authenticated
using ((select private.is_active_admin()));

create policy "rolls_current_holder_read"
on public.rolls
for select
to authenticated
using (
  exists (
    select 1
    from public.roll_custody_current rc
    join public.production_orders po on po.id = rolls.production_order_id
    where rc.roll_id = rolls.id
      and rc.custodian_party_id = (select private.current_active_operational_party_id())
      and po.status = 'generated'
  )
);
