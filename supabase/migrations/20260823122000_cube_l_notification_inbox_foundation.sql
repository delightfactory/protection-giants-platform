-- Cube L — Notification Foundation, increment 1
-- Durable per-Profile Inbox state only. Push subscriptions/outbox and PWA are
-- deliberately deferred to later Cube L increments.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  source_domain text not null,
  source_event_key text not null,
  attention_level text not null,
  title text not null,
  body text not null,
  action_path text,
  push_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint notifications_event_type_shape
    check (event_type = btrim(event_type) and char_length(event_type) between 1 and 80),
  constraint notifications_source_domain_shape
    check (source_domain = btrim(source_domain) and char_length(source_domain) between 1 and 80),
  constraint notifications_source_event_key_shape
    check (source_event_key = btrim(source_event_key) and char_length(source_event_key) between 1 and 200),
  constraint notifications_attention_level_allowed
    check (attention_level in ('info', 'action_required', 'warning')),
  constraint notifications_title_shape
    check (title = btrim(title) and char_length(title) between 1 and 120),
  constraint notifications_body_shape
    check (body = btrim(body) and char_length(body) between 1 and 300),
  constraint notifications_action_path_shape
    check (
      action_path is null
      or (
        action_path = btrim(action_path)
        and char_length(action_path) between 1 and 500
        and left(action_path, 1) = '/'
        and left(action_path, 2) <> '//'
        and position('://' in action_path) = 0
      )
    ),
  constraint notifications_read_at_shape
    check (read_at is null or read_at >= created_at),
  constraint notifications_event_recipient_unique
    unique (recipient_profile_id, source_domain, source_event_key, event_type)
);

create index notifications_recipient_recent_idx
  on public.notifications (recipient_profile_id, created_at desc, id desc);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_profile_id, created_at desc, id desc)
  where read_at is null;

comment on table public.notifications is
  'Cube L durable per-Profile Inbox truth. Notification content is immutable; read_at may only move from unread to read.';

-- Resolve exactly the current active operational Profile. This keeps Inbox
-- visibility tied to the same active Profile + active bound-entity contract as
-- the rest of the operational platform. Admin has no bound entity by design.
create function private.current_active_notification_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'active'
    and (
      p.role = 'admin'
      or (
        p.role = 'agent'
        and p.country_agent_id is not null
        and exists (
          select 1
          from public.country_agents ca
          where ca.id = p.country_agent_id
            and ca.status = 'active'
        )
      )
      or (
        p.role = 'dealer'
        and p.dealer_id is not null
        and exists (
          select 1
          from public.dealers d
          where d.id = p.dealer_id
            and d.status = 'active'
        )
      )
      or (
        p.role = 'center'
        and p.installation_center_id is not null
        and exists (
          select 1
          from public.installation_centers c
          where c.id = p.installation_center_id
            and c.status = 'active'
        )
      )
    )
  limit 1;
$$;

revoke all on function private.current_active_notification_profile_id()
  from public, anon, authenticated, service_role;
grant execute on function private.current_active_notification_profile_id()
  to authenticated;

-- Notification content and identity are immutable. The only V1 mutation is a
-- monotonic unread -> read transition. No mark-unread, edit, archive or delete.
create function private.guard_notification_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.event_type is distinct from old.event_type
    or new.source_domain is distinct from old.source_domain
    or new.source_event_key is distinct from old.source_event_key
    or new.attention_level is distinct from old.attention_level
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.action_path is distinct from old.action_path
    or new.push_eligible is distinct from old.push_eligible
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_CONTENT_IMMUTABLE';
  end if;

  if old.read_at is not null and new.read_at is distinct from old.read_at then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_READ_MONOTONIC';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_notification_mutation()
  from public, anon, authenticated, service_role;

create trigger notifications_guard_mutation
  before update or delete on public.notifications
  for each row execute function private.guard_notification_mutation();

alter table public.notifications enable row level security;

revoke all on table public.notifications from public, anon, authenticated, service_role;
grant select on table public.notifications to authenticated;

create policy "notifications_read_own_active_inbox"
on public.notifications
for select
to authenticated
using (
  recipient_profile_id = (select private.current_active_notification_profile_id())
);

create function public.list_notifications(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  event_type text,
  source_domain text,
  source_event_key text,
  attention_level text,
  title text,
  body text,
  action_path text,
  push_eligible boolean,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_AUTH_REQUIRED';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 100000
  then
    raise exception using errcode = '22023', message = 'PG_NOTIFICATION_PAGINATION_INVALID';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_ACCESS_INACTIVE';
  end if;

  return query
  select
    n.id,
    n.event_type,
    n.source_domain,
    n.source_event_key,
    n.attention_level,
    n.title,
    n.body,
    n.action_path,
    n.push_eligible,
    n.created_at,
    n.read_at
  from public.notifications n
  where n.recipient_profile_id = v_profile_id
  order by n.created_at desc, n.id desc
  limit p_limit
  offset p_offset;
end;
$$;

create function public.notification_unread_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_count bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_AUTH_REQUIRED';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_ACCESS_INACTIVE';
  end if;

  select count(*)
    into v_count
  from public.notifications n
  where n.recipient_profile_id = v_profile_id
    and n.read_at is null;

  return v_count;
end;
$$;

create function public.mark_notification_read(p_notification_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_read_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_AUTH_REQUIRED';
  end if;

  if p_notification_id is null then
    raise exception using errcode = '22023', message = 'PG_NOTIFICATION_ID_REQUIRED';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_ACCESS_INACTIVE';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.recipient_profile_id = v_profile_id
  returning n.read_at into v_read_at;

  if not found then
    raise exception using errcode = '22023', message = 'PG_NOTIFICATION_NOT_FOUND';
  end if;

  return v_read_at;
end;
$$;

create function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_AUTH_REQUIRED';
  end if;

  v_profile_id := private.current_active_notification_profile_id();
  if v_profile_id is null then
    raise exception using errcode = '42501', message = 'PG_NOTIFICATION_ACCESS_INACTIVE';
  end if;

  update public.notifications n
  set read_at = now()
  where n.recipient_profile_id = v_profile_id
    and n.read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.list_notifications(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.notification_unread_count()
  from public, anon, authenticated, service_role;
revoke all on function public.mark_notification_read(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_all_notifications_read()
  from public, anon, authenticated, service_role;

grant execute on function public.list_notifications(integer, integer) to authenticated;
grant execute on function public.notification_unread_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
