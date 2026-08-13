-- Cube D — authoritative current custody lives directly on the physical Roll.

create function private.company_operational_party_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_party_id uuid;
  v_company_count integer;
begin
  select count(*), min(op.id::text)::uuid
    into v_company_count, v_company_party_id
  from public.operational_parties op
  where op.party_type = 'company';

  if v_company_count <> 1 or v_company_party_id is null then
    raise exception 'Roll custody requires exactly one Company operational party.' using errcode = '23514';
  end if;

  return v_company_party_id;
end;
$$;

revoke all on function private.company_operational_party_id()
  from public, anon, authenticated, service_role;

alter table public.rolls
  add column custodian_party_id uuid references public.operational_parties(id) on delete restrict,
  add column custody_confirmed_at timestamptz;

update public.rolls
set custodian_party_id = private.company_operational_party_id(),
    custody_confirmed_at = created_at;

alter table public.rolls
  alter column custodian_party_id set default private.company_operational_party_id(),
  alter column custodian_party_id set not null,
  alter column custody_confirmed_at set default now(),
  alter column custody_confirmed_at set not null;

create index rolls_custodian_party_idx on public.rolls (custodian_party_id, id);

comment on column public.rolls.custodian_party_id is
  'Operational Party holding confirmed physical custody. Never an Auth user/profile id.';
comment on column public.rolls.custody_confirmed_at is
  'Timestamp when current confirmed custody began. Pending Transfers do not change this value.';
