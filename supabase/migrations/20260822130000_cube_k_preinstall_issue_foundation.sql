-- Cube K — Pre-install Roll Issue Reporting
-- Bounded issue lifecycle after immutable Roll Opening and before Warranty Activation.

create table public.roll_preinstall_issues (
  id uuid primary key,
  request_id uuid not null unique,
  roll_id uuid not null references public.rolls(id) on delete restrict,
  reported_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  reporting_center_party_id uuid not null references public.operational_parties(id) on delete restrict,
  category text not null,
  description text not null,
  status text not null default 'submitted',
  resolved_by_profile_id uuid references public.profiles(id) on delete restrict,
  resolution_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),

  constraint roll_preinstall_issues_category_allowed
    check (category in ('manufacturing_defect', 'physical_damage', 'contamination_or_packaging', 'other')),
  constraint roll_preinstall_issues_description_length
    check (description = btrim(description) and char_length(description) between 10 and 2000),
  constraint roll_preinstall_issues_status_allowed
    check (status in ('submitted', 'cleared_for_use', 'return_required', 'reported_in_error')),
  constraint roll_preinstall_issues_resolution_shape
    check (
      (status = 'submitted' and resolved_by_profile_id is null and resolution_reason is null and resolved_at is null)
      or (
        status in ('cleared_for_use', 'return_required', 'reported_in_error')
        and resolved_by_profile_id is not null
        and resolution_reason is not null
        and char_length(btrim(resolution_reason)) between 5 and 500
        and resolved_at is not null
      )
    )
);

create unique index roll_preinstall_issues_one_submitted_per_roll_idx
  on public.roll_preinstall_issues (roll_id)
  where status = 'submitted';

create index roll_preinstall_issues_center_recent_idx
  on public.roll_preinstall_issues (reporting_center_party_id, created_at desc, id);

create index roll_preinstall_issues_admin_queue_idx
  on public.roll_preinstall_issues (status, created_at, id);

create table public.roll_preinstall_issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.roll_preinstall_issues(id) on delete restrict,
  action_request_id uuid not null unique,
  event_kind text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),

  constraint roll_preinstall_issue_events_kind_allowed
    check (event_kind in ('submitted', 'cleared_for_use', 'return_required', 'reported_in_error')),
  constraint roll_preinstall_issue_events_reason_shape
    check (
      (event_kind = 'submitted' and reason is null)
      or (
        event_kind in ('cleared_for_use', 'return_required', 'reported_in_error')
        and reason is not null
        and char_length(btrim(reason)) between 5 and 500
      )
    )
);

create index roll_preinstall_issue_events_issue_timeline_idx
  on public.roll_preinstall_issue_events (issue_id, created_at, id);

