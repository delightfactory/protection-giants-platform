-- Cube H — Transfer Receipt state foundation
-- Extend the closed Cube F transfer identity with a truthful per-item receipt
-- projection while keeping immutable membership, reservations and confirmed
-- custody as separate business facts.

alter table public.roll_transfers
  drop constraint roll_transfers_status_allowed,
  drop constraint roll_transfers_closed_state;

alter table public.roll_transfers
  add constraint roll_transfers_status_allowed
    check (status in (
      'pending',
      'partially_received',
      'received',
      'partially_completed',
      'cancelled',
      'rejected'
    )),
  add constraint roll_transfers_closed_state
    check (
      (status in ('pending', 'partially_received') and closed_at is null)
      or (
        status in ('received', 'partially_completed', 'cancelled', 'rejected')
        and closed_at is not null
      )
    );

comment on column public.roll_transfers.status is
  'Transfer lifecycle. pending/partially_received are open; received/partially_completed/cancelled/rejected are terminal.';

create table public.roll_transfer_item_states (
  transfer_id uuid not null,
  roll_id uuid not null,
  status text not null,
  action_request_id uuid,
  acted_by_profile_id uuid references public.profiles(id) on delete restrict,
  acted_by_party_id uuid references public.operational_parties(id) on delete restrict,
  acted_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  primary key (transfer_id, roll_id),
  constraint roll_transfer_item_states_membership_fkey
    foreign key (transfer_id, roll_id)
    references public.roll_transfer_items(transfer_id, roll_id)
    on delete restrict,
  constraint roll_transfer_item_states_status_allowed
    check (status in ('pending', 'received', 'released_to_sender', 'closed_unreceived')),
  constraint roll_transfer_item_states_action_shape
    check (
      (
        status in ('pending', 'closed_unreceived')
        and action_request_id is null
        and acted_by_profile_id is null
        and acted_by_party_id is null
        and acted_at is null
        and resolution_reason is null
      )
      or (
        status = 'received'
        and action_request_id is not null
        and acted_by_profile_id is not null
        and acted_by_party_id is not null
        and acted_at is not null
        and resolution_reason is null
      )
      or (
        status = 'released_to_sender'
        and action_request_id is not null
        and acted_by_profile_id is not null
        and acted_at is not null
        and resolution_reason is not null
        and char_length(btrim(resolution_reason)) between 5 and 500
      )
    )
);

create index roll_transfer_item_states_transfer_status_idx
  on public.roll_transfer_item_states (transfer_id, status, roll_id);

create index roll_transfer_item_states_action_request_idx
  on public.roll_transfer_item_states (action_request_id)
  where action_request_id is not null;

comment on table public.roll_transfer_item_states is
  'Cube H current receipt/resolution state for immutable Transfer items. Membership remains in roll_transfer_items.';

insert into public.roll_transfer_item_states (
  transfer_id,
  roll_id,
  status
)
select
  item.transfer_id,
  item.roll_id,
  case
    when transfer.status in ('cancelled', 'rejected') then 'closed_unreceived'
    else 'pending'
  end
from public.roll_transfer_items item
join public.roll_transfers transfer on transfer.id = item.transfer_id;

create function private.initialize_roll_transfer_item_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.roll_transfer_item_states (transfer_id, roll_id, status)
  values (new.transfer_id, new.roll_id, 'pending');
  return new;
end;
$$;

revoke all on function private.initialize_roll_transfer_item_state()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_items_initialize_receipt_state
after insert on public.roll_transfer_items
for each row execute function private.initialize_roll_transfer_item_state();

-- Item state is a monotonic projection. Authorization belongs to controlled
-- RPCs; this guard prevents terminal rewrites even under privileged mistakes.
create function private.enforce_roll_transfer_item_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transfer_status text;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ITEM_STATE_IMMUTABLE';
  end if;

  if new.transfer_id is distinct from old.transfer_id
    or new.roll_id is distinct from old.roll_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_ITEM_STATE_IDENTITY_IMMUTABLE';
  end if;

  if old.status <> 'pending' then
    raise exception using errcode = '23514', message = 'PG_TRANSFER_ITEM_STATE_TERMINAL';
  end if;

  if new.status = 'received' then
    return new;
  end if;

  if new.status = 'released_to_sender' then
    select rt.status into v_transfer_status
    from public.roll_transfers rt
    where rt.id = old.transfer_id;

    if v_transfer_status = 'partially_received' then
      return new;
    end if;
  end if;

  if new.status = 'closed_unreceived' then
    select rt.status into v_transfer_status
    from public.roll_transfers rt
    where rt.id = old.transfer_id;

    if v_transfer_status in ('cancelled', 'rejected') then
      return new;
    end if;
  end if;

  raise exception using errcode = '23514', message = 'PG_TRANSFER_ITEM_STATE_INVALID_TRANSITION';
