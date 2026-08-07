create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null,
  status text not null default 'active',
  phone text,
  created_at timestamptz not null default now(),

  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 2 and 120),
  constraint profiles_role_allowed
    check (role in ('admin', 'dealer', 'center')),
  constraint profiles_status_allowed
    check (status in ('active', 'suspended')),
  constraint profiles_phone_length
    check (phone is null or char_length(btrim(phone)) between 5 and 32)
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;

grant select on table public.profiles to authenticated;

create policy "profiles_read_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);
