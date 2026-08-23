-- Cube L — Notification Foundation, increment 4A
-- Per-device Push subscription ownership plus durable delivery outbox identity.
-- External Web Push transport/VAPID/worker execution remain increment 5.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,

  constraint push_subscriptions_endpoint_shape
    check (
      endpoint = btrim(endpoint)
      and char_length(endpoint) between 16 and 4096
      and endpoint ~ '^https://[^[:space:]]+$'
    ),
  constraint push_subscriptions_p256dh_shape
    check (
      p256dh = btrim(p256dh)
      and char_length(p256dh) between 16 and 512
      and p256dh ~ '^[A-Za-z0-9_-]+={0,2}$'
    ),
  constraint push_subscriptions_auth_secret_shape
    check (
      auth_secret = btrim(auth_secret)
      and char_length(auth_secret) between 16 and 512
      and auth_secret ~ '^[A-Za-z0-9_-]+={0,2}$'
    ),
  constraint push_subscriptions_timestamp_shape
    check (
      updated_at >= created_at
      and (disabled_at is null or disabled_at >= created_at)
      and (last_success_at is null or last_success_at >= created_at)
      and (last_failure_at is null or last_failure_at >= created_at)
    )
);

create index push_subscriptions_profile_active_idx
  on public.push_subscriptions (profile_id, id)
  where disabled_at is null;

comment on table public.push_subscriptions is
  'Cube L sensitive per-Profile browser/device Web Push subscription state. Clients use controlled current-Profile RPCs; endpoint and encryption keys are not a client-readable directory.';

create table public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete restrict,
  subscription_id uuid not null references public.push_subscriptions(id) on delete restrict,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_http_status integer,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notification_push_deliveries_unique
    unique (notification_id, subscription_id),
  constraint notification_push_deliveries_status_allowed
    check (status in ('pending', 'retry', 'sent', 'dead')),
  constraint notification_push_deliveries_attempt_count
    check (attempt_count between 0 and 4),
  constraint notification_push_deliveries_http_status
    check (last_http_status is null or last_http_status between 100 and 599),
  constraint notification_push_deliveries_error_code_shape
    check (
      last_error_code is null
      or (
        last_error_code = btrim(last_error_code)
        and char_length(last_error_code) between 1 and 80
      )
    ),
  constraint notification_push_deliveries_timestamp_shape
    check (
      next_attempt_at >= created_at
      and (last_attempt_at is null or last_attempt_at >= created_at)
      and (sent_at is null or sent_at >= created_at)
    ),
  constraint notification_push_deliveries_state_shape
    check (
      (
        status = 'pending'
        and attempt_count = 0
        and last_attempt_at is null
        and last_http_status is null
        and last_error_code is null
        and sent_at is null
      )
      or (
        status = 'retry'
        and attempt_count between 1 and 3
        and last_attempt_at is not null
        and sent_at is null
      )
      or (
        status = 'sent'
        and attempt_count between 1 and 4
        and last_attempt_at is not null
        and sent_at is not null
      )
      or (
        status = 'dead'
        and attempt_count between 0 and 4
        and sent_at is null
      )
    )
);

create index notification_push_deliveries_due_idx
  on public.notification_push_deliveries (next_attempt_at, id)
  where status in ('pending', 'retry');

create index notification_push_deliveries_subscription_idx
  on public.notification_push_deliveries (subscription_id, created_at desc, id);

comment on table public.notification_push_deliveries is
  'Cube L durable Push outbox identity. Direct clients cannot mutate it; increment 5 will add bounded worker claim/result RPCs without changing source-domain state.';

alter table public.push_subscriptions enable row level security;
alter table public.notification_push_deliveries enable row level security;

revoke all on table public.push_subscriptions
  from public, anon, authenticated, service_role;
revoke all on table public.notification_push_deliveries
  from public, anon, authenticated, service_role;

