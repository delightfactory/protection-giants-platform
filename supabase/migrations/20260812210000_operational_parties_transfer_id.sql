-- Agent & Network Foundation — increment 4
-- Add the thin operational-party registry and stable private Transfer ID resolver.

create table public.operational_parties (
  id uuid primary key default gen_random_uuid(),
  party_type text not null,
  country_agent_id uuid references public.country_agents(id) on delete restrict,
  dealer_id uuid references public.dealers(id) on delete restrict,
  installation_center_id uuid references public.installation_centers(id) on delete restrict,
  transfer_code text not null unique,
  created_at timestamptz not null default now(),

  constraint operational_parties_party_type_allowed
    check (party_type in ('company', 'agent', 'dealer', 'center')),
  constraint operational_parties_exact_binding
    check (
      (party_type = 'company' and country_agent_id is null and dealer_id is null and installation_center_id is null)
      or (party_type = 'agent' and country_agent_id is not null and dealer_id is null and installation_center_id is null)
      or (party_type = 'dealer' and country_agent_id is null and dealer_id is not null and installation_center_id is null)
      or (party_type = 'center' and country_agent_id is null and dealer_id is null and installation_center_id is not null)
    ),
  constraint operational_parties_transfer_code_format
    check (transfer_code ~ '^PG-[PADC]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  constraint operational_parties_country_agent_unique unique (country_agent_id),
  constraint operational_parties_dealer_unique unique (dealer_id),
  constraint operational_parties_center_unique unique (installation_center_id)
);

create unique index operational_parties_single_company_idx
  on public.operational_parties (party_type)
  where party_type = 'company';

create index operational_parties_party_type_idx
  on public.operational_parties (party_type);

alter table public.operational_parties enable row level security;

revoke all on table public.operational_parties from public;
revoke all on table public.operational_parties from anon;
revoke all on table public.operational_parties from authenticated;
revoke all on table public.operational_parties from service_role;

create or replace function public.generate_operational_transfer_code(p_party_type text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  payload text := '';
  prefix text;
  i integer;
begin
  prefix := case p_party_type
    when 'company' then 'P'
    when 'agent' then 'A'
    when 'dealer' then 'D'
    when 'center' then 'C'
    else null
  end;

  if prefix is null then
    raise exception using
      errcode = '22023',
      message = 'invalid operational party type';
  end if;

  random_bytes := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());

  for i in 0..11 loop
    payload := payload || substr(alphabet, (get_byte(random_bytes, i) % 32) + 1, 1);
  end loop;

  return format(
    'PG-%s-%s-%s-%s',
    prefix,
    substr(payload, 1, 4),
    substr(payload, 5, 4),
    substr(payload, 9, 4)
  );
end;
$$;

revoke all on function public.generate_operational_transfer_code(text) from public;
revoke all on function public.generate_operational_transfer_code(text) from anon;
revoke all on function public.generate_operational_transfer_code(text) from authenticated;
revoke all on function public.generate_operational_transfer_code(text) from service_role;

create or replace function public.ensure_operational_party(
  p_party_type text,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing_party_id uuid;
  created_party_id uuid;
  candidate_code text;
  attempt integer;
begin
  if p_party_type = 'company' then
    if p_entity_id is not null then
      raise exception using errcode = '22023', message = 'company party cannot have an entity id';
    end if;

    select op.id
      into existing_party_id
    from public.operational_parties op
    where op.party_type = 'company';
  elsif p_party_type = 'agent' then
    select op.id
      into existing_party_id
    from public.operational_parties op
    where op.country_agent_id = p_entity_id;
  elsif p_party_type = 'dealer' then
    select op.id
      into existing_party_id
    from public.operational_parties op
    where op.dealer_id = p_entity_id;
  elsif p_party_type = 'center' then
    select op.id
      into existing_party_id
    from public.operational_parties op
    where op.installation_center_id = p_entity_id;
  else
    raise exception using errcode = '22023', message = 'invalid operational party type';
  end if;

  if existing_party_id is not null then
    return existing_party_id;
  end if;

  if p_party_type <> 'company' and p_entity_id is null then
    raise exception using errcode = '22023', message = 'operational entity id is required';
  end if;

  for attempt in 1..8 loop
    candidate_code := public.generate_operational_transfer_code(p_party_type);

    begin
      if p_party_type = 'company' then
        insert into public.operational_parties (party_type, transfer_code)
        values ('company', candidate_code)
        returning id into created_party_id;
      elsif p_party_type = 'agent' then
        insert into public.operational_parties (party_type, country_agent_id, transfer_code)
        values ('agent', p_entity_id, candidate_code)
        returning id into created_party_id;
      elsif p_party_type = 'dealer' then
        insert into public.operational_parties (party_type, dealer_id, transfer_code)
        values ('dealer', p_entity_id, candidate_code)
        returning id into created_party_id;
      else
        insert into public.operational_parties (party_type, installation_center_id, transfer_code)
        values ('center', p_entity_id, candidate_code)
        returning id into created_party_id;
      end if;

      return created_party_id;
    exception
      when unique_violation then
        if p_party_type = 'company' then
          select op.id into existing_party_id
          from public.operational_parties op
          where op.party_type = 'company';
        elsif p_party_type = 'agent' then
          select op.id into existing_party_id
          from public.operational_parties op
          where op.country_agent_id = p_entity_id;
        elsif p_party_type = 'dealer' then
          select op.id into existing_party_id
          from public.operational_parties op
          where op.dealer_id = p_entity_id;
        else
          select op.id into existing_party_id
          from public.operational_parties op
          where op.installation_center_id = p_entity_id;
        end if;

        if existing_party_id is not null then
          return existing_party_id;
        end if;
        -- Otherwise the collision was the generated Transfer ID; retry.
    end;
  end loop;

  raise exception using
    errcode = '23505',
    message = 'could not allocate a unique operational Transfer ID';
end;
$$;

revoke all on function public.ensure_operational_party(text, uuid) from public;
revoke all on function public.ensure_operational_party(text, uuid) from anon;
revoke all on function public.ensure_operational_party(text, uuid) from authenticated;
revoke all on function public.ensure_operational_party(text, uuid) from service_role;

create or replace function public.create_operational_party_after_entity_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_operational_party(tg_argv[0], new.id);
  return new;
end;
$$;

revoke all on function public.create_operational_party_after_entity_insert() from public;
revoke all on function public.create_operational_party_after_entity_insert() from anon;
revoke all on function public.create_operational_party_after_entity_insert() from authenticated;
revoke all on function public.create_operational_party_after_entity_insert() from service_role;

-- Establish the Company identity and backfill every existing operational entity.
do $$
declare
  entity_row record;
begin
  perform public.ensure_operational_party('company', null);

  for entity_row in select id from public.country_agents loop
    perform public.ensure_operational_party('agent', entity_row.id);
  end loop;

  for entity_row in select id from public.dealers loop
    perform public.ensure_operational_party('dealer', entity_row.id);
  end loop;

  for entity_row in select id from public.installation_centers loop
    perform public.ensure_operational_party('center', entity_row.id);
  end loop;
end;
$$;

create trigger country_agents_operational_party_after_insert
after insert on public.country_agents
for each row execute function public.create_operational_party_after_entity_insert('agent');

create trigger dealers_operational_party_after_insert
after insert on public.dealers
for each row execute function public.create_operational_party_after_entity_insert('dealer');

create trigger installation_centers_operational_party_after_insert
after insert on public.installation_centers
for each row execute function public.create_operational_party_after_entity_insert('center');

create or replace function public.reject_operational_party_identity_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.party_type is distinct from old.party_type
    or new.country_agent_id is distinct from old.country_agent_id
    or new.dealer_id is distinct from old.dealer_id
    or new.installation_center_id is distinct from old.installation_center_id
    or new.transfer_code is distinct from old.transfer_code
  then
    raise exception using
      errcode = '23514',
      message = 'operational party identity and Transfer ID are immutable';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_operational_party_identity_update() from public;
revoke all on function public.reject_operational_party_identity_update() from anon;
revoke all on function public.reject_operational_party_identity_update() from authenticated;
revoke all on function public.reject_operational_party_identity_update() from service_role;

create trigger operational_parties_identity_immutable
before update on public.operational_parties
for each row execute function public.reject_operational_party_identity_update();

grant select on table public.operational_parties to authenticated;

create policy "operational_parties_read_network_scope"
on public.operational_parties
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        p.role = 'admin'
        or operational_parties.party_type = 'company'
        or (
          p.role = 'agent'
          and exists (
            select 1 from public.country_agents ca
            where ca.id = p.country_agent_id and ca.status = 'active'
          )
          and (
            operational_parties.country_agent_id = p.country_agent_id
            or operational_parties.dealer_id in (
              select d.id from public.dealers d
              where d.country_agent_id = p.country_agent_id
            )
            or operational_parties.installation_center_id in (
              select c.id
              from public.installation_centers c
              left join public.dealers d on d.id = c.dealer_id
              where c.country_agent_id = p.country_agent_id
                 or d.country_agent_id = p.country_agent_id
            )
          )
        )
        or (
          p.role = 'dealer'
          and exists (
            select 1 from public.dealers d
            where d.id = p.dealer_id and d.status = 'active'
          )
          and (
            operational_parties.dealer_id = p.dealer_id
            or operational_parties.installation_center_id in (
              select c.id from public.installation_centers c
              where c.dealer_id = p.dealer_id
            )
          )
        )
        or (
          p.role = 'center'
          and operational_parties.installation_center_id = p.installation_center_id
          and exists (
            select 1 from public.installation_centers c
            where c.id = p.installation_center_id and c.status = 'active'
          )
        )
      )
  )
);