end;
$$;

revoke all on function private.enforce_roll_transfer_item_state_transition()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_item_states_monotonic
before update or delete on public.roll_transfer_item_states
for each row execute function private.enforce_roll_transfer_item_state_transition();

alter table public.roll_transfer_events
  add column action_request_id uuid,
  add column affected_roll_count integer;

alter table public.roll_transfer_events
  add constraint roll_transfer_events_affected_roll_count_valid
    check (affected_roll_count is null or affected_roll_count > 0);

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
      'administrative_unresolved_released'
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
    );

create unique index roll_transfer_events_transfer_action_request_unique
  on public.roll_transfer_events (transfer_id, action_request_id)
  where action_request_id is not null;

alter table public.roll_custody_events
  add column transfer_id uuid
    references public.roll_transfers(id) on delete restrict;

create index roll_custody_events_transfer_idx
  on public.roll_custody_events (transfer_id, roll_id)
  where transfer_id is not null;

comment on column public.roll_custody_events.transfer_id is
  'Originating Transfer for confirmed custody changes created by Cube H receipt. Initial Company custody remains null.';

-- Replace the Cube F header guard with the Cube H monotonic lifecycle.
create or replace function private.enforce_roll_transfer_header_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_HEADER_IMMUTABLE';
  end if;

  if new.transfer_number is distinct from old.transfer_number
    or new.request_id is distinct from old.request_id
    or new.sender_party_id is distinct from old.sender_party_id
    or new.recipient_party_id is distinct from old.recipient_party_id
    or new.roll_count is distinct from old.roll_count
    or new.created_by_profile_id is distinct from old.created_by_profile_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_TRANSFER_IDENTITY_IMMUTABLE';
  end if;

  if old.status = 'pending'
    and new.status in ('cancelled', 'rejected', 'received')
    and new.closed_at is not null
  then
    return new;
  end if;

  if old.status = 'pending'
    and new.status = 'partially_received'
    and new.closed_at is null
  then
    return new;
  end if;

  if old.status = 'partially_received'
    and new.status in ('received', 'partially_completed')
    and new.closed_at is not null
  then
    return new;
  end if;

  if old.status = 'partially_received'
    and new.status = 'partially_received'
    and new.closed_at is null
  then
    return new;
  end if;

  raise exception using errcode = '23514', message = 'PG_TRANSFER_INVALID_STATE_TRANSITION';
end;
$$;

-- Whole-Transfer closure before any receipt must close the item projection in
-- the same transaction. Existing Cube F cancel/reject/recovery RPCs therefore
-- remain authoritative and automatically gain truthful item state.
create function private.close_unreceived_transfer_items_after_header_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending'
    and new.status in ('cancelled', 'rejected')
  then
    update public.roll_transfer_item_states state
    set status = 'closed_unreceived'
    where state.transfer_id = new.id
      and state.status = 'pending';
  end if;

  return new;
end;
$$;

revoke all on function private.close_unreceived_transfer_items_after_header_close()
  from public, anon, authenticated, service_role;

create trigger roll_transfers_close_unreceived_item_states
after update of status on public.roll_transfers
for each row execute function private.close_unreceived_transfer_items_after_header_close();

alter table public.roll_transfer_item_states enable row level security;

revoke all on table public.roll_transfer_item_states
  from public, anon, authenticated, service_role;

grant select on table public.roll_transfer_item_states to authenticated;

create policy "roll_transfer_item_states_read_participant_scope"
on public.roll_transfer_item_states
for select
to authenticated
using ((select private.can_read_roll_transfer(transfer_id)));
