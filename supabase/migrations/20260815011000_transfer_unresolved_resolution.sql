-- Cube H — Unresolved-item resolution and downstream hardening
-- After partial receipt, the only first-release non-receipt resolution is an
-- explicit assertion that selected unresolved Rolls remain/returned with sender.

create function private.apply_unreceived_roll_transfer_release(
  p_request_id uuid,
  p_transfer_id uuid,
  p_roll_ids uuid[],
  p_reason text,
  p_admin_mode boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_actor_party_id uuid;
  v_actor_role text;
  v_sender_party_id uuid;
  v_transfer_status text;
  v_roll_count integer;
  v_reason text;
  v_locked_item_count integer;
  v_locked_reservation_count integer;
  v_locked_custody_count integer;
  v_existing_event_transfer_id uuid;
  v_existing_event_type text;
  v_existing_event_actor_profile_id uuid;
  v_existing_action_count integer;
  v_pending_count integer;
  v_received_count integer;
  v_released_count integer;
  v_closed_unreceived_count integer;
  v_event_sequence integer;
  v_event_type text;
  v_now timestamptz := now();
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_REQUEST_ID_REQUIRED';
  end if;

  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_REASON_INVALID';
  end if;

  v_roll_count := cardinality(p_roll_ids);
  if p_roll_ids is null or v_roll_count is null or v_roll_count < 1 or v_roll_count > 10000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_ROLL_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from unnest(p_roll_ids) as selected(roll_id)
    where selected.roll_id is null
  ) then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_ROLL_ID_NULL';
  end if;

  if exists (
    select selected.roll_id
    from unnest(p_roll_ids) as selected(roll_id)
    group by selected.roll_id
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_ROLL_ID_DUPLICATE';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_party_id := (v_actor ->> 'party_id')::uuid;
  v_actor_role := v_actor ->> 'role';

  if not private.lock_transfer_party_lifecycle(v_actor_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  if p_admin_mode and v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ADMIN_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select transfer.sender_party_id, transfer.status
    into v_sender_party_id, v_transfer_status
  from public.roll_transfers transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_NOT_FOUND';
  end if;

  if not p_admin_mode and v_actor_party_id <> v_sender_party_id then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_NOT_SENDER';
  end if;

  v_event_type := case
    when p_admin_mode then 'administrative_unresolved_released'
    else 'unresolved_released'
  end;

  select
    event.transfer_id,
    event.event_type,
    event.actor_profile_id
  into
    v_existing_event_transfer_id,
    v_existing_event_type,
    v_existing_event_actor_profile_id
  from public.roll_transfer_events event
  where event.action_request_id = p_request_id
  order by event.occurred_at, event.id
  limit 1;

  if found then
    if v_existing_event_transfer_id <> p_transfer_id
      or v_existing_event_type <> v_event_type
      or v_existing_event_actor_profile_id <> v_actor_profile_id
    then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_RESOLUTION_REQUEST_CONFLICT';
    end if;

    select count(*) into v_existing_action_count
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.status = 'released_to_sender'
      and state.action_request_id = p_request_id;

    if v_existing_action_count <> v_roll_count
      or exists (
        select selected.roll_id
        from unnest(p_roll_ids) as selected(roll_id)
        except
        select state.roll_id
        from public.roll_transfer_item_states state
        where state.transfer_id = p_transfer_id
          and state.status = 'released_to_sender'
          and state.action_request_id = p_request_id
      )
      or exists (
        select state.roll_id
        from public.roll_transfer_item_states state
        where state.transfer_id = p_transfer_id
          and state.status = 'released_to_sender'
          and state.action_request_id = p_request_id
        except
        select selected.roll_id
        from unnest(p_roll_ids) as selected(roll_id)
      )
    then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_RESOLUTION_REQUEST_CONFLICT';
    end if;

    return p_transfer_id;
  end if;

  if exists (
    select 1
    from public.roll_transfer_events event
    where event.action_request_id = p_request_id
  ) then
    raise exception using errcode = '23505', message = 'PG_TRANSFER_RESOLUTION_REQUEST_CONFLICT';
  end if;

  if v_transfer_status <> 'partially_received' then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_STATE_INVALID';
  end if;

  -- Sender custody is the assertion being preserved. Lock its lifecycle too so
  -- a support action cannot race a sender suspension/reactivation boundary.
  if not private.lock_transfer_party_lifecycle(v_sender_party_id) then
    if not p_admin_mode then
      raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
    end if;
  end if;

  perform 1
  from public.production_orders po
  where po.id in (
    select distinct roll.production_order_id
    from public.rolls roll
    where roll.id = any(p_roll_ids)
  )
  order by po.id
  for update;

  if exists (
    select 1
    from public.rolls roll
    join public.production_orders po on po.id = roll.production_order_id
    where roll.id = any(p_roll_ids)
      and po.status <> 'generated'
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_PRODUCTION_INVALID';
  end if;

  select count(*) into v_locked_item_count
  from (
    select state.roll_id
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.roll_id = any(p_roll_ids)
    order by state.roll_id
    for update
  ) locked_items;

  if v_locked_item_count <> v_roll_count then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RESOLUTION_ROLL_NOT_IN_TRANSFER';
  end if;

  if exists (
    select 1
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.roll_id = any(p_roll_ids)
      and state.status <> 'pending'
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_ITEM_NOT_PENDING';
  end if;

  select count(*) into v_locked_reservation_count
  from (
    select reservation.roll_id
    from public.roll_transfer_reservations reservation
    where reservation.roll_id = any(p_roll_ids)
      and reservation.transfer_id = p_transfer_id
    order by reservation.roll_id
    for update
  ) locked_reservations;

  if v_locked_reservation_count <> v_roll_count then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_RESERVATION_INVALID';
  end if;

  select count(*) into v_locked_custody_count
  from (
    select custody.roll_id
    from public.roll_custody_current custody
    where custody.roll_id = any(p_roll_ids)
    order by custody.roll_id
    for update
  ) locked_custody;

  if v_locked_custody_count <> v_roll_count then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_CUSTODY_MISSING';
  end if;

  if exists (
    select 1
    from public.roll_custody_current custody
    where custody.roll_id = any(p_roll_ids)
      and custody.custodian_party_id <> v_sender_party_id
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_SENDER_CUSTODY_CHANGED';
  end if;

  update public.roll_transfer_item_states state
  set
    status = 'released_to_sender',
    action_request_id = p_request_id,
    acted_by_profile_id = v_actor_profile_id,
    acted_by_party_id = case when p_admin_mode then null else v_sender_party_id end,
    acted_at = v_now,
    resolution_reason = v_reason
  where state.transfer_id = p_transfer_id
    and state.roll_id = any(p_roll_ids)
    and state.status = 'pending';

  delete from public.roll_transfer_reservations reservation
  where reservation.transfer_id = p_transfer_id
    and reservation.roll_id = any(p_roll_ids);

  select
    count(*) filter (where state.status = 'pending')::integer,
    count(*) filter (where state.status = 'received')::integer,
    count(*) filter (where state.status = 'released_to_sender')::integer,
    count(*) filter (where state.status = 'closed_unreceived')::integer
  into
    v_pending_count,
    v_received_count,
    v_released_count,
    v_closed_unreceived_count
  from public.roll_transfer_item_states state
  where state.transfer_id = p_transfer_id;

  if v_closed_unreceived_count <> 0 or v_received_count < 1 then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RESOLUTION_STATE_INCONSISTENT';
  end if;

  if v_pending_count = 0 then
    update public.roll_transfers
    set status = 'partially_completed', closed_at = v_now
    where id = p_transfer_id;
  end if;

  select coalesce(max(event.event_sequence), 0) + 1
    into v_event_sequence
  from public.roll_transfer_events event
  where event.transfer_id = p_transfer_id;

  insert into public.roll_transfer_events (
    transfer_id,
    event_sequence,
    event_type,
    actor_profile_id,
    actor_party_id,
    reason,
    action_request_id,
    affected_roll_count
  ) values (
    p_transfer_id,
    v_event_sequence,
    v_event_type,
    v_actor_profile_id,
    case when p_admin_mode then null else v_sender_party_id end,
    v_reason,
    p_request_id,
    v_roll_count
  );

  return p_transfer_id;
end;
$$;

revoke all on function private.apply_unreceived_roll_transfer_release(uuid, uuid, uuid[], text, boolean)
  from public, anon, authenticated, service_role;

create function public.release_unreceived_roll_transfer_items(
  p_request_id uuid,
  p_transfer_id uuid,
  p_roll_ids uuid[],
  p_reason text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.apply_unreceived_roll_transfer_release(
    p_request_id,
    p_transfer_id,
    p_roll_ids,
    p_reason,
    false
  )
$$;

revoke all on function public.release_unreceived_roll_transfer_items(uuid, uuid, uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function public.release_unreceived_roll_transfer_items(uuid, uuid, uuid[], text)
  to authenticated;

create function public.admin_release_unreceived_roll_transfer_items(
  p_request_id uuid,
  p_transfer_id uuid,
  p_roll_ids uuid[],
  p_reason text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.apply_unreceived_roll_transfer_release(
    p_request_id,
    p_transfer_id,
    p_roll_ids,
    p_reason,
    true
  )
$$;

revoke all on function public.admin_release_unreceived_roll_transfer_items(uuid, uuid, uuid[], text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_release_unreceived_roll_transfer_items(uuid, uuid, uuid[], text)
  to authenticated;

comment on function public.release_unreceived_roll_transfer_items(uuid, uuid, uuid[], text) is
  'Cube H sender-only resolution: release still-unreceived reserved items after partial receipt while preserving sender custody.';
comment on function public.admin_release_unreceived_roll_transfer_items(uuid, uuid, uuid[], text) is
  'Cube H explicit Admin support resolution. Does not impersonate a business party or move custody.';

-- Strengthen the Cube F Production void guard. A Production Order becomes
-- permanently non-voidable after any confirmed custody movement beyond initial
-- Company custody, even after all Transfer reservations have been consumed.
create or replace function private.prevent_void_with_transfer_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'generated' and new.status = 'voided' then
    if exists (
      select 1
      from public.rolls roll
      join public.roll_transfer_reservations reservation
        on reservation.roll_id = roll.id
      where roll.production_order_id = old.id
    ) then
      raise exception using errcode = '23514', message = 'PG_TRANSFER_PRODUCTION_VOID_RESERVED';
    end if;

    if exists (
      select 1
      from public.rolls roll
      join public.roll_custody_events custody_event
        on custody_event.roll_id = roll.id
      where roll.production_order_id = old.id
        and custody_event.custody_sequence > 1
    ) then
      raise exception using errcode = '23514', message = 'PG_TRANSFER_PRODUCTION_VOID_DISTRIBUTED';
    end if;
  end if;

  return new;
end;
$$;
