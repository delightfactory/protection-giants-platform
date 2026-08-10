-- Product files live in Supabase Storage; this table stores only stable metadata and visibility.
-- Storage object mutation is performed through the Storage API by server-only admin actions.

create table public.product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null,
  label text,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  visibility text not null default 'internal',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),

  constraint product_assets_kind_allowed
    check (kind in ('image', 'datasheet', 'catalogue', 'document')),
  constraint product_assets_label_length
    check (label is null or char_length(btrim(label)) between 1 and 120),
  constraint product_assets_storage_path_length
    check (char_length(storage_path) between 3 and 500),
  constraint product_assets_original_name_length
    check (char_length(btrim(original_name)) between 1 and 255),
  constraint product_assets_mime_type_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf')),
  constraint product_assets_kind_mime_pair
    check (
      (kind = 'image' and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
      or (kind in ('datasheet', 'catalogue', 'document') and mime_type = 'application/pdf')
    ),
  constraint product_assets_size
    check (size_bytes > 0 and size_bytes <= 20971520),
  constraint product_assets_visibility_allowed
    check (visibility in ('internal', 'public')),
  constraint product_assets_sort_order
    check (sort_order between 0 and 32767)
);

create index product_assets_product_order_idx
  on public.product_assets (product_id, sort_order, created_at);

alter table public.product_assets enable row level security;

revoke all on table public.product_assets from public;
revoke all on table public.product_assets from anon;
revoke all on table public.product_assets from authenticated;
revoke all on table public.product_assets from service_role;

grant select, insert, delete on table public.product_assets to authenticated;
grant update (kind, label, visibility, sort_order) on table public.product_assets to authenticated;

create policy "product_assets_admin_read"
on public.product_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.status = 'active'
  )
);

create policy "product_assets_admin_insert"
on public.product_assets
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.status = 'active'
  )
);

create policy "product_assets_admin_update"
on public.product_assets
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.status = 'active'
  )
);

create policy "product_assets_admin_delete"
on public.product_assets
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
      and profiles.status = 'active'
  )
);

-- Public pages use a server-only client to select public asset metadata and create short-lived signed URLs.
-- No anonymous table or Storage bucket access is granted.
grant select on table public.product_assets to service_role;
