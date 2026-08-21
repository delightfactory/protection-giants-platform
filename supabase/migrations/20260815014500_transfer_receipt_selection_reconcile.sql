-- Cube H — Reconcile local receipt selection after refresh/interruption.
-- This returns only still-pending IDs from the caller-supplied set and never
-- discovers additional Transfer membership.

create function public.reconcile_roll_transfer_receipt_selection(
  p_transfer_id uuid,
  p_roll_ids uuid[]
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_party_id uuid;
  v_recipient_party_id uuid;
  v_transfer_status text;
  v_count integer;
begin
  if p_transfer_id is null then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_ID_REQUIRED';
  end if;

  v_count := cardinality(p_roll_ids);
  if p_roll_ids is null or v_count is null or v_count < 1 or v_count > 10000 then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID';
  end if;

  if exists (select 1 from unnest(p_roll_ids) selected(roll_id) where selected.roll_id is null)
    or exists (
      select selected.roll_id from unnest(p_roll_ids) selected(roll_id)
      group by selected.roll_id having count(*) > 1
    )
  then
    raise exception using errcode = '22023', message = 'PG_TRANSFER_RECEIPT_SELECTION_INVALID';
  end if;

  v_actor_party_id := private.current_active_operational_party_id();
  if v_actor_party_id is null then
    -- Admin can be a real recipient only when acting as Company.
    if private.is_active_admin() then
      select op.id into v_actor_party_id
      from public.operational_parties op
      where op.party_type = 'company';
    else
      raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
    end if;
  end if;

  select transfer.recipient_party_id, transfer.status
    into v_recipient_party_id, v_transfer_status
  from public.roll_transfers transfer
  where transfer.id = p_transfer_id;

  if not found or v_recipient_party_id <> v_actor_party_id then
    return '{}'::uuid[];
  end if;

  if v_transfer_status not in ('pending', 'partially_received') then
    return '{}'::uuid[];
  end if;

  return coalesce((
    select array_agg(state.roll_id order by state.roll_id)
    from public.roll_transfer_item_states state
    where state.transfer_id = p_transfer_id
      and state.roll_id = any(p_roll_ids)
      and state.status = 'pending'
  ), '{}'::uuid[]);
end;
$$;

revoke all on function public.reconcile_roll_transfer_receipt_selection(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_roll_transfer_receipt_selection(uuid, uuid[])
  to authenticated;

comment on function public.reconcile_roll_transfer_receipt_selection(uuid, uuid[]) is
  'Cube H recipient-only recovery helper: intersects a local draft selection with items that are still pending in that Transfer.';
