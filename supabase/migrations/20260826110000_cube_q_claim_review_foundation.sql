-- Cube Q — Claim Review, Inspection & Decision, increment 1
-- Durable review/inspection/decision persistence only. Named transition RPCs,
-- notification materialization and application surfaces follow in later bounded increments.

-- Q decision projection. Customer-submitted identity/content remains immutable.
alter table public.warranty_claims
  add column decided_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column decision_reason text,
  add column customer_decision_message text,
  add column decided_at timestamptz;

alter table public.warranty_claims
  add constraint warranty_claims_decision_reason_shape
    check (
      decision_reason is null
      or (
        decision_reason = btrim(decision_reason)
        and char_length(decision_reason) between 5 and 1000
      )
    ),
  add constraint warranty_claims_customer_decision_message_shape
    check (
      customer_decision_message is null
      or (
        customer_decision_message = btrim(customer_decision_message)
        and char_length(customer_decision_message) between 5 and 1000
      )
    ),
  add constraint warranty_claims_decision_projection_shape
    check (
      (
        status in ('submitted', 'under_review', 'awaiting_inspection')
        and decided_by_profile_id is null
        and decision_reason is null
        and customer_decision_message is null
        and decided_at is null
      )
      or (
        status in ('approved', 'rejected', 'cancelled')
        and decided_by_profile_id is not null
        and decision_reason is not null
        and customer_decision_message is not null
        and decided_at is not null
        and decided_at >= submitted_at
      )
    );

-- One formal inspection maximum per Claim. Reassignment changes only the assigned
-- Center while the inspection remains requested; it never creates another row.
create table public.warranty_claim_inspections (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.warranty_claims(id) on delete restrict,
  status text not null default 'requested',
  assigned_center_party_id uuid not null references public.operational_parties(id) on delete restrict,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null,
  submitted_by_profile_id uuid references public.profiles(id) on delete restrict,
  technical_observation text,
  suspected_cause text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranty_claim_inspections_status_allowed
    check (status in ('requested', 'submitted')),
  constraint warranty_claim_inspections_observation_shape
    check (
      technical_observation is null
      or (
        technical_observation = btrim(technical_observation)
        and char_length(technical_observation) between 10 and 3000
      )
    ),
  constraint warranty_claim_inspections_suspected_cause_shape
    check (
      suspected_cause is null
      or (
        suspected_cause = btrim(suspected_cause)
        and char_length(suspected_cause) between 2 and 1000
      )
    ),
  constraint warranty_claim_inspections_state_shape
    check (
      (
        status = 'requested'
        and submitted_by_profile_id is null
        and technical_observation is null
        and suspected_cause is null
        and submitted_at is null
      )
      or (
        status = 'submitted'
        and submitted_by_profile_id is not null
        and technical_observation is not null
        and submitted_at is not null
        and submitted_at >= requested_at
      )
    ),
  constraint warranty_claim_inspections_timestamp_shape
    check (requested_at >= created_at and updated_at >= created_at)
);

create index warranty_claim_inspections_center_pending_idx
  on public.warranty_claim_inspections (assigned_center_party_id, requested_at, id)
  where status = 'requested';

-- Inspection evidence remains private and append-only. Storage objects live in the
-- existing warranty-claim-evidence bucket; Q adds only dedicated durable metadata.
create table public.warranty_claim_inspection_evidence (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.warranty_claim_inspections(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint warranty_claim_inspection_evidence_path_shape
    check (
      storage_path = btrim(storage_path)
      and char_length(storage_path) between 3 and 500
    ),
  constraint warranty_claim_inspection_evidence_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint warranty_claim_inspection_evidence_size_allowed
    check (size_bytes > 0 and size_bytes <= 8388608)
);

create index warranty_claim_inspection_evidence_inspection_idx
  on public.warranty_claim_inspection_evidence (inspection_id, created_at, id);

-- Q creates only the minimal durable handoff to R. No remedy, performing Center,
-- Roll, Transfer, finance or completion columns belong in Cube Q.
create table public.warranty_claim_resolutions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.warranty_claims(id) on delete restrict,
  status text not null default 'authorized',
  authorized_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  authorized_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranty_claim_resolutions_q_status_allowed
    check (status = 'authorized'),
  constraint warranty_claim_resolutions_timestamp_shape
    check (authorized_at >= created_at and updated_at >= created_at)
);

-- Extend P's Claim-domain event catalog. The event stream is immutable audit truth;
-- current Claim decision columns remain only the current operational projection.
alter table public.warranty_claim_events
  drop constraint warranty_claim_events_kind_allowed,
  drop constraint warranty_claim_events_actor_shape,
  drop constraint warranty_claim_events_reason_shape;

