-- Agent & Network Foundation — increment 1
-- Introduce Country Agents and make Dealer/Center parent-country relationships explicit.

create table public.country_agents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_code text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),

  constraint country_agents_code_format
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  constraint country_agents_name_length
    check (char_length(btrim(name)) between 2 and 160),
  constraint country_agents_country_code_format
    check (country_code ~ '^[A-Z]{2}$'),
  constraint country_agents_status_allowed
    check (status in ('active', 'suspended')),
  constraint country_agents_id_country_unique
    unique (id, country_code)
);

alter table public.country_agents enable row level security;

revoke all on table public.country_agents from public;
revoke all on table public.country_agents from anon;
revoke all on table public.country_agents from authenticated;
revoke all on table public.country_agents from service_role;

alter table public.dealers
  add column country_agent_id uuid;

-- A Dealer's country is the Agent country's value. A composite FK makes that
-- invariant database-enforced without hidden country rewrites.
alter table public.dealers
  add constraint dealers_country_agent_country_fkey
  foreign key (country_agent_id, country_code)
  references public.country_agents (id, country_code)
  on update restrict
  on delete restrict;

-- Required for Center -> Dealer parent-country integrity below.
alter table public.dealers
  add constraint dealers_id_country_unique
  unique (id, country_code);

-- Existing non-disposable Dealer rows must be explicitly mapped to a real
-- Agent before this migration can become strict. Disposable local/test data
-- should be reset instead of receiving a fabricated placeholder Agent.
do $$
begin
  if exists (
    select 1
    from public.dealers
    where country_agent_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing dealers must be explicitly mapped to real country agents before applying the Agent hierarchy foundation. Reset disposable local/test data instead of creating placeholder agents.';
  end if;
end;
$$;

alter table public.dealers
  alter column country_agent_id set not null;

create index dealers_country_agent_id_idx
  on public.dealers (country_agent_id);

alter table public.installation_centers
  add column country_agent_id uuid;

alter table public.installation_centers
  add constraint installation_centers_single_parent
  check (not (dealer_id is not null and country_agent_id is not null));

-- Replace the weaker Dealer-only FK with a country-consistent parent FK.
alter table public.installation_centers
  drop constraint installation_centers_dealer_id_fkey;

alter table public.installation_centers
  add constraint installation_centers_dealer_country_fkey
  foreign key (dealer_id, country_code)
  references public.dealers (id, country_code)
  on update restrict
  on delete restrict;

alter table public.installation_centers
  add constraint installation_centers_agent_country_fkey
  foreign key (country_agent_id, country_code)
  references public.country_agents (id, country_code)
  on update restrict
  on delete restrict;

create index installation_centers_country_agent_id_idx
  on public.installation_centers (country_agent_id)
  where country_agent_id is not null;
