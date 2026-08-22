-- Cube J — Roll Opening / Claiming, increment 4
-- Minimal exact-Roll preflight for the exceptional Recovery task.

create function public.resolve_opened_roll_recovery_candidate(p_roll_serial text)
returns table (
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  opened_at timestamptz,
  opening_center_name text,
  current_custodian_type text,
  current_custodian_name text,
  recovery_destination_name text,
  eligibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_role text;
  v_recipient_party_id uuid;
  v_agent_id uuid;
  v_serial text;
  v_roll_id uuid;
  v_production_status text;
  v_sender_party_id uuid;
  v_sender_party_type text;
  v_sender_center_id uuid;
  v_destination_name text;
begin
  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_role := v_actor ->> 'role';
  v_recipient_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role not in ('admin', 'agent') then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_NOT_AUTHORIZED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_recipient_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_ACTOR_INACTIVE';
  end if;

  if v_actor_role = 'agent' then
    select op.country_agent_id, ca.name
      into v_agent_id, v_destination_name
    from public.operational_parties op
    join public.country_agents ca on ca.id = op.country_agent_id
    where op.id = v_recipient_party_id
      and op.party_type = 'agent'
      and ca.status = 'active'
      and ca.opened_roll_recovery_enabled = true;

    if not found or v_agent_id is null then
      raise exception using errcode = '42501', message = 'PG_ROLL_RECOVERY_AGENT_NOT_ENABLED';
    end if;
  else
    v_destination_name := 'Protection Giants';
  end if;

  select
    r.id,
    po.status,
    custody.custodian_party_id,
    current_party.party_type,
    current_party.installation_center_id
  into
    v_roll_id,
    v_production_status,
    v_sender_party_id,
    v_sender_party_type,
    v_sender_center_id
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  join public.operational_parties current_party on current_party.id = custody.custodian_party_id
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_RECOVERY_ROLL_NOT_FOUND';
  end if;

  if v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_PRODUCTION_INVALID';
  end if;

  if not exists (
    select 1 from public.roll_openings opening where opening.roll_id = v_roll_id
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_NOT_OPENED';
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

  return query
  select
    r.id,
    r.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    opening.opened_at,
    coalesce(opening_center.name, 'مركز تركيب')::text,
    current_party.party_type,
    case current_party.party_type
      when 'company' then 'Protection Giants'
      when 'agent' then coalesce(current_agent.name, 'وكيل دولة')
      when 'dealer' then coalesce(current_dealer.name, 'موزع')
      when 'center' then coalesce(current_center.name, 'مركز تركيب')
      else 'جهة تشغيلية'
    end::text,
    v_destination_name,
    case
      when current_party.id = v_recipient_party_id then 'already_at_destination'
      when reservation.roll_id is not null then 'transfer_reserved'
      else 'eligible'
    end::text
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.production_lots lot on lot.id = r.production_lot_id
  join public.roll_openings opening on opening.roll_id = r.id
  join public.operational_parties opening_party on opening_party.id = opening.opened_by_center_party_id
  left join public.installation_centers opening_center on opening_center.id = opening_party.installation_center_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  join public.operational_parties current_party on current_party.id = custody.custodian_party_id
  left join public.country_agents current_agent on current_agent.id = current_party.country_agent_id
  left join public.dealers current_dealer on current_dealer.id = current_party.dealer_id
  left join public.installation_centers current_center on current_center.id = current_party.installation_center_id
  left join public.roll_transfer_reservations reservation on reservation.roll_id = r.id
  where r.id = v_roll_id;
end;
$$;

revoke all on function public.resolve_opened_roll_recovery_candidate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_opened_roll_recovery_candidate(text)
  to authenticated;

comment on function public.resolve_opened_roll_recovery_candidate(text) is
  'Cube J exact-Roll Recovery preflight. Admin can inspect any opened Roll; enabled Agents receive only in-network Center-held opened Rolls. Returns minimum confirmation data and revalidates everything again during mutation.';
