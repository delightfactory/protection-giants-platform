-- Cube R — Approved Claim Resolution / Replacement & Reinstall, increment 2
-- Extend the exact Cube Q authorized Resolution header into the frozen R lifecycle.
-- No Roll allocation, Transfer, Opening, completion evidence or public read/mutation
-- RPC is introduced in this persistence-only increment.

alter table public.warranty_claim_resolutions
  drop constraint warranty_claim_resolutions_q_status_allowed;

alter table public.warranty_claim_resolutions
  add column remedy_kind text,
  add column performing_center_party_id uuid references public.operational_parties(id) on delete restrict,
  add column assigned_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column assigned_at timestamptz,
  add column completed_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column completion_actor_kind text,
  add column completion_note text,
  add column completed_at timestamptz,
  add column cancelled_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column cancellation_reason text,
  add column customer_cancellation_message text,
  add column cancelled_at timestamptz;

alter table public.warranty_claim_resolutions
  add constraint warranty_claim_resolutions_r_status_allowed
    check (status in ('authorized', 'assigned', 'completed', 'cancelled')),
  add constraint warranty_claim_resolutions_remedy_kind_allowed
    check (remedy_kind is null or remedy_kind in ('service_reinstall', 'replacement_roll_reinstall')),
  add constraint warranty_claim_resolutions_completion_actor_kind_allowed
    check (completion_actor_kind is null or completion_actor_kind in ('center', 'admin_recovery')),
  add constraint warranty_claim_resolutions_completion_note_shape
    check (
      completion_note is null
      or (
        completion_note = btrim(completion_note)
        and char_length(completion_note) between 10 and 2000
      )
    ),
  add constraint warranty_claim_resolutions_cancellation_reason_shape
    check (
      cancellation_reason is null
      or (
        cancellation_reason = btrim(cancellation_reason)
        and char_length(cancellation_reason) between 5 and 500
      )
    ),
  add constraint warranty_claim_resolutions_customer_cancellation_message_shape
    check (
      customer_cancellation_message is null
      or (
        customer_cancellation_message = btrim(customer_cancellation_message)
        and char_length(customer_cancellation_message) between 5 and 1000
      )
    ),
  add constraint warranty_claim_resolutions_r_state_shape
    check (
      (
        status = 'authorized'
        and remedy_kind is null
        and performing_center_party_id is null
        and assigned_by_profile_id is null
        and assigned_at is null
        and completed_by_profile_id is null
        and completion_actor_kind is null
        and completion_note is null
        and completed_at is null
        and cancelled_by_profile_id is null
        and cancellation_reason is null
        and customer_cancellation_message is null
        and cancelled_at is null
      )
      or (
        status = 'assigned'
        and remedy_kind is not null
        and performing_center_party_id is not null
        and assigned_by_profile_id is not null
        and assigned_at is not null
        and completed_by_profile_id is null
        and completion_actor_kind is null
        and completion_note is null
        and completed_at is null
        and cancelled_by_profile_id is null
        and cancellation_reason is null
        and customer_cancellation_message is null
        and cancelled_at is null
      )
      or (
        status = 'completed'
        and remedy_kind is not null
        and performing_center_party_id is not null
        and assigned_by_profile_id is not null
        and assigned_at is not null
        and completed_by_profile_id is not null
        and completion_actor_kind is not null
        and completion_note is not null
        and completed_at is not null
        and cancelled_by_profile_id is null
        and cancellation_reason is null
        and customer_cancellation_message is null
        and cancelled_at is null
      )
      or (
        status = 'cancelled'
        and remedy_kind is not null
        and performing_center_party_id is not null
        and assigned_by_profile_id is not null
        and assigned_at is not null
        and completed_by_profile_id is null
        and completion_actor_kind is null
        and completion_note is null
        and completed_at is null
        and cancelled_by_profile_id is not null
        and cancellation_reason is not null
        and customer_cancellation_message is not null
        and cancelled_at is not null
      )
    ),
  add constraint warranty_claim_resolutions_r_timestamp_shape
    check (
      (assigned_at is null or assigned_at >= authorized_at)
      and (completed_at is null or (assigned_at is not null and completed_at >= assigned_at))
      and (cancelled_at is null or (assigned_at is not null and cancelled_at >= assigned_at))
    );

create index warranty_claim_resolutions_status_recent_idx
  on public.warranty_claim_resolutions (status, updated_at desc, id);

create index warranty_claim_resolutions_center_assigned_idx
  on public.warranty_claim_resolutions (performing_center_party_id, assigned_at, id)
  where status = 'assigned';

