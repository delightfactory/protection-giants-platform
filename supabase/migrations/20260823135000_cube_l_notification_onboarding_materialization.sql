-- Cube L — Notification Foundation, increment 3C
-- Materialize the frozen Center onboarding notification catalog without treating
-- the provisional invitation claim as completed onboarding.

create function private.notification_primary_center_manager_profile_ids(p_center_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with manager_party as (
    select op.id as party_id
    from public.installation_centers c
    join public.operational_parties op
      on (
        c.dealer_id is not null
        and op.party_type = 'dealer'
        and op.dealer_id = c.dealer_id
      )
      or (
        c.dealer_id is null
        and c.country_agent_id is not null
        and op.party_type = 'agent'
        and op.country_agent_id = c.country_agent_id
      )
      or (
        c.dealer_id is null
        and c.country_agent_id is null
        and op.party_type = 'company'
      )
    where c.id = p_center_id
      and c.status = 'active'
  )
  select recipients.profile_id
  from manager_party manager
  cross join lateral private.notification_party_profile_ids(manager.party_id) recipients;
$$;

revoke all on function private.notification_primary_center_manager_profile_ids(uuid)
  from public, anon, authenticated, service_role;

create function public.materialize_center_onboarding_success(p_invitation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.center_onboarding_invitations%rowtype;
  v_center_name text;
  v_source_event_key text;
  v_inserted_count integer := 0;
begin
  if p_invitation_id is null then
    raise exception using errcode = '22023', message = 'PG_NOTIFICATION_ONBOARDING_INVITATION_REQUIRED';
  end if;

  select invitation.*
    into v_invitation
  from public.center_onboarding_invitations invitation
  where invitation.id = p_invitation_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'PG_NOTIFICATION_ONBOARDING_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.status <> 'accepted'
    or v_invitation.accepted_at is null
    or v_invitation.review_required_at is not null
    or v_invitation.failure_code is not null
    or v_invitation.auth_user_id is null
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_ONBOARDING_NOT_FINAL';
  end if;

  select c.name
    into v_center_name
  from public.installation_centers c
  where c.id = v_invitation.installation_center_id
    and c.status = 'active';

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_ONBOARDING_CENTER_INACTIVE';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_invitation.auth_user_id
      and p.role = 'center'
      and p.status = 'active'
      and p.country_agent_id is null
      and p.dealer_id is null
      and p.installation_center_id = v_invitation.installation_center_id
  ) then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_ONBOARDING_PROFILE_NOT_FINAL';
  end if;

  v_source_event_key := 'center_onboarding:' || v_invitation.id::text || ':accepted';

  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    'center.onboarding_completed',
    'center_onboarding',
    v_source_event_key,
    'info',
    'اكتمل إعداد حساب المركز',
    'أكمل مركز ' || v_center_name || ' إعداد أول حساب تشغيلي بنجاح.',
    '/operations/centers/' || v_invitation.installation_center_id::text || '/edit',
    true,
    v_invitation.accepted_at
  from private.notification_primary_center_manager_profile_ids(v_invitation.installation_center_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

revoke all on function public.materialize_center_onboarding_success(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_center_onboarding_success(uuid)
  to service_role;

comment on function public.materialize_center_onboarding_success(uuid) is
  'Cube L server-only normal onboarding notification finalizer. Call only after the application has verified the created active Center Profile. Idempotent by frozen invitation source key.';

create function private.materialize_center_onboarding_review_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_name text;
  v_company_party_id uuid;
  v_source_event_key text;
begin
  if new.status <> 'accepted'
    or new.review_required_at is null
    or new.failure_code not in ('profile-mismatch', 'profile-read-uncertain')
    or old.review_required_at is not null
  then
    return new;
  end if;

  select c.name
    into v_center_name
  from public.installation_centers c
  where c.id = new.installation_center_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_ONBOARDING_CENTER_MISSING';
  end if;

  select op.id
    into v_company_party_id
  from public.operational_parties op
  where op.party_type = 'company';

  if v_company_party_id is null then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
  end if;

  v_source_event_key := 'center_onboarding:' || new.id::text || ':review_required';

  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    'center.onboarding_review_required',
    'center_onboarding',
    v_source_event_key,
    'action_required',
    'إعداد مركز يحتاج مراجعة',
    'اكتملت محاولة إعداد مركز ' || v_center_name || ' لكن الحالة تحتاج مراجعة من الشركة.',
    '/operations/centers/' || new.installation_center_id::text || '/edit',
    true,
    new.review_required_at
  from private.notification_party_profile_ids(v_company_party_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_center_onboarding_review_notification()
  from public, anon, authenticated, service_role;

create trigger center_onboarding_review_notification_materializer
  after update of status, review_required_at, failure_code
  on public.center_onboarding_invitations
  for each row
  execute function private.materialize_center_onboarding_review_notification();

comment on function private.materialize_center_onboarding_review_notification() is
  'Cube L explicit onboarding repair/review projector. It fires only when an accepted invitation first receives the approved review marker and never emits the normal onboarding-success event.';
