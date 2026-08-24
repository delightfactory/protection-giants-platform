-- Cube L — Notification Foundation, increment 5A
-- Atomic Push delivery claims, active-recipient recheck, bounded retry schedule,
-- and idempotent provider-result recording. Network/VAPID sending remains 5B.

alter table public.notification_push_deliveries
  add column claim_token uuid,
  add column claim_expires_at timestamptz,
  add column last_completed_claim_token uuid;

alter table public.notification_push_deliveries
  add constraint notification_push_deliveries_claim_pair
    check ((claim_token is null) = (claim_expires_at is null)),
  add constraint notification_push_deliveries_terminal_unclaimed
    check (status in ('pending', 'retry') or claim_token is null);

create index notification_push_deliveries_claim_due_idx
  on public.notification_push_deliveries (next_attempt_at, claim_expires_at, id)
  where status in ('pending', 'retry');

comment on column public.notification_push_deliveries.claim_token is
  'Short-lived worker lease token. A newer claim replaces an expired token so stale workers cannot record over a newer attempt.';
comment on column public.notification_push_deliveries.claim_expires_at is
  'Five-minute claim lease. Expired claims may be atomically reclaimed without consuming an attempt until a provider result is recorded.';
comment on column public.notification_push_deliveries.last_completed_claim_token is
  'Most recently recorded claim token, retained only to make exact worker result retries idempotent.';

-- Worker-time mirror of the existing Inbox active Profile + active bound-entity
-- contract. It accepts an explicit Profile id because the worker has no user
-- session and must re-check authorization immediately before transport.
create function private.notification_profile_is_active(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'agent'
          and p.country_agent_id is not null
          and exists (
            select 1
            from public.country_agents ca
            where ca.id = p.country_agent_id
              and ca.status = 'active'
          )
        )
        or (
          p.role = 'dealer'
          and p.dealer_id is not null
          and exists (
            select 1
            from public.dealers d
            where d.id = p.dealer_id
              and d.status = 'active'
          )
        )
        or (
          p.role = 'center'
          and p.installation_center_id is not null
          and exists (
            select 1
            from public.installation_centers c
            where c.id = p.installation_center_id
              and c.status = 'active'
          )
        )
      )
  );
$$;

revoke all on function private.notification_profile_is_active(uuid)
  from public, anon, authenticated, service_role;

