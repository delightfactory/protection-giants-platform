-- Clear any active worker lease before terminalizing queued deliveries for a
-- device that its owner disabled. This preserves the terminal-unclaimed
-- invariant even when disable races with a worker claim.
create or replace function public.disable_push_subscription(p_endpoint text)
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
    -- Push if the endpoint is re-enabled. Clear a worker lease before
    -- terminalizing the row so terminal deliveries remain unclaimed.
    update public.notification_push_deliveries delivery
    set
      status = 'dead',
      last_error_code = 'subscription_disabled',
      claim_token = null,
      claim_expires_at = null
    where delivery.subscription_id = v_existing.id
      and delivery.status in ('pending', 'retry');
  end if;

  return true;
end;
$$;
