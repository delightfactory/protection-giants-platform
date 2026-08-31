-- UX-DATA-01 follow-up: explicit delete retries must still require current flow authority.
-- Cleanup remains the only reclamation path after an actor loses operational authority.

create or replace function public.reserve_operational_evidence_stage_delete(
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage private.operational_evidence_stages%rowtype;
  v_path text := btrim(coalesce(p_storage_path, ''));
begin
  select stage.*
    into v_stage
  from private.operational_evidence_stages stage
  where stage.storage_path = v_path
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_NOT_FOUND';
  end if;

  if auth.uid() is null or v_stage.actor_profile_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_FORBIDDEN';
  end if;

  if v_stage.state = 'consumed' then
    raise exception using errcode = '42501', message = 'PG_OPERATIONAL_EVIDENCE_STAGE_CONSUMED';
  end if;

  -- Revalidate current operational authority even for an existing delete_pending
  -- reservation. If authority was lost, bounded service-role cleanup owns retry.
  perform private.require_operational_evidence_stage_actor_authority(v_stage.id);

  if v_stage.state = 'delete_pending' then
    return v_stage.id;
  end if;

  update private.operational_evidence_stages stage
  set
    state = 'delete_pending',
    delete_reserved_at = clock_timestamp()
  where stage.id = v_stage.id;

  return v_stage.id;
end;
$$;

revoke all on function public.reserve_operational_evidence_stage_delete(text)
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_operational_evidence_stage_delete(text)
  to authenticated;