-- Resolution events are the immutable R-domain audit source. Cube L notification
-- projection is added only when the corresponding named operational mutations are
-- introduced; Push outcome never drives this lifecycle.
create table public.warranty_claim_resolution_events (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.warranty_claim_resolutions(id) on delete restrict,
  action_request_id uuid not null unique,
  event_kind text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_kind text not null,
  reason text,
  event_data jsonb,
  created_at timestamptz not null default now(),

  constraint warranty_claim_resolution_events_kind_allowed
    check (event_kind in (
      'resolution_assigned',
      'resolution_reassigned',
      'resolution_remedy_changed',
      'replacement_roll_reserved',
      'replacement_roll_released',
      'replacement_roll_consumed',
      'resolution_completed',
      'resolution_completed_admin_recovery',
      'resolution_cancelled_customer_withdrawal'
    )),
  constraint warranty_claim_resolution_events_actor_kind_allowed
    check (actor_kind in ('admin', 'center')),
  constraint warranty_claim_resolution_events_actor_shape
    check (
      (
        event_kind in (
          'resolution_assigned',
          'resolution_reassigned',
          'resolution_remedy_changed',
          'replacement_roll_reserved',
          'replacement_roll_released',
          'resolution_completed_admin_recovery',
          'resolution_cancelled_customer_withdrawal'
        )
        and actor_kind = 'admin'
      )
      or (event_kind = 'resolution_completed' and actor_kind = 'center')
      or (event_kind = 'replacement_roll_consumed' and actor_kind in ('admin', 'center'))
    ),
  constraint warranty_claim_resolution_events_reason_shape
    check (
      (
        event_kind in (
          'resolution_reassigned',
          'resolution_remedy_changed',
          'replacement_roll_released',
          'resolution_completed_admin_recovery',
          'resolution_cancelled_customer_withdrawal'
        )
        and reason is not null
        and reason = btrim(reason)
        and char_length(reason) between 5 and 500
      )
      or (
        event_kind in (
          'resolution_assigned',
          'replacement_roll_reserved',
          'replacement_roll_consumed',
          'resolution_completed'
        )
        and reason is null
      )
    ),
  constraint warranty_claim_resolution_events_data_shape
    check (event_data is null or jsonb_typeof(event_data) = 'object')
);

create index warranty_claim_resolution_events_timeline_idx
  on public.warranty_claim_resolution_events (resolution_id, created_at, id);

-- Q's blanket immutability is replaced by an R structural lifecycle guard. Direct
-- table writes stay ungranted; later named SECURITY DEFINER R operations own the
-- business authorization, Claim-open checks, actionable Center checks and events.
drop trigger warranty_claim_resolutions_q_immutable on public.warranty_claim_resolutions;

create function private.guard_warranty_claim_resolution_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_remedy_changed boolean;
  v_center_changed boolean;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.claim_id is distinct from old.claim_id
    or new.authorized_by_profile_id is distinct from old.authorized_by_profile_id
    or new.authorized_at is distinct from old.authorized_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_IDENTITY_IMMUTABLE';
  end if;

  if old.status in ('completed', 'cancelled') then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_TERMINAL';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_UPDATED_AT_INVALID';
  end if;

  if old.status = 'authorized' and new.status = 'assigned' then
    return new;
  end if;

  if old.status = 'assigned' and new.status = 'assigned' then
    v_remedy_changed := new.remedy_kind is distinct from old.remedy_kind;
    v_center_changed := new.performing_center_party_id is distinct from old.performing_center_party_id;

    if v_remedy_changed = v_center_changed then
      raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_ASSIGNED_UPDATE_INVALID';
    end if;

    if v_remedy_changed then
      if new.assigned_by_profile_id is distinct from old.assigned_by_profile_id
        or new.assigned_at is distinct from old.assigned_at
      then
        raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_REMEDY_CHANGE_INVALID';
      end if;
    else
      if new.remedy_kind is distinct from old.remedy_kind
        or new.assigned_at is null
        or old.assigned_at is null
        or new.assigned_at <= old.assigned_at
      then
        raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_REASSIGNMENT_INVALID';
      end if;
    end if;

    return new;
  end if;

  if old.status = 'assigned' and new.status in ('completed', 'cancelled') then
    if new.remedy_kind is distinct from old.remedy_kind
      or new.performing_center_party_id is distinct from old.performing_center_party_id
      or new.assigned_by_profile_id is distinct from old.assigned_by_profile_id
      or new.assigned_at is distinct from old.assigned_at
    then
      raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_ASSIGNMENT_IMMUTABLE_AT_TERMINAL';
    end if;

    return new;
  end if;

  raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_INVALID_TRANSITION';
end;
$$;

revoke all on function private.guard_warranty_claim_resolution_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_resolutions_guard_mutation
  before update or delete on public.warranty_claim_resolutions
  for each row execute function private.guard_warranty_claim_resolution_mutation();

create function private.reject_warranty_claim_resolution_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_CLAIM_RESOLUTION_EVENT_IMMUTABLE';
end;
$$;

revoke all on function private.reject_warranty_claim_resolution_event_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_resolution_events_immutable
  before update or delete on public.warranty_claim_resolution_events
  for each row execute function private.reject_warranty_claim_resolution_event_mutation();

alter table public.warranty_claim_resolution_events enable row level security;

revoke all on table public.warranty_claim_resolution_events
  from public, anon, authenticated, service_role;

comment on table public.warranty_claim_resolutions is
  'Cube Q one-to-one approved Claim handoff extended by Cube R into authorized/assigned/completed/cancelled physical fulfillment lifecycle. Adjudication remains on the parent Claim.';
comment on table public.warranty_claim_resolution_events is
  'Cube R immutable Resolution fulfillment timeline. J/K retain their own physical Opening/Issue event domains; R does not duplicate them.';
