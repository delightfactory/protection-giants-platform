create function public.handle_new_operational_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provisioning_marker text;
  profile_metadata jsonb;
  profile_role text;
  profile_display_name text;
  profile_phone text;
  profile_dealer_id uuid;
  profile_center_id uuid;
begin
  provisioning_marker := coalesce(new.raw_app_meta_data ->> 'pg_provisioning', '');

  if provisioning_marker <> 'operational-v1' then
    raise exception using
      errcode = '22023',
      message = 'operational user provisioning marker is required';
  end if;

  profile_metadata := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  profile_role := nullif(btrim(profile_metadata ->> 'role'), '');
  profile_display_name := nullif(btrim(profile_metadata ->> 'display_name'), '');
  profile_phone := nullif(btrim(profile_metadata ->> 'phone'), '');

  if profile_role is null or profile_role not in ('admin', 'dealer', 'center') then
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
    profile_dealer_id := nullif(btrim(profile_metadata ->> 'dealer_id'), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'dealer_id must be a valid UUID';
  end;

  begin
    profile_center_id := nullif(btrim(profile_metadata ->> 'installation_center_id'), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'installation_center_id must be a valid UUID';
  end;

  if profile_role = 'admin' and (profile_dealer_id is not null or profile_center_id is not null) then
    raise exception using
      errcode = '22023',
      message = 'admin users cannot be bound to an operational entity';
  elsif profile_role = 'dealer' and (profile_dealer_id is null or profile_center_id is not null) then
    raise exception using
      errcode = '22023',
      message = 'dealer users require exactly one dealer binding';
  elsif profile_role = 'center' and (profile_dealer_id is not null or profile_center_id is null) then
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
    dealer_id,
    installation_center_id
  )
  values (
    new.id,
    profile_display_name,
    profile_role,
    'active',
    profile_phone,
    profile_dealer_id,
    profile_center_id
  );

  return new;
end;
$$;

revoke all on function public.handle_new_operational_user() from public;
revoke all on function public.handle_new_operational_user() from anon;
revoke all on function public.handle_new_operational_user() from authenticated;

create trigger on_auth_user_created_create_operational_profile
after insert on auth.users
for each row
execute function public.handle_new_operational_user();
