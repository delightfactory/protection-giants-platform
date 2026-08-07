create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_code text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),

  constraint dealers_code_format
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  constraint dealers_name_length
    check (char_length(btrim(name)) between 2 and 160),
  constraint dealers_country_code_format
    check (country_code ~ '^[A-Z]{2}$'),
  constraint dealers_status_allowed
    check (status in ('active', 'suspended'))
);

create table public.installation_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  dealer_id uuid references public.dealers(id) on delete restrict,
  country_code text not null,
  city text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),

  constraint installation_centers_code_format
    check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  constraint installation_centers_name_length
    check (char_length(btrim(name)) between 2 and 160),
  constraint installation_centers_country_code_format
    check (country_code ~ '^[A-Z]{2}$'),
  constraint installation_centers_city_length
    check (char_length(btrim(city)) between 2 and 120),
  constraint installation_centers_status_allowed
    check (status in ('active', 'suspended'))
);

alter table public.dealers enable row level security;
alter table public.installation_centers enable row level security;

revoke all on table public.dealers from public;
revoke all on table public.dealers from anon;
revoke all on table public.dealers from authenticated;

revoke all on table public.installation_centers from public;
revoke all on table public.installation_centers from anon;
revoke all on table public.installation_centers from authenticated;

create index installation_centers_dealer_id_idx
  on public.installation_centers (dealer_id);
