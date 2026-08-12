-- Agent & Network Foundation — increment 2
-- Extend Profiles/Auth provisioning with the explicit Agent role and binding.

alter table public.profiles
  add column country_agent_id uuid references public.country_agents(id) on delete restrict;

alter table public.profiles
  drop constraint profiles_role_allowed;

alter table public.profiles
  add constraint profiles_role_allowed
  check (role in ('admin', 'agent', 'dealer', 'center'));

alter table public.profiles
  drop constraint profiles_operational_entity_binding;

alter table public.profiles
  add constraint profiles_operational_entity_binding
  check (
    (
      role = 'admin'
      and country_agent_id is null
      and dealer_id is null
      and installation_center_id is null
    )
    or
    (
      role = 'agent'
      and country_agent_id is not null
      and dealer_id is null
      and installation_center_id is null
    )
    or
    (
      role = 'dealer'
      and country_agent_id is null
      and dealer_id is not null
      and installation_center_id is null
    )
    or
    (
      role = 'center'
      and country_agent_id is null
      and dealer_id is null
      and installation_center_id is not null
    )
  );

create index profiles_country_agent_id_idx
  on public.profiles (country_agent_id)
  where country_agent_id is not null;

create or replace function public.handle_operational_user_provisioning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provisioning_metadata jsonb;
  profile_metadata jsonb;
  profile_role text;
  profile_display_name text;
  profile_phone text;
  profile_country_agent_id uuid;
  profile_dealer_id uuid;
  profile_center_id uuid;
begin
  provisioning_metadata := new.raw_app_meta_data -> 'pg_provisioning';

  if provisioning_metadata is null then
    return new;
  end if;

  if jsonb_typeof(provisioning_metadata) <> 'object'
    or provisioning_metadata ->> 'version' <> 'operational-v1'
  then
    raise exception using
      errcode = '22023',
      message = 'operational provisioning metadata is invalid';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = new.id
  ) then
    return new;
  end if;

  profile_metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile_role := nullif(btrim(provisioning_metadata ->> 'role'), '');
  profile_display_name := nullif(btrim(profile_metadata ->> 'display_name'), '');
  profile_phone := nullif(btrim(profile_metadata ->> 'phone'), '');

  if profile_role is null or profile_role not in ('admin', 'agent', 'dealer', 'center') then
    raise exception using
      errcode = '22023',
      message = 'a valid operational role is required';
  end if;

  if profile_display_name is null or char_length(profile_display_name) not between 2 and 120 then
    raise exception using
      errcode = '22023',
      message = 'a valid operational display name is required';
  end if;

  if profile_phone is not null and char_length(profile_phone) not between 5 and 32 then
    raise exception using
      errcode = '22023',
      message = 'operational phone length is invalid';
  end if;

  begin
    profile_country_agent_id := nullif(btrim(provisioning_metadata ->> 'country_agent_id'), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'country_agent_id must be a valid UUID';
  end;

  begin
    profile_dealer_id := nullif(btrim(provisioning_metadata ->> 'dealer_id'), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'dealer_id must be a valid UUID';
  end;

  begin
    profile_center_id := nullif(btrim(provisioning_metadata ->> 'installation_center_id'), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'installation_center_id must be a valid UUID';
  end;

  if profile_role = 'admin'
    and (
      profile_country_agent_id is not null
      or profile_dealer_id is not null
      or profile_center_id is not null
    )
  then
    raise exception using
      errcode = '22023',
      message = 'admin users cannot be bound to an operational entity';
  elsif profile_role = 'agent'
    and (
      profile_country_agent_id is null
      or profile_dealer_id is not null
      or profile_center_id is not null
    )
  then
    raise exception using
      errcode = '22023',
      message = 'agent users require exactly one country agent binding';
  elsif profile_role = 'dealer'
    and (
      profile_country_agent_id is not null
      or profile_dealer_id is null
      or profile_center_id is not null
    )
  then
    raise exception using
      errcode = '22023',
      message = 'dealer users require exactly one dealer binding';
  elsif profile_role = 'center'
    and (
      profile_country_agent_id is not null
      or profile_dealer_id is not null
      or profile_center_id is null
    )
  then
    raise exception using
      errcode = '22023',
      message = 'center users require exactly one installation center binding';
  end if;

  insert into public.profiles (
    id,
    display_name,
    role,
    status,
    phone,
    country_agent_id,
    dealer_id,
    installation_center_id
  )
  values (
    new.id,
    profile_display_name,
    profile_role,
    'active',
    profile_phone,
    profile_country_agent_id,
    profile_dealer_id,
    profile_center_id
  );

  return new;
end;
$$;

revoke all on function public.handle_operational_user_provisioning() from public;
revoke all on function public.handle_operational_user_provisioning() from anon;
revoke all on function public.handle_operational_user_provisioning() from authenticated;
revoke all on function public.handle_operational_user_provisioning() from service_role;

grant select on table public.country_agents to service_role;
grant update (country_agent_id)
  on table public.profiles
  to service_role;
