-- Cube P — Customer Warranty Claim Intake, increment 1
-- Durable Claim identity/state foundation, immutable customer evidence metadata,
-- private Storage bucket and direct-mutation denial. Customer verification and
-- authoritative intake RPCs follow in the next bounded increment.

create sequence private.warranty_claim_number_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no maxvalue
  no cycle;

revoke all on sequence private.warranty_claim_number_seq
  from public, anon, authenticated, service_role;

comment on sequence private.warranty_claim_number_seq is
  'Cube P monotonic Claim Number source. Values are never recycled; gaps are acceptable.';

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  warranty_id uuid not null references public.warranties(id) on delete restrict,
  claim_number text not null unique,
  category text not null,
  affected_area text not null,
  description text not null,
  status text not null default 'submitted',
  submitted_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranty_claims_number_format
    check (claim_number ~ '^PG-C-[0-9]{8,}$'),
  constraint warranty_claims_category_allowed
    check (category in (
      'cracking',
      'yellowing',
      'discoloration',
      'peeling',
      'delamination',
      'adhesive_issue',
      'bubbling',
      'other'
    )),
  constraint warranty_claims_affected_area_shape
    check (
      affected_area = btrim(affected_area)
      and char_length(affected_area) between 2 and 160
    ),
  constraint warranty_claims_description_shape
    check (
      description = btrim(description)
      and char_length(description) between 10 and 3000
    ),
  constraint warranty_claims_status_allowed
    check (status in (
      'submitted',
      'under_review',
      'awaiting_inspection',
      'approved',
      'rejected',
      'cancelled'
    )),
  constraint warranty_claims_state_shape
    check (
      (status in ('submitted', 'under_review', 'awaiting_inspection') and closed_at is null)
      or (status in ('rejected', 'cancelled') and closed_at is not null)
      or status = 'approved'
    ),
  constraint warranty_claims_closed_at_shape
    check (closed_at is null or closed_at >= submitted_at),
  constraint warranty_claims_timestamp_shape
    check (updated_at >= created_at and submitted_at >= created_at)
);

create unique index warranty_claims_one_open_per_warranty_idx
  on public.warranty_claims (warranty_id)
  where closed_at is null;

create index warranty_claims_warranty_recent_idx
  on public.warranty_claims (warranty_id, submitted_at desc, id desc);

create index warranty_claims_admin_future_queue_idx
  on public.warranty_claims (status, submitted_at, id)
  where closed_at is null;

create table public.warranty_claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.warranty_claims(id) on delete restrict,
  action_request_id uuid not null unique,
  event_kind text not null,
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_kind text not null,
  reason text,
  event_data jsonb,
  created_at timestamptz not null default now(),

  constraint warranty_claim_events_kind_allowed
    check (event_kind = 'submitted'),
  constraint warranty_claim_events_actor_shape
    check (
      event_kind = 'submitted'
      and actor_profile_id is null
      and actor_kind = 'customer_verified_phone'
    ),
  constraint warranty_claim_events_reason_shape
    check (event_kind = 'submitted' and reason is null),
  constraint warranty_claim_events_data_shape
    check (
      event_data is null
      or (
        jsonb_typeof(event_data) = 'object'
        and event_data <> '{}'::jsonb
      )
    )
);

create unique index warranty_claim_events_one_submission_idx
  on public.warranty_claim_events (claim_id)
  where event_kind = 'submitted';

create index warranty_claim_events_claim_timeline_idx
  on public.warranty_claim_events (claim_id, created_at, id);

create table public.warranty_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.warranty_claims(id) on delete restrict,
  evidence_kind text not null default 'customer_submission',
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),

  constraint warranty_claim_evidence_kind_allowed
    check (evidence_kind = 'customer_submission'),
  constraint warranty_claim_evidence_path_shape
    check (
      storage_path = btrim(storage_path)
      and char_length(storage_path) between 3 and 500
    ),
  constraint warranty_claim_evidence_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint warranty_claim_evidence_size_allowed
    check (size_bytes > 0 and size_bytes <= 8388608)
);

create index warranty_claim_evidence_claim_idx
  on public.warranty_claim_evidence (claim_id, created_at, id);

comment on table public.warranty_claims is
  'Cube P durable customer Warranty Claim. Claim identity/intake facts are immutable in P; later Q/R migrations own named status/closure transitions.';
comment on table public.warranty_claim_events is
  'Cube P append-only Claim timeline foundation. P emits only customer_verified_phone submitted events; Q/R extend the event catalog later.';
comment on table public.warranty_claim_evidence is
  'Cube P immutable metadata for required private customer Claim images stored in Supabase Storage.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'warranty-claim-evidence',
  'warranty-claim-evidence',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- P itself has no Claim-state mutation. Q will replace this bounded guard with
-- its named reviewed transitions while preserving identity/intake immutability.
create function private.guard_warranty_claim_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_CLAIM_IMMUTABLE';
  end if;

  raise exception using errcode = '42501', message = 'PG_CLAIM_P_STATE_IMMUTABLE';
end;
$$;

revoke all on function private.guard_warranty_claim_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claims_guard_mutation
  before update or delete on public.warranty_claims
  for each row execute function private.guard_warranty_claim_mutation();

create function private.reject_warranty_claim_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_CLAIM_HISTORY_IMMUTABLE';
end;
$$;

revoke all on function private.reject_warranty_claim_append_only_mutation()
  from public, anon, authenticated, service_role;

create trigger warranty_claim_events_immutable
  before update or delete on public.warranty_claim_events
  for each row execute function private.reject_warranty_claim_append_only_mutation();

create trigger warranty_claim_evidence_immutable
  before update or delete on public.warranty_claim_evidence
  for each row execute function private.reject_warranty_claim_append_only_mutation();

alter table public.warranty_claims enable row level security;
alter table public.warranty_claim_events enable row level security;
alter table public.warranty_claim_evidence enable row level security;

-- P intentionally exposes no direct Claim table surface to anon/authenticated,
-- Centers, Dealers or Agents. Server-only service-role RPCs added in P2 are the
-- customer boundary; Q later adds its professional Admin read model.
revoke all on table public.warranty_claims
  from public, anon, authenticated, service_role;
revoke all on table public.warranty_claim_events
  from public, anon, authenticated, service_role;
revoke all on table public.warranty_claim_evidence
  from public, anon, authenticated, service_role;