create table public.roll_preinstall_issue_evidence (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.roll_preinstall_issues(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint roll_preinstall_issue_evidence_path_length
    check (char_length(storage_path) between 3 and 500),
  constraint roll_preinstall_issue_evidence_mime_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint roll_preinstall_issue_evidence_size_allowed
    check (size_bytes > 0 and size_bytes <= 8388608)
);

create index roll_preinstall_issue_evidence_issue_idx
  on public.roll_preinstall_issue_evidence (issue_id, created_at, id);

comment on table public.roll_preinstall_issues is
  'Cube K auditable pre-install issue for an already-opened Roll. submitted creates an immediate Warranty Activation hold; terminal states are immutable.';
comment on table public.roll_preinstall_issue_events is
  'Cube K immutable issue timeline and idempotency evidence for submission/resolution actions.';
comment on table public.roll_preinstall_issue_evidence is
  'Cube K immutable metadata for optional private image evidence stored in Supabase Storage.';

-- Private issue-evidence bucket. Object mutation remains server-only through the
-- Storage API; authenticated users receive no direct Storage object policy here.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'roll-preinstall-issue-evidence',
  'roll-preinstall-issue-evidence',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Issue identity is immutable. The only allowed update shape is one transition
-- from submitted to one terminal status with a complete resolution snapshot.
create function private.guard_roll_preinstall_issue_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.request_id is distinct from old.request_id
    or new.roll_id is distinct from old.roll_id
    or new.reported_by_profile_id is distinct from old.reported_by_profile_id
    or new.reporting_center_party_id is distinct from old.reporting_center_party_id
    or new.category is distinct from old.category
    or new.description is distinct from old.description
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_IDENTITY_IMMUTABLE';
  end if;

  if old.status <> 'submitted'
    or new.status not in ('cleared_for_use', 'return_required', 'reported_in_error')
    or new.status = old.status
    or new.resolved_by_profile_id is null
    or new.resolution_reason is null
    or char_length(btrim(new.resolution_reason)) < 5
    or char_length(btrim(new.resolution_reason)) > 500
    or new.resolved_at is null
  then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_INVALID_TRANSITION';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_roll_preinstall_issue_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_preinstall_issues_guard_mutation
  before update or delete on public.roll_preinstall_issues
  for each row execute function private.guard_roll_preinstall_issue_mutation();

create function private.reject_roll_preinstall_issue_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_HISTORY_IMMUTABLE';
end;
$$;

revoke all on function private.reject_roll_preinstall_issue_append_only_mutation()
  from public, anon, authenticated, service_role;

create trigger roll_preinstall_issue_events_immutable
  before update or delete on public.roll_preinstall_issue_events
  for each row execute function private.reject_roll_preinstall_issue_append_only_mutation();

create trigger roll_preinstall_issue_evidence_immutable
  before update or delete on public.roll_preinstall_issue_evidence
  for each row execute function private.reject_roll_preinstall_issue_append_only_mutation();

alter table public.roll_preinstall_issues enable row level security;
alter table public.roll_preinstall_issue_events enable row level security;
alter table public.roll_preinstall_issue_evidence enable row level security;

revoke all on table public.roll_preinstall_issues from public, anon, authenticated, service_role;
revoke all on table public.roll_preinstall_issue_events from public, anon, authenticated, service_role;
revoke all on table public.roll_preinstall_issue_evidence from public, anon, authenticated, service_role;

grant select on table public.roll_preinstall_issues to authenticated;
grant select on table public.roll_preinstall_issue_events to authenticated;
grant select on table public.roll_preinstall_issue_evidence to authenticated;

create policy "roll_preinstall_issues_admin_read"
on public.roll_preinstall_issues
for select
to authenticated
using ((select private.is_active_admin()));

create policy "roll_preinstall_issues_reporting_center_read"
on public.roll_preinstall_issues
for select
to authenticated
using (
  reporting_center_party_id = (select private.current_active_operational_party_id())
);

create policy "roll_preinstall_issue_events_admin_read"
on public.roll_preinstall_issue_events
for select
to authenticated
using (
  (select private.is_active_admin())
  or exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.id = roll_preinstall_issue_events.issue_id
      and issue.reporting_center_party_id = (select private.current_active_operational_party_id())
  )
);

create policy "roll_preinstall_issue_evidence_admin_read"
on public.roll_preinstall_issue_evidence
for select
to authenticated
using (
  (select private.is_active_admin())
  or exists (
    select 1
    from public.roll_preinstall_issues issue
    where issue.id = roll_preinstall_issue_evidence.issue_id
      and issue.reporting_center_party_id = (select private.current_active_operational_party_id())
  )
);

