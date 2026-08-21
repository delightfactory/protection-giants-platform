-- Cube H — Atomic Transfer receipt engine
-- Recipient confirmation is the first post-Production path allowed to change
-- confirmed Roll custody. One request may receive 1..10,000 physical Rolls.

create function public.receive_roll_transfer_items(
  p_request_id uuid,
  p_transfer_id uuid,
  p_roll_ids uuid[]
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
  v_sender_party_id uuid;
  v_recipient_party_id uuid;
  v_transfer_status text;
  v_roll_count integer;
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
  v_now timestamptz := now();
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_REQUEST_ID_REQUIRED';
  end if;

  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  v_roll_count := cardinality(p_roll_ids);
  if p_roll_ids is null or v_roll_count is null or v_roll_count < 1 or v_roll_count > 10000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from unnest(p_roll_ids) as selected(roll_id)
    where selected.roll_id is null
  ) then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_ROLL_ID_NULL';
  end if;

  if exists (
    select selected.roll_id
    from unnest(p_roll_ids) as selected(roll_id)
    group by selected.roll_id
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_ROLL_ID_DUPLICATE';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_party_id := (v_actor ->> 'party_id')::uuid;

  if not private.lock_transfer_party_lifecycle(v_actor_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select
    transfer.sender_party_id,
    transfer.recipient_party_id,
    transfer.status
  into
    v_sender_party_id,
    v_recipient_party_id,
    v_transfer_status
  from public.roll_transfers transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_NOT_FOUND';
  end if;

  if v_actor_party_id <> v_recipient_party_id then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_NOT_RECIPIENT';
  end if;

  -- Matching retries must succeed even though the items/header are now terminal.
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
      or v_existing_event_type <> 'received'
      or v_existing_event_actor_profile_id <> v_actor_profile_id
    then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_RECEIPT_REQUEST_CONFLICT';
    end if;

    select count(*) into v_existing_action_count
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.status = 'received'
      and state.action_request_id = p_request_id;

    if v_existing_action_count <> v_roll_count
      or exists (
        select selected.roll_id
        from unnest(p_roll_ids) as selected(roll_id)
        except
        select state.roll_id
        from public.roll_transfer_item_states state
        where state.transfer_id = p_transfer_id
          and state.status = 'received'
          and state.action_request_id = p_request_id
      )
      or exists (
        select state.roll_id
        from public.roll_transfer_item_states state
        where state.transfer_id = p_transfer_id
          and state.status = 'received'
          and state.action_request_id = p_request_id
        except
        select selected.roll_id
        from unnest(p_roll_ids) as selected(roll_id)
      )
    then
      raise exception using errcode = '23505', message = 'PG_TRANSFER_RECEIPT_REQUEST_CONFLICT';
    end if;

    return p_transfer_id;
  end if;

  if exists (
    select 1
    from public.roll_transfer_events event
    where event.action_request_id = p_request_id
  ) then
    raise exception using errcode = '23505', message = 'PG_TRANSFER_RECEIPT_REQUEST_CONFLICT';
  end if;

  if v_transfer_status not in ('pending', 'partially_received') then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_STATE_INVALID';
  end if;

  if not private.lock_transfer_party_lifecycle(v_recipient_party_id) then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_RECIPIENT_INACTIVE';
  end if;

  -- Lock Production Orders before touching reservations/custody. This keeps the
  -- lock order compatible with Transfer creation and the Production void path.
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
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_PRODUCTION_INVALID';
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
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_ROLL_NOT_IN_TRANSFER';
  end if;

  if exists (
    select 1
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.roll_id = any(p_roll_ids)
      and state.status = 'received'
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_ITEM_ALREADY_RECEIVED';
  end if;

  if exists (
    select 1
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.roll_id = any(p_roll_ids)
      and state.status = 'released_to_sender'
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_ITEM_RELEASED';
  end if;

  if exists (
    select 1
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.roll_id = any(p_roll_ids)
      and state.status = 'closed_unreceived'
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_ITEM_CLOSED';
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
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_RESERVATION_INVALID';
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
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_CUSTODY_MISSING';
  end if;

  if exists (
    select 1
    from public.roll_custody_current custody
    where custody.roll_id = any(p_roll_ids)
      and custody.custodian_party_id <> v_sender_party_id
  ) then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_SENDER_CUSTODY_CHANGED';
  end if;

  update public.roll_transfer_item_states state
  set
    status = 'received',
    action_request_id = p_request_id,
    acted_by_profile_id = v_actor_profile_id,
    acted_by_party_id = v_actor_party_id,
    acted_at = v_now,
    resolution_reason = null
  where state.transfer_id = p_transfer_id
    and state.roll_id = any(p_roll_ids)
    and state.status = 'pending';

  update public.roll_custody_current custody
  set
    custodian_party_id = v_recipient_party_id,
    confirmed_at = v_now
  where custody.roll_id = any(p_roll_ids);

  with selected_rolls as (
    select selected.roll_id
    from unnest(p_roll_ids) as selected(roll_id)
  ), next_sequences as (
    select
      selected.roll_id,
      coalesce(max(event.custody_sequence), 0) + 1 as next_sequence
    from selected_rolls selected
    left join public.roll_custody_events event on event.roll_id = selected.roll_id
    group by selected.roll_id
  )
  insert into public.roll_custody_events (
    roll_id,
    custody_sequence,
    custodian_party_id,
    confirmed_at,
    transfer_id
  )
  select
    next_sequence.roll_id,
    next_sequence.next_sequence,
    v_recipient_party_id,
    v_now,
    p_transfer_id
  from next_sequences next_sequence;

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

  if v_closed_unreceived_count <> 0 then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_STATE_INCONSISTENT';
  end if;

  if v_pending_count = 0 then
    if v_received_count = (
      select transfer.roll_count
      from public.roll_transfers transfer
      where transfer.id = p_transfer_id
    ) and v_released_count = 0 then
      update public.roll_transfers
      set status = 'received', closed_at = v_now
      where id = p_transfer_id;
    elsif v_received_count > 0 and v_released_count > 0 then
      update public.roll_transfers
      set status = 'partially_completed', closed_at = v_now
      where id = p_transfer_id;
    else
      raise exception using errcode = '23514', message = 'PG_TRANSFER_RECEIPT_STATE_INCONSISTENT';
    end if;
  elsif v_transfer_status = 'pending' then
    update public.roll_transfers
    set status = 'partially_received', closed_at = null
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
    action_request_id,
    affected_roll_count
  ) values (
    p_transfer_id,
    v_event_sequence,
    'received',
    v_actor_profile_id,
    v_actor_party_id,
    p_request_id,
    v_roll_count
  );

  return p_transfer_id;
end;
$$;

revoke all on function public.receive_roll_transfer_items(uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.receive_roll_transfer_items(uuid, uuid, uuid[])
  to authenticated;

comment on function public.receive_roll_transfer_items(uuid, uuid, uuid[]) is
  'Cube H recipient-only atomic full/partial receipt. Moves confirmed custody only for the explicitly confirmed physical Rolls.';
