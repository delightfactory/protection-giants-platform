-- Hosted Storage parity for Product Foundation.
-- Local Supabase creates this bucket from supabase/config.toml, but hosted
-- projects do not inherit that local-only bucket declaration. Keep the hosted
-- environment reproducible through the migration chain.
--
-- Product object mutation remains server-only through the Storage API.
-- No anon/authenticated storage.objects policy is introduced here.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'product-assets',
  'product-assets',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.product_assets is
  'Product asset metadata. Binary objects live in the private product-assets Storage bucket, which is migration-managed for hosted environment parity.';