create function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth_secret text := btrim(coalesce(p_auth_secret, ''));
  v_existing public.push_subscriptions%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_PUSH_AUTH_REQUIRED';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_PUSH_ACCESS_INACTIVE';
  end if;

  if char_length(v_endpoint) < 16
    or char_length(v_endpoint) > 4096
    or v_endpoint !~ '^https://[^[:space:]]+$'
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_ENDPOINT_INVALID';
  end if;

  if char_length(v_p256dh) < 16
    or char_length(v_p256dh) > 512
    or v_p256dh !~ '^[A-Za-z0-9_-]+={0,2}$'
    or char_length(v_auth_secret) < 16
    or char_length(v_auth_secret) > 512
    or v_auth_secret !~ '^[A-Za-z0-9_-]+={0,2}$'
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_KEYS_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_endpoint, 0));

  select subscription.*
    into v_existing
  from public.push_subscriptions subscription
  where subscription.endpoint = v_endpoint
  for update;

  if found then
    if v_existing.profile_id <> v_profile_id then
      raise exception using errcode = '23505', message = 'PG_PUSH_ENDPOINT_OWNED';
    end if;

    if v_existing.p256dh = v_p256dh
      and v_existing.auth_secret = v_auth_secret
      and v_existing.disabled_at is null
    then
      return v_existing.id;
    end if;

    update public.push_subscriptions subscription
    set
      p256dh = v_p256dh,
      auth_secret = v_auth_secret,
      disabled_at = null,
      updated_at = now()
    where subscription.id = v_existing.id;

    return v_existing.id;
  end if;

  insert into public.push_subscriptions (
    profile_id,
    endpoint,
    p256dh,
    auth_secret
  ) values (
    v_profile_id,
    v_endpoint,
    v_p256dh,
    v_auth_secret
  )
  returning id into v_existing.id;

  return v_existing.id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_push_subscription(text, text, text)
  to authenticated;

create function public.disable_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_existing public.push_subscriptions%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_PUSH_AUTH_REQUIRED';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_PUSH_ACCESS_INACTIVE';
  end if;

  if char_length(v_endpoint) < 16
    or char_length(v_endpoint) > 4096
    or v_endpoint !~ '^https://[^[:space:]]+$'
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_ENDPOINT_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_endpoint, 0));

  select subscription.*
    into v_existing
  from public.push_subscriptions subscription
  where subscription.endpoint = v_endpoint
  for update;

  if not found or v_existing.profile_id <> v_profile_id then
    return false;
  end if;

  if v_existing.disabled_at is null then
    update public.push_subscriptions subscription
    set
      disabled_at = now(),
      updated_at = now()
    where subscription.id = v_existing.id;

    -- A device disabled by its owner must not later receive an already-queued
    -- Push if the endpoint is re-enabled. Keep durable delivery history but
    -- terminalize only this device's unsent rows.
    update public.notification_push_deliveries delivery
    set
      status = 'dead',
      last_error_code = 'subscription_disabled'
    where delivery.subscription_id = v_existing.id
      and delivery.status in ('pending', 'retry');
  end if;

  return true;
end;
$$;

revoke all on function public.disable_push_subscription(text)
  from public, anon, authenticated, service_role;
grant execute on function public.disable_push_subscription(text)
  to authenticated;

create function public.current_push_subscription_state(p_endpoint text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_disabled_at timestamptz;
  v_found boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_PUSH_AUTH_REQUIRED';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_PUSH_ACCESS_INACTIVE';
  end if;

  if char_length(v_endpoint) < 16
    or char_length(v_endpoint) > 4096
    or v_endpoint !~ '^https://[^[:space:]]+$'
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_ENDPOINT_INVALID';
  end if;

  select true, subscription.disabled_at
    into v_found, v_disabled_at
  from public.push_subscriptions subscription
  where subscription.endpoint = v_endpoint
    and subscription.profile_id = v_profile_id;

  if not v_found then
    return 'missing';
  end if;

  if v_disabled_at is not null then
    return 'disabled';
  end if;

  return 'subscribed';
end;
$$;

revoke all on function public.current_push_subscription_state(text)
  from public, anon, authenticated, service_role;
grant execute on function public.current_push_subscription_state(text)
  to authenticated;

create function private.materialize_notification_push_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.push_eligible then
    return new;
  end if;

  insert into public.notification_push_deliveries (
    notification_id,
    subscription_id,
    status,
    attempt_count,
    next_attempt_at
  )
  select
    new.id,
    subscription.id,
    'pending',
    0,
    now()
  from public.push_subscriptions subscription
  where subscription.profile_id = new.recipient_profile_id
    and subscription.disabled_at is null
  on conflict (notification_id, subscription_id)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_notification_push_deliveries()
  from public, anon, authenticated, service_role;

create trigger notifications_push_outbox_materializer
  after insert on public.notifications
  for each row
  execute function private.materialize_notification_push_deliveries();

comment on function public.register_push_subscription(text, text, text) is
  'Cube L current-Profile device registration/repair. Endpoint ownership cannot be rebound to another Profile. Registration does not replay historical Inbox notifications.';
comment on function public.disable_push_subscription(text) is
  'Cube L current-Profile current-device disable operation. It terminalizes only that subscription''s unsent deliveries and never deletes Inbox history.';
comment on function public.current_push_subscription_state(text) is
  'Cube L privacy-safe current-device state lookup. Returns only missing/disabled/subscribed for the authenticated current Profile and never exposes endpoint/key material.';
comment on function private.materialize_notification_push_deliveries() is
  'Cube L technical outbox fan-out for newly inserted Push-eligible durable notifications to active subscriptions existing at event time. No historical replay on later device registration.';
