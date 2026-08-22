-- Cube J — Roll Opening / Claiming, increment 3
-- Add the narrow Admin/Agent recovery exception for an already-opened Roll.
-- Recovery remains a real Transfer + receipt so confirmed custody has one engine.

alter table public.country_agents
  add column opened_roll_recovery_enabled boolean not null default false;

comment on column public.country_agents.opened_roll_recovery_enabled is
  'Cube J dedicated capability. Admin may enable an active Country Agent to physically recover opened Rolls only from Centers inside that Agent network.';

-- Existing authenticated UPDATE grants are column-scoped and therefore do not
-- include this new capability column. Only this Admin RPC may change it.
create function public.set_agent_opened_roll_recovery(
  p_agent_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_admin()) then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_ADMIN_REQUIRED';
  end if;

  if p_agent_id is null or p_enabled is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_AGENT_SETTING_INVALID';
  end if;

  perform 1
  from public.country_agents ca
  where ca.id = p_agent_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_AGENT_NOT_FOUND';
  end if;

  update public.country_agents
  set opened_roll_recovery_enabled = p_enabled
  where id = p_agent_id;

  return p_enabled;
end;
$$;

revoke all on function public.set_agent_opened_roll_recovery(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_agent_opened_roll_recovery(uuid, boolean)
  to authenticated;

comment on function public.set_agent_opened_roll_recovery(uuid, boolean) is
  'Cube J Admin-only toggle for the dedicated Country Agent opened-Roll recovery capability.';

-- Recovery authorization must be auditable without pretending the current
-- custodian Center initiated the exceptional Transfer.
alter table public.roll_transfer_events
  drop constraint roll_transfer_events_type_allowed,
  drop constraint roll_transfer_events_actor_reason_shape;

alter table public.roll_transfer_events
  add constraint roll_transfer_events_type_allowed
    check (event_type in (
      'created',
      'cancelled',
      'rejected',
      'administrative_cancelled',
      'received',
      'unresolved_released',
      'administrative_unresolved_released',
      'opened_roll_recovery_created'
    )),
  add constraint roll_transfer_events_actor_reason_shape
    check (
      (
        event_type in ('created', 'cancelled', 'rejected')
        and actor_party_id is not null
        and reason is null
        and action_request_id is null
        and affected_roll_count is null
      )
      or (
        event_type = 'administrative_cancelled'
        and actor_party_id is null
        and reason is not null
        and char_length(btrim(reason)) between 5 and 500
        and action_request_id is null
        and affected_roll_count is null
      )
      or (
        event_type = 'received'
        and actor_party_id is not null
        and reason is null
        and action_request_id is not null
        and affected_roll_count is not null
      )
      or (
        event_type = 'unresolved_released'
        and actor_party_id is not null
        and reason is not null
        and char_length(btrim(reason)) between 5 and 500
        and action_request_id is not null
        and affected_roll_count is not null
      )
      or (
        event_type = 'administrative_unresolved_released'
        and actor_party_id is null
        and reason is not null
        and char_length(btrim(reason)) between 5 and 500
        and action_request_id is not null
        and affected_roll_count is not null
      )
      or (
        event_type = 'opened_roll_recovery_created'
        and actor_party_id is not null
        and reason is not null
        and char_length(btrim(reason)) between 5 and 500
        and action_request_id is null
        and affected_roll_count = 1
      )
    );

-- Once physical use began, the Production Order cannot be voided as though the
-- Roll were still unused. open_roll and void_production_order already lock the
-- same Production Order row, so this also closes their concurrency race.
create function private.prevent_void_with_roll_opening()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'generated'
    and new.status = 'voided'
    and exists (
      select 1
      from public.rolls r
      join public.roll_openings opening on opening.roll_id = r.id
      where r.production_order_id = old.id
    )
  then
    raise exception using errcode = '23514', message = 'PG_ROLL_OPENING_PRODUCTION_VOID_BLOCKED';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_void_with_roll_opening()
  from public, anon, authenticated, service_role;

create trigger production_orders_roll_opening_void_guard
  before update of status on public.production_orders
  for each row
  execute function private.prevent_void_with_roll_opening();

create function public.recover_opened_roll(
  p_request_id uuid,
  p_roll_serial text,
  p_reason text,
  p_confirm_physical_receipt boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_actor_role text;
  v_recipient_party_id uuid;
  v_agent_id uuid;
  v_reason text;
  v_serial text;
  v_roll_id uuid;
  v_production_order_id uuid;
  v_sender_party_id uuid;
  v_sender_party_type text;
  v_sender_center_id uuid;
  v_existing_transfer_id uuid;
  v_existing_kind text;
  v_existing_status text;
  v_existing_profile_id uuid;
  v_existing_recipient_party_id uuid;
  v_existing_roll_id uuid;
  v_existing_reason text;
  v_sequence bigint;
  v_transfer_number text;
  v_transfer_id uuid := gen_random_uuid();
  v_received_transfer_id uuid;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_REQUEST_ID_REQUIRED';
  end if;

  if p_confirm_physical_receipt is distinct from true then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_PHYSICAL_RECEIPT_REQUIRED';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_REASON_INVALID';
  end if;

  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_role := v_actor ->> 'role';
  v_recipient_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role not in ('admin', 'agent') then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_NOT_AUTHORIZED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_recipient_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_ACTOR_INACTIVE';
  end if;

  if v_actor_role = 'agent' then
    select op.country_agent_id
      into v_agent_id
    from public.operational_parties op
    where op.id = v_recipient_party_id
      and op.party_type = 'agent';

    if v_agent_id is null then
      raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_AGENT_PARTY_INVALID';
    end if;

    perform 1
    from public.country_agents ca
    where ca.id = v_agent_id
      and ca.status = 'active'
      and ca.opened_roll_recovery_enabled = true
    for share;

    if not found then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_NOT_ENABLED';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select r.id, r.production_order_id
    into v_roll_id, v_production_order_id
  from public.rolls r
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_ROLL_NOT_FOUND';
  end if;

  -- Matching retry after the atomic recovery committed must return the same
  -- completed Transfer even though current custody has already moved.
  select
    rt.id,
    rt.transfer_kind,
    rt.status,
    rt.created_by_profile_id,
    rt.recipient_party_id
  into
    v_existing_transfer_id,
    v_existing_kind,
    v_existing_status,
    v_existing_profile_id,
    v_existing_recipient_party_id
  from public.roll_transfers rt
  where rt.request_id = p_request_id;

  if found then
    select item.roll_id
      into v_existing_roll_id
    from public.roll_transfer_items item
    where item.transfer_id = v_existing_transfer_id;

    select event.reason
      into v_existing_reason
    from public.roll_transfer_events event
    where event.transfer_id = v_existing_transfer_id
      and event.event_type = 'opened_roll_recovery_created'
    order by event.event_sequence
    limit 1;

    if v_existing_kind <> 'opened_roll_recovery'
      or v_existing_status <> 'received'
      or v_existing_profile_id <> v_actor_profile_id
      or v_existing_recipient_party_id <> v_recipient_party_id
      or v_existing_roll_id is distinct from v_roll_id
      or v_existing_reason is distinct from v_reason
    then
      raise exception using errcode = '23505', message = 'PG_ROLL_RECOVERY_REQUEST_CONFLICT';
    end if;

    return v_existing_transfer_id;
  end if;

  -- Keep lock order compatible with Transfer receipt and Production void.
  perform 1
  from public.production_orders po
  where po.id = v_production_order_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_PRODUCTION_MISSING';
  end if;

  if exists (
    select 1
    from public.production_orders po
    where po.id = v_production_order_id
      and po.status <> 'generated'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_PRODUCTION_INVALID';
  end if;

  perform 1
  from public.roll_openings opening
  where opening.roll_id = v_roll_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_NOT_OPENED';
  end if;

  select
    custody.custodian_party_id,
    party.party_type,
    party.installation_center_id
  into
    v_sender_party_id,
    v_sender_party_type,
    v_sender_center_id
  from public.roll_custody_current custody
  join public.operational_parties party on party.id = custody.custodian_party_id
  where custody.roll_id = v_roll_id
  for update of custody;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_CUSTODY_MISSING';
  end if;

  if v_sender_party_id = v_recipient_party_id then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_ALREADY_AT_DESTINATION';
  end if;

  if exists (
    select 1
    from public.roll_transfer_reservations reservation
    where reservation.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_TRANSFER_RESERVED';
  end if;

  if v_actor_role = 'agent' then
    if v_sender_party_type <> 'center' or v_sender_center_id is null then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_CENTER_REQUIRED';
    end if;

    if not exists (
      select 1
      from public.installation_centers center_entity
      left join public.dealers dealer_entity on dealer_entity.id = center_entity.dealer_id
      where center_entity.id = v_sender_center_id
        and (
          center_entity.country_agent_id = v_agent_id
          or dealer_entity.country_agent_id = v_agent_id
        )
    ) then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_OUTSIDE_AGENT_SCOPE';
    end if;
  end if;

  v_sequence := nextval('public.roll_transfer_sequence'::regclass);
  if v_sequence > 99999999 then
    raise exception using errcode = '54000', message = 'PG_TRANSFER_SEQUENCE_EXHAUSTED';
  end if;

  v_transfer_number := format(
    'PG-T-%s-%s',
    to_char(current_date, 'YYYYMMDD'),
    lpad(v_sequence::text, 8, '0')
  );

  insert into public.roll_transfers (
    id,
    transfer_number,
    request_id,
    sender_party_id,
    recipient_party_id,
    status,
    roll_count,
    created_by_profile_id,
    transfer_kind
  ) values (
    v_transfer_id,
    v_transfer_number,
    p_request_id,
    v_sender_party_id,
    v_recipient_party_id,
    'pending',
    1,
    v_actor_profile_id,
    'opened_roll_recovery'
  );

  insert into public.roll_transfer_items (transfer_id, roll_id)
  values (v_transfer_id, v_roll_id);

  begin
    insert into public.roll_transfer_reservations (roll_id, transfer_id)
    values (v_roll_id, v_transfer_id);
  exception
    when unique_violation then
      raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_TRANSFER_RESERVED';
  end;

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
    v_transfer_id,
    1,
    'opened_roll_recovery_created',
    v_actor_profile_id,
    v_recipient_party_id,
    v_reason,
    null,
    1
  );

  -- Reuse the mature Cube H receipt engine. The current Admin/Agent is the
  -- recovery recipient, so that engine revalidates recipient authority,
  -- Production state, reservation and sender custody before it moves custody,
  -- appends the immutable custody event and closes the Transfer as received.
  v_received_transfer_id := public.receive_roll_transfer_items(
    p_request_id,
    v_transfer_id,
    array[v_roll_id]::uuid[]
  );

  if v_received_transfer_id <> v_transfer_id then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_RECEIPT_INCONSISTENT';
  end if;

  return v_transfer_id;
end;
$$;

revoke all on function public.recover_opened_roll(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.recover_opened_roll(uuid, text, text, boolean)
  to authenticated;

comment on function public.recover_opened_roll(uuid, text, text, boolean) is
  'Cube J atomic opened-Roll physical recovery. Admin receives to Company; explicitly enabled Agent receives only from an in-network Center. Opening history is never changed.';