alter table public.warranty_claim_events
  add constraint warranty_claim_events_kind_allowed
    check (event_kind in (
      'submitted',
      'review_started',
      'inspection_requested',
      'inspection_reassigned',
      'inspection_submitted',
      'approved',
      'rejected',
      'cancelled',
      'approval_cancelled_before_execution',
      'decision_reopened_for_correction'
    )),
  add constraint warranty_claim_events_actor_shape
    check (
      (
        event_kind = 'submitted'
        and actor_profile_id is null
        and actor_kind = 'customer_verified_phone'
      )
      or (
        event_kind = 'inspection_submitted'
        and actor_profile_id is not null
        and actor_kind = 'center'
      )
      or (
        event_kind in (
          'review_started',
          'inspection_requested',
          'inspection_reassigned',
          'approved',
          'rejected',
          'cancelled',
          'approval_cancelled_before_execution',
          'decision_reopened_for_correction'
        )
        and actor_profile_id is not null
        and actor_kind = 'admin'
      )
    ),
  add constraint warranty_claim_events_reason_shape
    check (
      (
        event_kind in ('submitted', 'review_started', 'inspection_requested', 'inspection_submitted')
        and reason is null
      )
      or (
        event_kind in ('inspection_reassigned', 'decision_reopened_for_correction')
        and reason is not null
        and reason = btrim(reason)
        and char_length(reason) between 5 and 500
      )
      or (
        event_kind in ('approved', 'rejected', 'cancelled', 'approval_cancelled_before_execution')
        and reason is not null
        and reason = btrim(reason)
        and char_length(reason) between 5 and 1000
      )
    );

-- Replace P's total mutation denial with a structural lifecycle guard. Direct table
-- writes remain ungranted; Q's named SECURITY DEFINER operations are the write API.
drop trigger warranty_claims_guard_mutation on public.warranty_claims;
drop function private.guard_warranty_claim_mutation();

create function private.guard_warranty_claim_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.warranty_id is distinct from old.warranty_id
    or new.claim_number is distinct from old.claim_number
    or new.category is distinct from old.category
    or new.affected_area is distinct from old.affected_area
    or new.description is distinct from old.description
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IDENTITY_IMMUTABLE';
  end if;

  if not (
    (old.status = 'submitted' and new.status = 'under_review')
    or (old.status = 'under_review' and new.status in ('awaiting_inspection', 'approved', 'rejected', 'cancelled'))
    or (old.status = 'awaiting_inspection' and new.status in ('under_review', 'cancelled'))
    or (old.status = 'approved' and new.status = 'cancelled')
    or (old.status in ('rejected', 'cancelled') and new.status = 'under_review')
  ) then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INVALID_TRANSITION';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_UPDATED_AT_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_warranty_claim_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claims_guard_mutation
  before update or delete on public.warranty_claims
  for each row execute function private.guard_warranty_claim_mutation();

-- Inspection identity and submitted evidence are immutable. The only update shapes
-- are pending reassignment or one requested -> submitted transition.
create function private.guard_warranty_claim_inspection_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.claim_id is distinct from old.claim_id
    or new.requested_by_profile_id is distinct from old.requested_by_profile_id
    or new.requested_at is distinct from old.requested_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_IDENTITY_IMMUTABLE';
  end if;

  if old.status <> 'requested' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_TERMINAL';
  end if;

  if new.status = 'requested' then
    if new.assigned_center_party_id is not distinct from old.assigned_center_party_id
      or new.submitted_by_profile_id is not null
      or new.technical_observation is not null
      or new.suspected_cause is not null
      or new.submitted_at is not null
    then
      raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_INVALID_REASSIGNMENT';
    end if;
  elsif new.status = 'submitted' then
    if new.assigned_center_party_id is distinct from old.assigned_center_party_id
      or new.submitted_by_profile_id is null
      or new.technical_observation is null
      or new.submitted_at is null
    then
      raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_INVALID_SUBMISSION';
    end if;
  else
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_INVALID_TRANSITION';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using errcode = '42501', message = 'PG_CLAIM_INSPECTION_UPDATED_AT_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_warranty_claim_inspection_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_inspections_guard_mutation
  before update or delete on public.warranty_claim_inspections
  for each row execute function private.guard_warranty_claim_inspection_mutation();

create function private.reject_warranty_claim_q_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_CLAIM_Q_HISTORY_IMMUTABLE';
end;
$$;

revoke all on function private.reject_warranty_claim_q_append_only_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_inspection_evidence_immutable
  before update or delete on public.warranty_claim_inspection_evidence
  for each row execute function private.reject_warranty_claim_q_append_only_mutation();

create trigger warranty_claim_resolutions_q_immutable
  before update or delete on public.warranty_claim_resolutions
  for each row execute function private.reject_warranty_claim_q_append_only_mutation();

alter table public.warranty_claim_inspections enable row level security;
alter table public.warranty_claim_inspection_evidence enable row level security;
alter table public.warranty_claim_resolutions enable row level security;

-- Q exposes no direct table write surface. Professional reads and every mutation are
-- added as explicit bounded functions in later increments.
revoke all on table public.warranty_claim_inspections
  from public, anon, authenticated, service_role;
revoke all on table public.warranty_claim_inspection_evidence
  from public, anon, authenticated, service_role;
revoke all on table public.warranty_claim_resolutions
  from public, anon, authenticated, service_role;

comment on table public.warranty_claim_inspections is
  'Cube Q single formal technical inspection per Claim. Center supplies evidence only; Protection Giants Admin retains decision authority.';
comment on table public.warranty_claim_inspection_evidence is
  'Cube Q immutable private metadata for formal Center inspection images stored in warranty-claim-evidence.';
comment on table public.warranty_claim_resolutions is
  'Cube Q minimal one-to-one authorized handoff created only by Claim approval. Cube R extends execution state without changing adjudication.';