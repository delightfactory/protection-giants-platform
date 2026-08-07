alter table public.profiles
  add column dealer_id uuid references public.dealers(id) on delete restrict,
  add column installation_center_id uuid references public.installation_centers(id) on delete restrict;

alter table public.profiles
  add constraint profiles_operational_entity_binding
  check (
    (role = 'admin' and dealer_id is null and installation_center_id is null)
    or
    (role = 'dealer' and dealer_id is not null and installation_center_id is null)
    or
    (role = 'center' and dealer_id is null and installation_center_id is not null)
  );

create index profiles_dealer_id_idx
  on public.profiles (dealer_id)
  where dealer_id is not null;

create index profiles_installation_center_id_idx
  on public.profiles (installation_center_id)
  where installation_center_id is not null;