create function public.claim_notification_push_deliveries(p_limit integer default 50)
returns table (
  delivery_id uuid,
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_number integer,
  notification_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  title text,
  body text,
  action_path text,
  attention_level text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PG_PUSH_WORKER_FORBIDDEN';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'PG_PUSH_CLAIM_LIMIT_INVALID';
  end if;

  -- Subscription disable is authoritative across every unsent row, including
  -- rows that were leased before the browser/device became disabled.
  update public.notification_push_deliveries delivery
  set
    status = 'dead',
    last_error_code = 'subscription_disabled',
    claim_token = null,
    claim_expires_at = null
  from public.push_subscriptions subscription
  where delivery.subscription_id = subscription.id
    and delivery.status in ('pending', 'retry')
    and subscription.disabled_at is not null;

  -- Re-check the destination at worker time. Suspension of either the Profile
  -- or its bound operational entity invalidates delivery without mutating the
  -- durable Inbox notification.
  update public.notification_push_deliveries delivery
  set
    status = 'dead',
    last_error_code = 'recipient_inactive',
    claim_token = null,
    claim_expires_at = null
  from public.push_subscriptions subscription,
       public.notifications notification
  where delivery.subscription_id = subscription.id
    and delivery.notification_id = notification.id
    and delivery.status in ('pending', 'retry')
    and subscription.disabled_at is null
    and (
      subscription.profile_id <> notification.recipient_profile_id
      or not private.notification_profile_is_active(notification.recipient_profile_id)
    );

  return query
  with candidates as (
    select delivery.id
    from public.notification_push_deliveries delivery
    join public.push_subscriptions subscription
      on subscription.id = delivery.subscription_id
    join public.notifications notification
      on notification.id = delivery.notification_id
    where delivery.status in ('pending', 'retry')
      and delivery.next_attempt_at <= now()
      and (delivery.claim_expires_at is null or delivery.claim_expires_at <= now())
      and subscription.disabled_at is null
      and subscription.profile_id = notification.recipient_profile_id
      and private.notification_profile_is_active(notification.recipient_profile_id)
    order by delivery.next_attempt_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  ), claimed as (
    update public.notification_push_deliveries delivery
    set
      claim_token = gen_random_uuid(),
      claim_expires_at = now() + interval '5 minutes'
    from candidates
    where delivery.id = candidates.id
    returning
      delivery.id,
      delivery.notification_id,
      delivery.subscription_id,
      delivery.claim_token,
      delivery.claim_expires_at,
      delivery.attempt_count
  )
  select
    claimed.id,
    claimed.claim_token,
    claimed.claim_expires_at,
    claimed.attempt_count + 1,
    claimed.notification_id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth_secret,
    notification.title,
    notification.body,
    notification.action_path,
    notification.attention_level
  from claimed
  join public.push_subscriptions subscription
    on subscription.id = claimed.subscription_id
  join public.notifications notification
    on notification.id = claimed.notification_id
  order by claimed.id;
end;
$$;

revoke all on function public.claim_notification_push_deliveries(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_notification_push_deliveries(integer)
  to service_role;

create function public.record_notification_push_delivery_result(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_result text,
  p_http_status integer default null,
  p_error_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.notification_push_deliveries%rowtype;
  v_attempt integer;
  v_error_code text := nullif(btrim(coalesce(p_error_code, '')), '');
  v_next_attempt_at timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'PG_PUSH_WORKER_FORBIDDEN';
  end if;

  if p_delivery_id is null or p_claim_token is null then
    raise exception using errcode = '22023', message = 'PG_PUSH_RESULT_ID_REQUIRED';
  end if;

  if p_result is null
    or p_result not in ('sent', 'subscription_gone', 'retryable_failure', 'terminal_failure')
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_RESULT_INVALID';
  end if;

  if p_http_status is not null and (p_http_status < 100 or p_http_status > 599) then
    raise exception using errcode = '22023', message = 'PG_PUSH_HTTP_STATUS_INVALID';
  end if;

  if v_error_code is not null
    and (
      char_length(v_error_code) > 80
      or v_error_code !~ '^[a-z0-9_:-]+$'
    )
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_ERROR_CODE_INVALID';
  end if;

  if p_result = 'sent'
    and (p_http_status is null or p_http_status < 200 or p_http_status > 299)
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_RESULT_STATUS_MISMATCH';
  end if;

  if p_result = 'subscription_gone'
    and (p_http_status is null or p_http_status not in (404, 410))
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_RESULT_STATUS_MISMATCH';
  end if;

  if p_result = 'retryable_failure'
    and p_http_status is not null
    and p_http_status <> 429
    and (p_http_status < 500 or p_http_status > 599)
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_RESULT_STATUS_MISMATCH';
  end if;

  if p_result = 'terminal_failure'
    and (
      p_http_status is null
      or p_http_status < 400
      or p_http_status > 499
      or p_http_status in (404, 410, 429)
    )
  then
    raise exception using errcode = '22023', message = 'PG_PUSH_RESULT_STATUS_MISMATCH';
  end if;

  select delivery.*
    into v_delivery
  from public.notification_push_deliveries delivery
  where delivery.id = p_delivery_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_PUSH_DELIVERY_NOT_FOUND';
  end if;

  if v_delivery.claim_token is distinct from p_claim_token then
    if v_delivery.last_completed_claim_token = p_claim_token then
      return v_delivery.status;
    end if;

    raise exception using errcode = '22023', message = 'PG_PUSH_CLAIM_STALE';
  end if;

  if v_delivery.status not in ('pending', 'retry') then
    raise exception using errcode = '22023', message = 'PG_PUSH_CLAIM_STALE';
  end if;

  v_attempt := v_delivery.attempt_count + 1;

  if p_result = 'sent' then
    update public.notification_push_deliveries delivery
    set
      status = 'sent',
      attempt_count = v_attempt,
      last_attempt_at = now(),
      last_http_status = p_http_status,
      last_error_code = null,
      sent_at = now(),
      claim_token = null,
      claim_expires_at = null,
      last_completed_claim_token = p_claim_token
    where delivery.id = p_delivery_id;

    update public.push_subscriptions subscription
    set
      last_success_at = now(),
      updated_at = now()
    where subscription.id = v_delivery.subscription_id;

    return 'sent';
  end if;

  if p_result = 'subscription_gone' then
    update public.notification_push_deliveries delivery
    set
      status = 'dead',
      attempt_count = v_attempt,
      last_attempt_at = now(),
      last_http_status = p_http_status,
      last_error_code = coalesce(v_error_code, 'subscription_gone'),
      sent_at = null,
      claim_token = null,
      claim_expires_at = null,
      last_completed_claim_token = p_claim_token
    where delivery.id = p_delivery_id;

    update public.push_subscriptions subscription
    set
      disabled_at = coalesce(subscription.disabled_at, now()),
      last_failure_at = now(),
      updated_at = now()
    where subscription.id = v_delivery.subscription_id;

    update public.notification_push_deliveries delivery
    set
      status = 'dead',
      last_error_code = 'subscription_gone',
      claim_token = null,
      claim_expires_at = null
    where delivery.subscription_id = v_delivery.subscription_id
      and delivery.id <> p_delivery_id
      and delivery.status in ('pending', 'retry');

    return 'dead';
  end if;

  update public.push_subscriptions subscription
  set
    last_failure_at = now(),
    updated_at = now()
  where subscription.id = v_delivery.subscription_id;

  if p_result = 'terminal_failure' or v_attempt >= 4 then
    update public.notification_push_deliveries delivery
    set
      status = 'dead',
      attempt_count = v_attempt,
      last_attempt_at = now(),
      last_http_status = p_http_status,
      last_error_code = coalesce(v_error_code, p_result),
      sent_at = null,
      claim_token = null,
      claim_expires_at = null,
      last_completed_claim_token = p_claim_token
    where delivery.id = p_delivery_id;

    return 'dead';
  end if;

  v_next_attempt_at := now() + case v_attempt
    when 1 then interval '5 minutes'
    when 2 then interval '30 minutes'
    when 3 then interval '120 minutes'
    else interval '120 minutes'
  end;

  update public.notification_push_deliveries delivery
  set
    status = 'retry',
    attempt_count = v_attempt,
    next_attempt_at = v_next_attempt_at,
    last_attempt_at = now(),
    last_http_status = p_http_status,
    last_error_code = coalesce(v_error_code, 'retryable_failure'),
    sent_at = null,
    claim_token = null,
    claim_expires_at = null,
    last_completed_claim_token = p_claim_token
  where delivery.id = p_delivery_id;

  return 'retry';
end;
$$;

revoke all on function public.record_notification_push_delivery_result(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_notification_push_delivery_result(uuid, uuid, text, integer, text)
  to service_role;

comment on function private.notification_profile_is_active(uuid) is
  'Cube L worker-time active Profile + bound-entity check. Mirrors the Inbox authorization contract without requiring a user session.';
comment on function public.claim_notification_push_deliveries(integer) is
  'Cube L service-role-only atomic bounded claim. Uses five-minute leases and SKIP LOCKED; does not consume an attempt until a provider result is recorded.';
comment on function public.record_notification_push_delivery_result(uuid, uuid, text, integer, text) is
  'Cube L service-role-only idempotent Push result recorder. Implements 0/+5/+30/+120 minute bounded retry semantics and immediate 404/410 subscription invalidation.';
