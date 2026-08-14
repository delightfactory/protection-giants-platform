-- Cube H — Exact attention counts for the mobile Transfer hub.
-- Avoid silently capping badges when a party has more than one page of active
-- Transfers. This exposes counts only for the caller's own operational party.

create function public.get_roll_transfer_attention_counts()
returns table (
  incoming_action_count bigint,
  outgoing_action_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_party_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_UNAUTHENTICATED';
  end if;

  if private.is_active_admin() then
    select op.id into v_actor_party_id
    from public.operational_parties op
    where op.party_type = 'company';
  else
    v_actor_party_id := private.current_active_operational_party_id();
  end if;

  if v_actor_party_id is null then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ACTOR_INACTIVE';
  end if;

  return query
  select
    count(*) filter (
      where transfer.recipient_party_id = v_actor_party_id
        and transfer.status in ('pending', 'partially_received')
        and exists (
          select 1
          from public.roll_transfer_item_states state
          where state.transfer_id = transfer.id
            and state.status = 'pending'
        )
    ),
    count(*) filter (
      where transfer.sender_party_id = v_actor_party_id
        and transfer.status = 'partially_received'
        and exists (
          select 1
          from public.roll_transfer_item_states state
          where state.transfer_id = transfer.id
            and state.status = 'pending'
        )
    )
  from public.roll_transfers transfer;
end;
$$;

revoke all on function public.get_roll_transfer_attention_counts()
  from public, anon, authenticated, service_role;
grant execute on function public.get_roll_transfer_attention_counts()
  to authenticated;

comment on function public.get_roll_transfer_attention_counts() is
  'Cube H exact own-party incoming receipt and outgoing unresolved attention counts for the Transfer hub.';