create or replace function public.resolve_transfer_recipient(p_transfer_code text)
returns table (
  party_id uuid,
  entity_type text,
  display_name text,
  country_code text,
  city text,
  entity_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_country_agent_id uuid;
  caller_dealer_id uuid;
  caller_center_id uuid;
  normalized_code text;
  caller_operationally_active boolean := false;
begin
  if caller_id is null then
    return;
  end if;

  normalized_code := upper(btrim(coalesce(p_transfer_code, '')));

  if normalized_code !~ '^PG-[PADC]-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then
    return;
  end if;

  select p.role, p.country_agent_id, p.dealer_id, p.installation_center_id
    into caller_role, caller_country_agent_id, caller_dealer_id, caller_center_id
  from public.profiles p
  where p.id = caller_id
    and p.status = 'active';

  if not found then
    return;
  end if;

  if caller_role = 'admin' then
    caller_operationally_active := true;
  elsif caller_role = 'agent' then
    select exists (
      select 1 from public.country_agents ca
      where ca.id = caller_country_agent_id and ca.status = 'active'
    ) into caller_operationally_active;
  elsif caller_role = 'dealer' then
    select exists (
      select 1 from public.dealers d
      where d.id = caller_dealer_id and d.status = 'active'
    ) into caller_operationally_active;
  elsif caller_role = 'center' then
    select exists (
      select 1 from public.installation_centers c
      where c.id = caller_center_id and c.status = 'active'
    ) into caller_operationally_active;
  end if;

  if not caller_operationally_active then
    return;
  end if;

  return query
  select
    op.id,
    op.party_type,
    case
      when op.party_type = 'company' then 'Protection Giants'
      when op.party_type = 'agent' then ca.name
      when op.party_type = 'dealer' then d.name
      when op.party_type = 'center' then c.name
    end as display_name,
    case
      when op.party_type = 'agent' then ca.country_code
      when op.party_type = 'dealer' then d.country_code
      when op.party_type = 'center' then c.country_code
      else null
    end as country_code,
    case when op.party_type = 'center' then c.city else null end as city,
    case
      when op.party_type = 'company' then 'PG'
      when op.party_type = 'agent' then ca.code
      when op.party_type = 'dealer' then d.code
      when op.party_type = 'center' then c.code
    end as entity_code
  from public.operational_parties op
  left join public.country_agents ca on ca.id = op.country_agent_id
  left join public.dealers d on d.id = op.dealer_id
  left join public.installation_centers c on c.id = op.installation_center_id
  where op.transfer_code = normalized_code
    and (
      op.party_type = 'company'
      or (op.party_type = 'agent' and ca.status = 'active')
      or (op.party_type = 'dealer' and d.status = 'active')
      or (op.party_type = 'center' and c.status = 'active')
    )
  limit 1;
end;
$$;

revoke all on function public.resolve_transfer_recipient(text) from public;
revoke all on function public.resolve_transfer_recipient(text) from anon;
revoke all on function public.resolve_transfer_recipient(text) from service_role;
grant execute on function public.resolve_transfer_recipient(text) to authenticated;