create function public.resolve_roll_preinstall_issue_candidate(p_roll_serial text)
returns table (
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  opened_at timestamptz,
  center_name text,
  eligibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_actor_role text;
  v_center_party_id uuid;
  v_serial text;
  v_roll_id uuid;
  v_production_status text;
  v_custodian_party_id uuid;
begin
  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_SERIAL_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_role := v_actor ->> 'role';
  v_center_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role <> 'center' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_REQUIRED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_center_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_INACTIVE';
  end if;

  select r.id, po.status, custody.custodian_party_id
    into v_roll_id, v_production_status, v_custodian_party_id
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.roll_custody_current custody on custody.roll_id = r.id
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_ROLL_NOT_FOUND';
  end if;

  if v_production_status <> 'generated' then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_PRODUCTION_INVALID';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN';
  end if;

  if not exists (select 1 from public.roll_openings opening where opening.roll_id = v_roll_id) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ROLL_NOT_OPENED';
  end if;

  return query
  select
    r.id,
    r.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    opening.opened_at,
    coalesce(center_entity.name, 'مركز تركيب')::text,
    case
      when exists (
        select 1 from public.roll_preinstall_issues issue
        where issue.roll_id = r.id and issue.status = 'return_required'
      ) then 'return_required'
      when exists (
        select 1 from public.roll_preinstall_issues issue
        where issue.roll_id = r.id and issue.status = 'submitted'
      ) then 'active_issue'
      else 'eligible'
    end::text
  from public.rolls r
  join public.production_orders po on po.id = r.production_order_id
  join public.production_lots lot on lot.id = r.production_lot_id
  join public.roll_openings opening on opening.roll_id = r.id
  join public.operational_parties center_party on center_party.id = v_center_party_id
  left join public.installation_centers center_entity on center_entity.id = center_party.installation_center_id
  where r.id = v_roll_id;
end;
$$;

revoke all on function public.resolve_roll_preinstall_issue_candidate(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_roll_preinstall_issue_candidate(text)
  to authenticated;

create function public.create_roll_preinstall_issue(
  p_request_id uuid,
  p_issue_id uuid,
  p_roll_serial text,
  p_category text,
  p_description text,
  p_evidence_paths text[] default '{}'::text[]
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
  v_center_party_id uuid;
  v_serial text;
  v_category text;
  v_description text;
  v_roll_id uuid;
  v_production_order_id uuid;
  v_custodian_party_id uuid;
  v_existing public.roll_preinstall_issues%rowtype;
  v_existing_paths text[];
  v_input_paths text[];
  v_path text;
  v_object_metadata jsonb;
  v_mime text;
  v_size bigint;
begin
  if p_request_id is null or p_issue_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_REQUEST_ID_REQUIRED';
  end if;

  v_serial := upper(btrim(coalesce(p_roll_serial, '')));
  if v_serial !~ '^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$' then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_SERIAL_INVALID';
  end if;

  v_category := btrim(coalesce(p_category, ''));
  if v_category not in ('manufacturing_defect', 'physical_damage', 'contamination_or_packaging', 'other') then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_CATEGORY';
  end if;

  v_description := btrim(coalesce(p_description, ''));
  if char_length(v_description) < 10 or char_length(v_description) > 2000 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_DESCRIPTION';
  end if;

  if coalesce(cardinality(p_evidence_paths), 0) > 5 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
  end if;

  select coalesce(array_agg(path order by path), '{}'::text[])
    into v_input_paths
  from (
    select distinct path
    from unnest(coalesce(p_evidence_paths, '{}'::text[])) as evidence(path)
  ) deduped;

  if cardinality(v_input_paths) <> coalesce(cardinality(p_evidence_paths), 0) then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_role := v_actor ->> 'role';
  v_center_party_id := (v_actor ->> 'party_id')::uuid;

  if v_actor_role <> 'center' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_REQUIRED';
  end if;

  if not private.lock_transfer_party_lifecycle(v_center_party_id) then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_CENTER_INACTIVE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));

  select r.id, r.production_order_id
    into v_roll_id, v_production_order_id
  from public.rolls r
  where r.serial_number = v_serial;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_ROLL_NOT_FOUND';
  end if;

  select * into v_existing
  from public.roll_preinstall_issues issue
  where issue.request_id = p_request_id;

  if found then
    select coalesce(array_agg(e.storage_path order by e.storage_path), '{}'::text[])
      into v_existing_paths
    from public.roll_preinstall_issue_evidence e
    where e.issue_id = v_existing.id;

    if v_existing.id <> p_issue_id
      or v_existing.roll_id <> v_roll_id
      or v_existing.reported_by_profile_id <> v_actor_profile_id
      or v_existing.reporting_center_party_id <> v_center_party_id
      or v_existing.category <> v_category
      or v_existing.description <> v_description
      or v_existing_paths is distinct from v_input_paths
    then
      raise exception using errcode = '23505', message = 'PG_ROLL_ISSUE_REQUEST_CONFLICT';
    end if;

    return v_existing.id;
  end if;

  -- Match Cube J lock order: Production Order -> current custody. This gives
  -- submission/Recovery and later submission/Activation one durable winner.
  perform 1
  from public.production_orders po
  where po.id = v_production_order_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_PRODUCTION_MISSING';
  end if;

  if exists (
    select 1 from public.production_orders po
    where po.id = v_production_order_id and po.status <> 'generated'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_PRODUCTION_INVALID';
  end if;

  select custody.custodian_party_id
    into v_custodian_party_id
  from public.roll_custody_current custody
  where custody.roll_id = v_roll_id
  for update;

  if not found then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_CUSTODY_MISSING';
  end if;

  if v_custodian_party_id <> v_center_party_id then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN';
  end if;

  if not exists (select 1 from public.roll_openings opening where opening.roll_id = v_roll_id) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ROLL_NOT_OPENED';
  end if;

  if exists (
    select 1 from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id and issue.status = 'return_required'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY';
  end if;

  if exists (
    select 1 from public.roll_preinstall_issues issue
    where issue.roll_id = v_roll_id and issue.status = 'submitted'
  ) then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS';
  end if;

  foreach v_path in array v_input_paths loop
    if v_path !~ ('^' || p_issue_id::text || '/[0-9]+-[0-9a-f]{64}\.(jpg|png|webp)$') then
      raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
    end if;

    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'roll-preinstall-issue-evidence'
      and object.name = v_path;

    if not found then
      raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
    end if;

    v_mime := coalesce(v_object_metadata ->> 'mimetype', '');
    v_size := coalesce((v_object_metadata ->> 'size')::bigint, 0);

    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or v_size < 1
      or v_size > 8388608
    then
      raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_EVIDENCE';
    end if;
  end loop;

  insert into public.roll_preinstall_issues (
    id,
    request_id,
    roll_id,
    reported_by_profile_id,
    reporting_center_party_id,
    category,
    description
  ) values (
    p_issue_id,
    p_request_id,
    v_roll_id,
    v_actor_profile_id,
    v_center_party_id,
    v_category,
    v_description
  );

  insert into public.roll_preinstall_issue_events (
    issue_id,
    action_request_id,
    event_kind,
    actor_profile_id
  ) values (
    p_issue_id,
    p_request_id,
    'submitted',
    v_actor_profile_id
  );

  foreach v_path in array v_input_paths loop
    select object.metadata
      into v_object_metadata
    from storage.objects object
    where object.bucket_id = 'roll-preinstall-issue-evidence'
      and object.name = v_path;

    insert into public.roll_preinstall_issue_evidence (
      issue_id,
      storage_path,
      mime_type,
      size_bytes,
      uploaded_by_profile_id
    ) values (
      p_issue_id,
      v_path,
      v_object_metadata ->> 'mimetype',
      (v_object_metadata ->> 'size')::bigint,
      v_actor_profile_id
    );
  end loop;

  return p_issue_id;
exception
  when unique_violation then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS';
end;
$$;

revoke all on function public.create_roll_preinstall_issue(uuid, uuid, text, text, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_roll_preinstall_issue(uuid, uuid, text, text, text, text[])
  to authenticated;

create function public.resolve_roll_preinstall_issue(
  p_request_id uuid,
  p_issue_id uuid,
  p_outcome text,
  p_reason text
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
  v_outcome text;
  v_reason text;
  v_existing_event public.roll_preinstall_issue_events%rowtype;
  v_issue public.roll_preinstall_issues%rowtype;
begin
  if p_request_id is null or p_issue_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_REQUEST_ID_REQUIRED';
  end if;

  v_outcome := btrim(coalesce(p_outcome, ''));
  if v_outcome not in ('cleared_for_use', 'return_required') then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_INVALID_OUTCOME';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_role := v_actor ->> 'role';

  if v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_ADMIN_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));

  select * into v_existing_event
  from public.roll_preinstall_issue_events event
  where event.action_request_id = p_request_id;

  if found then
    if v_existing_event.issue_id <> p_issue_id
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.event_kind <> v_outcome
      or v_existing_event.reason is distinct from v_reason
    then
      raise exception using errcode = '23505', message = 'PG_ROLL_ISSUE_REQUEST_CONFLICT';
    end if;
    return p_issue_id;
  end if;

  select * into v_issue
  from public.roll_preinstall_issues issue
  where issue.id = p_issue_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_NOT_FOUND';
  end if;

  if v_issue.status <> 'submitted' then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ALREADY_RESOLVED';
  end if;

  update public.roll_preinstall_issues
  set
    status = v_outcome,
    resolved_by_profile_id = v_actor_profile_id,
    resolution_reason = v_reason,
    resolved_at = now()
  where id = p_issue_id;

  insert into public.roll_preinstall_issue_events (
    issue_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason
  ) values (
    p_issue_id,
    p_request_id,
    v_outcome,
    v_actor_profile_id,
    v_reason
  );

  return p_issue_id;
end;
$$;

revoke all on function public.resolve_roll_preinstall_issue(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_roll_preinstall_issue(uuid, uuid, text, text)
  to authenticated;

create function public.mark_roll_preinstall_issue_reported_in_error(
  p_request_id uuid,
  p_issue_id uuid,
  p_reason text
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
  v_reason text;
  v_existing_event public.roll_preinstall_issue_events%rowtype;
  v_issue public.roll_preinstall_issues%rowtype;
begin
  if p_request_id is null or p_issue_id is null then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_REQUEST_ID_REQUIRED';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_actor_profile_id := (v_actor ->> 'profile_id')::uuid;
  v_actor_role := v_actor ->> 'role';

  if v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_ADMIN_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));

  select * into v_existing_event
  from public.roll_preinstall_issue_events event
  where event.action_request_id = p_request_id;

  if found then
    if v_existing_event.issue_id <> p_issue_id
      or v_existing_event.actor_profile_id <> v_actor_profile_id
      or v_existing_event.event_kind <> 'reported_in_error'
      or v_existing_event.reason is distinct from v_reason
    then
      raise exception using errcode = '23505', message = 'PG_ROLL_ISSUE_REQUEST_CONFLICT';
    end if;
    return p_issue_id;
  end if;

  select * into v_issue
  from public.roll_preinstall_issues issue
  where issue.id = p_issue_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_NOT_FOUND';
  end if;

  if v_issue.status <> 'submitted' then
    raise exception using errcode = '23514', message = 'PG_ROLL_ISSUE_ALREADY_RESOLVED';
  end if;

  update public.roll_preinstall_issues
  set
    status = 'reported_in_error',
    resolved_by_profile_id = v_actor_profile_id,
    resolution_reason = v_reason,
    resolved_at = now()
  where id = p_issue_id;

  insert into public.roll_preinstall_issue_events (
    issue_id,
    action_request_id,
    event_kind,
    actor_profile_id,
    reason
  ) values (
    p_issue_id,
    p_request_id,
    'reported_in_error',
    v_actor_profile_id,
    v_reason
  );

  return p_issue_id;
end;
$$;

revoke all on function public.mark_roll_preinstall_issue_reported_in_error(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_roll_preinstall_issue_reported_in_error(uuid, uuid, text)
  to authenticated;

-- Read model for Center own history and Admin Company queue.
create function public.list_roll_preinstall_issues(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  issue_id uuid,
  roll_id uuid,
  serial_number text,
  lot_number text,
  product_code text,
  product_name text,
  center_name text,
  category text,
  description text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text,
  evidence_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_role text;
  v_party_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = '22023', message = 'PG_ROLL_ISSUE_LIST_PAGING_INVALID';
  end if;

  v_actor := private.lock_transfer_actor_context();
  v_role := v_actor ->> 'role';
  v_party_id := (v_actor ->> 'party_id')::uuid;

  if v_role not in ('admin', 'center') then
    raise exception using errcode = '42501', message = 'PG_ROLL_ISSUE_FORBIDDEN';
  end if;

  return query
  select
    issue.id,
    issue.roll_id,
    roll.serial_number,
    lot.lot_number,
    po.product_code_snapshot,
    po.product_name_snapshot,
    coalesce(center_entity.name, 'مركز تركيب')::text,
    issue.category,
    issue.description,
    issue.status,
    issue.created_at,
    issue.resolved_at,
    issue.resolution_reason,
    count(evidence.id)::integer
  from public.roll_preinstall_issues issue
  join public.rolls roll on roll.id = issue.roll_id
  join public.production_lots lot on lot.id = roll.production_lot_id
  join public.production_orders po on po.id = roll.production_order_id
  join public.operational_parties center_party on center_party.id = issue.reporting_center_party_id
  left join public.installation_centers center_entity on center_entity.id = center_party.installation_center_id
  left join public.roll_preinstall_issue_evidence evidence on evidence.issue_id = issue.id
  where v_role = 'admin' or issue.reporting_center_party_id = v_party_id
  group by issue.id, roll.id, lot.id, po.id, center_entity.id
  order by (issue.status = 'submitted') desc, issue.created_at desc, issue.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.list_roll_preinstall_issues(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_roll_preinstall_issues(integer, integer)
  to authenticated;

-- Recovery remains the only custody-movement path, but it cannot outrun a
-- pending Company quality decision. Because create issue and Recovery both lock
-- Production Order -> current custody before reservation insertion, this trigger
-- also closes the submission-vs-Recovery race without adding another engine.
create function private.guard_pending_issue_opened_roll_recovery()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transfer_kind text;
begin
  select transfer.transfer_kind
    into v_transfer_kind
  from public.roll_transfers transfer
  where transfer.id = new.transfer_id;

  if v_transfer_kind = 'opened_roll_recovery'
    and exists (
      select 1
      from public.roll_preinstall_issues issue
      where issue.roll_id = new.roll_id
        and issue.status = 'submitted'
    )
  then
    raise exception using errcode = '23514', message = 'PG_ROLL_RECOVERY_ISSUE_PENDING';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_pending_issue_opened_roll_recovery()
  from public, anon, authenticated, service_role;

create trigger roll_transfer_reservations_pending_issue_recovery_guard
  before insert on public.roll_transfer_reservations
  for each row execute function private.guard_pending_issue_opened_roll_recovery();

comment on function public.create_roll_preinstall_issue(uuid, uuid, text, text, text, text[]) is
  'Cube K Center-only atomic issue submission for an opened Roll currently held by the Center. Optional evidence paths must already exist in the dedicated private Storage bucket.';
comment on function public.resolve_roll_preinstall_issue(uuid, uuid, text, text) is
  'Cube K Admin-only immutable quality resolution to cleared_for_use or return_required.';
comment on function public.mark_roll_preinstall_issue_reported_in_error(uuid, uuid, text) is
  'Cube K Admin-only audited correction for a report created in error.';
