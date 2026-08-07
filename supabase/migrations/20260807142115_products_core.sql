create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique,
  name text not null,
  default_warranty_months smallint not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),

  constraint products_code_length
    check (char_length(btrim(code)) between 2 and 40),
  constraint products_slug_format
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint products_name_length
    check (char_length(btrim(name)) between 2 and 120),
  constraint products_warranty_duration
    check (default_warranty_months between 1 and 240),
  constraint products_status_allowed
    check (status in ('active', 'archived'))
);

alter table public.products enable row level security;

revoke all on table public.products from public;
revoke all on table public.products from anon;
revoke all on table public.products from authenticated;
