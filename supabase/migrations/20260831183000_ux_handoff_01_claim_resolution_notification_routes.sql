-- UX-HANDOFF-01 — Claim / Resolution notification handoff
-- Add only authorized action destinations to the existing durable Cube L projections.
-- No recipient, event identity, Push transport, state-machine, RLS, or business authority changes.

create or replace function private.materialize_warranty_claim_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
  v_warranty public.warranties%rowtype;
  v_company_party_id uuid;
  v_inspection public.warranty_claim_inspections%rowtype;
  v_target_party_id uuid;
  v_inspection_id uuid;
  v_source_event_key text := 'warranty_claim_events:' || new.id::text;
  v_action_path text;
  v_event_type text;
  v_attention_level text;
  v_title text;
  v_body text;
  v_push_eligible boolean;
begin
  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = new.claim_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_MISSING';
  end if;

  -- Preserve the frozen Cube P submitted notification contract exactly. Q adds
  -- professional Claim pages, but does not rewrite or fork the P event identity.
  if new.event_kind = 'submitted' then
    select warranty.*
      into v_warranty
    from public.warranties warranty
    where warranty.id = v_claim.warranty_id;

    if not found then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_WARRANTY_MISSING';
    end if;

    select party.id
      into v_company_party_id
    from public.operational_parties party
    where party.party_type = 'company';

    if v_company_party_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
    end if;

    v_body := btrim(left(
      'تم استلام المطالبة ' || v_claim.claim_number
        || ' على ' || v_warranty.product_name_snapshot
        || ' — ' || v_warranty.vehicle_make || ' ' || v_warranty.vehicle_model || '.',
      300
    ));

    insert into public.notifications (
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible,
      created_at
    )
    select
      recipients.profile_id,
      'warranty.claim_submitted',
      'warranty_claim',
      v_source_event_key,
      'action_required',
      'مطالبة ضمان جديدة تحتاج مراجعة',
      v_body,
      '/operations/claims/' || v_claim.id::text || '/review',
      true,
      new.created_at
    from private.notification_party_profile_ids(v_company_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  -- Starting review is the acting Admin's own action and creates no new task for
  -- another operational party.
  if new.event_kind = 'review_started' then
    return new;
  end if;

  -- Inspection request/reassignment -> currently assigned Center only. Historical
  -- Inbox rows point to the queue, which remains safe after later reassignment or
  -- cancellation.
  if new.event_kind in ('inspection_requested', 'inspection_reassigned') then
    begin
      v_inspection_id := nullif(new.event_data ->> 'inspection_id', '')::uuid;
      v_target_party_id := case
        when new.event_kind = 'inspection_requested'
          then nullif(new.event_data ->> 'assigned_center_party_id', '')::uuid
        else nullif(new.event_data ->> 'new_center_party_id', '')::uuid
      end;
    exception when invalid_text_representation then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_EVENT_INVALID';
    end;

    if v_inspection_id is null or v_target_party_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_EVENT_INVALID';
    end if;

    if new.event_kind = 'inspection_requested' then
      v_event_type := 'claim.inspection_requested';
      v_title := 'مطلوب فحص مطالبة ضمان';
      v_body := 'تم إسناد فحص المطالبة ' || v_claim.claim_number || ' إلى مركزك. راجع قائمة مهام الفحص.';
    else
      v_event_type := 'claim.inspection_reassigned';
      v_title := 'تم إسناد فحص مطالبة إلى مركزك';
      v_body := 'تم تحويل فحص المطالبة ' || v_claim.claim_number || ' إلى مركزك. راجع قائمة مهام الفحص.';
    end if;

    insert into public.notifications (
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible,
      created_at
    )
    select
      recipients.profile_id,
      v_event_type,
      'warranty_claim',
      v_source_event_key,
      'action_required',
      v_title,
      v_body,
      '/operations/claim-inspections',
      true,
      new.created_at
    from private.notification_party_profile_ids(v_target_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  -- Submitted inspection returns the Claim to Company review.
  if new.event_kind = 'inspection_submitted' then
    select party.id
      into v_company_party_id
    from public.operational_parties party
    where party.party_type = 'company';

    if v_company_party_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
    end if;

    insert into public.notifications (
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible,
      created_at
    )
    select
      recipients.profile_id,
      'claim.inspection_submitted',
      'warranty_claim',
      v_source_event_key,
      'action_required',
      'تم استلام فحص مطالبة ضمان',
      'أرسل المركز نتيجة فحص المطالبة ' || v_claim.claim_number || '. افتح مساحة المراجعة لاستكمال القرار.',
      '/operations/claims/' || v_claim.id::text || '/review',
      true,
      new.created_at
    from private.notification_party_profile_ids(v_company_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  -- Ordinary cancellation can make an already-pushed Center task disappear.
  -- Neutralize that stale task with a concise Inbox-only message.
  if new.event_kind = 'cancelled' then
    select inspection.*
      into v_inspection
    from public.warranty_claim_inspections inspection
    where inspection.claim_id = v_claim.id
      and inspection.status = 'requested';

    if found then
      insert into public.notifications (
        recipient_profile_id,
        event_type,
        source_domain,
        source_event_key,
        attention_level,
        title,
        body,
        action_path,
        push_eligible,
        created_at
      )
      select
        recipients.profile_id,
        'claim.inspection_cancelled',
        'warranty_claim',
        v_source_event_key,
        'info',
        'لم يعد فحص المطالبة مطلوبًا',
        'تم إلغاء المطالبة ' || v_claim.claim_number || ' ولم تعد مهمة الفحص مطلوبة من مركزك.',
        '/operations/claim-inspections',
        false,
        new.created_at
      from private.notification_party_profile_ids(v_inspection.assigned_center_party_id) recipients
      on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
      do nothing;
    end if;
  end if;

  -- PD-078 may restore the same requested inspection after an erroneous ordinary
  -- cancellation. Re-notify that Center so the task cannot silently reappear.
  if new.event_kind = 'decision_reopened_for_correction'
    and new.event_data ->> 'resumed_status' = 'awaiting_inspection'
  then
    begin
      v_inspection_id := nullif(new.event_data ->> 'resumed_inspection_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_EVENT_INVALID';
    end;

    if v_inspection_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_EVENT_INVALID';
    end if;

    select inspection.*
      into v_inspection
    from public.warranty_claim_inspections inspection
    where inspection.id = v_inspection_id
      and inspection.claim_id = v_claim.id
      and inspection.status = 'requested';

    if not found then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_INSPECTION_MISSING';
    end if;

    insert into public.notifications (
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible,
      created_at
    )
    select
      recipients.profile_id,
      'claim.inspection_resumed',
      'warranty_claim',
      v_source_event_key,
      'action_required',
      'عاد فحص مطالبة إلى قائمة المهام',
      'أعيد فتح المطالبة ' || v_claim.claim_number || ' وعادت مهمة الفحص إلى مركزك. راجع قائمة مهام الفحص.',
      '/operations/claim-inspections',
      true,
      new.created_at
    from private.notification_party_profile_ids(v_inspection.assigned_center_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;
  end if;

  -- Final decisions and bounded corrections are internal Company visibility only.
  -- Exclude the acting Admin to avoid self-success noise. Customer status remains
  -- on the verified customer Claim projection.
  if new.event_kind not in (
    'approved',
    'rejected',
    'cancelled',
    'approval_cancelled_before_execution',
    'decision_reopened_for_correction'
  ) then
    return new;
  end if;

  select party.id
    into v_company_party_id
  from public.operational_parties party
  where party.party_type = 'company';

  if v_company_party_id is null then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
  end if;

  v_action_path := '/operations/claims/' || v_claim.id::text;
  v_push_eligible := false;

  if new.event_kind = 'approved' then
    v_event_type := 'claim.approved';
    v_attention_level := 'info';
    v_title := 'تم اعتماد مطالبة ضمان';
    v_body := 'تم اعتماد المطالبة ' || v_claim.claim_number || ' وأصبحت جاهزة لمرحلة المعالجة التالية.';
  elsif new.event_kind = 'rejected' then
    v_event_type := 'claim.rejected';
    v_attention_level := 'info';
    v_title := 'تم رفض مطالبة ضمان';
    v_body := 'تم إغلاق المطالبة ' || v_claim.claim_number || ' بقرار رفض موثق.';
  elsif new.event_kind = 'cancelled' then
    v_event_type := 'claim.cancelled';
    v_attention_level := 'info';
    v_title := 'تم إلغاء مطالبة ضمان';
    v_body := 'تم إغلاق المطالبة ' || v_claim.claim_number || ' بقرار إلغاء موثق.';
  elsif new.event_kind = 'approval_cancelled_before_execution' then
    v_event_type := 'claim.approval_cancelled_before_execution';
    v_attention_level := 'warning';
    v_title := 'تم إلغاء اعتماد مطالبة قبل التنفيذ';
    v_body := 'تم تصحيح اعتماد المطالبة ' || v_claim.claim_number || ' قبل بدء التنفيذ مع الحفاظ على سجل القرار السابق.';
  else
    v_event_type := 'claim.decision_reopened_for_correction';
    v_attention_level := 'action_required';
    v_title := 'أعيد فتح مطالبة ضمان للتصحيح';
    v_body := 'أعيد فتح المطالبة ' || v_claim.claim_number || ' لاستكمال مراجعة قرار مصحح.';
    if new.event_data ->> 'resumed_status' = 'under_review' then
      v_action_path := '/operations/claims/' || v_claim.id::text || '/review';
    end if;
  end if;

  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    v_event_type,
    'warranty_claim',
    v_source_event_key,
    v_attention_level,
    v_title,
    v_body,
    v_action_path,
    v_push_eligible,
    new.created_at
  from private.notification_party_profile_ids(v_company_party_id) recipients
  where recipients.profile_id is distinct from new.actor_profile_id
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_warranty_claim_notification_event()
  from public, anon, authenticated, service_role;

comment on function private.materialize_warranty_claim_notification_event() is
  'Cube Q extension of the frozen Cube P/Cube L Claim projector. Submitted semantics remain unchanged; actionable inspection changes route to the exact Center/Admin party, final decisions/corrections are Inbox-only for other active Admins, and Push never controls Claim state.';

create or replace function private.materialize_warranty_claim_resolution_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.warranty_claim_resolutions%rowtype;
  v_claim public.warranty_claims%rowtype;
  v_company_party_id uuid;
  v_target_party_id uuid;
  v_remedy_kind text;
  v_customer_message text;
  v_source_event_key text := 'warranty_claim_resolution_events:' || new.id::text;
  v_event_type text;
  v_title text;
  v_body text;
begin
  -- Completion is informational Company visibility only. The event table and
  -- completed Resolution/Claim rows are the authoritative facts; event_data is
  -- deliberately not trusted to choose recipients or completion state.
  if new.event_kind in ('resolution_completed', 'resolution_completed_admin_recovery') then
    select resolution.*
      into v_resolution
    from public.warranty_claim_resolutions resolution
    where resolution.id = new.resolution_id;

    if not found
      or v_resolution.status <> 'completed'
      or v_resolution.completed_by_profile_id is distinct from new.actor_profile_id
      or v_resolution.performing_center_party_id is null
      or v_resolution.remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall')
    then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
    end if;

    if (
      new.event_kind = 'resolution_completed'
      and (
        new.actor_kind <> 'center'
        or v_resolution.completion_actor_kind <> 'center'
      )
    ) or (
      new.event_kind = 'resolution_completed_admin_recovery'
      and (
        new.actor_kind <> 'admin'
        or v_resolution.completion_actor_kind <> 'admin_recovery'
      )
    ) then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_EVENT_INVALID';
    end if;

    select claim.*
      into v_claim
    from public.warranty_claims claim
    where claim.id = v_resolution.claim_id;

    if not found
      or v_claim.status <> 'approved'
      or v_claim.closed_at is null
    then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
    end if;

    select party.id
      into v_company_party_id
    from public.operational_parties party
    where party.party_type = 'company';

    if v_company_party_id is null then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_COMPANY_PARTY_MISSING';
    end if;

    insert into public.notifications (
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible,
      created_at
    )
    select
      recipients.profile_id,
      'claim_resolution.completed',
      'warranty_claim_resolution',
      v_source_event_key,
      'info',
      'تم إكمال معالجة مطالبة ضمان',
      btrim(left(
        'اكتمل تنفيذ معالجة المطالبة ' || v_claim.claim_number || ' وتم إغلاقها.',
        300
      )),
      '/operations/claims/' || v_claim.id::text,
      false,
      new.created_at
    from private.notification_party_profile_ids(v_company_party_id) recipients
    where recipients.profile_id is distinct from new.actor_profile_id
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  -- Preserve the cumulative projector qualified before this increment, including
  -- PD-079 assigned-task cancellation. Remedy/material events remain audit-only.
  if new.event_kind not in (
    'resolution_assigned',
    'resolution_reassigned',
    'resolution_cancelled_customer_withdrawal'
  ) then
    return new;
  end if;

  begin
    v_target_party_id := nullif(new.event_data ->> 'performing_center_party_id', '')::uuid;
    v_remedy_kind := nullif(new.event_data ->> 'remedy_kind', '');
    v_customer_message := nullif(new.event_data ->> 'customer_message', '');
  exception when invalid_text_representation then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_EVENT_INVALID';
  end;

  if v_target_party_id is null
    or v_remedy_kind not in ('service_reinstall', 'replacement_roll_reinstall')
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_EVENT_INVALID';
  end if;

  select resolution.*
    into v_resolution
  from public.warranty_claim_resolutions resolution
  where resolution.id = new.resolution_id;

  if not found
    or v_resolution.performing_center_party_id <> v_target_party_id
    or v_resolution.remedy_kind <> v_remedy_kind
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
  end if;

  select claim.*
    into v_claim
  from public.warranty_claims claim
  where claim.id = v_resolution.claim_id;

  if not found then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_MISSING';
  end if;

  if new.event_kind in ('resolution_assigned', 'resolution_reassigned') then
    if v_resolution.status <> 'assigned' then
      raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
    end if;

    if new.event_kind = 'resolution_reassigned' then
      v_event_type := 'claim_resolution.reassigned';
      v_title := 'تم إعادة إسناد تنفيذ مطالبة ضمان إلى مركزك';
    else
      v_event_type := 'claim_resolution.assigned';
      v_title := 'تم إسناد تنفيذ مطالبة ضمان إلى مركزك';
    end if;

    v_body := btrim(left(
      case
        when v_remedy_kind = 'replacement_roll_reinstall' then
          'تم إسناد تنفيذ استبدال وإعادة تركيب للمطالبة ' || v_claim.claim_number || ' إلى مركزك.'
        else
          'تم إسناد تنفيذ إعادة تركيب للمطالبة ' || v_claim.claim_number || ' إلى مركزك.'
      end,
      300
    ));

    insert into public.notifications (
      recipient_profile_id,
      event_type,
      source_domain,
      source_event_key,
      attention_level,
      title,
      body,
      action_path,
      push_eligible,
      created_at
    )
    select
      recipients.profile_id,
      v_event_type,
      'warranty_claim_resolution',
      v_source_event_key,
      'action_required',
      v_title,
      v_body,
      '/operations/claim-resolution-tasks/' || v_resolution.id::text,
      true,
      new.created_at
    from private.notification_party_profile_ids(v_target_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  if v_resolution.status <> 'cancelled'
    or v_resolution.customer_cancellation_message is null
    or v_customer_message is null
    or v_resolution.customer_cancellation_message <> v_customer_message
    or v_claim.status <> 'approved'
    or v_claim.closed_at is null
  then
    raise exception using errcode = '23514', message = 'PG_NOTIFICATION_CLAIM_RESOLUTION_STATE_INVALID';
  end if;

  -- PD-079 removes an already-assigned physical task. Keep the previously
  -- qualified Center notification exact and do not expose the Admin's reason.
  insert into public.notifications (
    recipient_profile_id,
    event_type,
    source_domain,
    source_event_key,
    attention_level,
    title,
    body,
    action_path,
    push_eligible,
    created_at
  )
  select
    recipients.profile_id,
    'claim_resolution.cancelled_customer_withdrawal',
    'warranty_claim_resolution',
    v_source_event_key,
    'info',
    'تم إغلاق تنفيذ مطالبة الضمان',
    btrim(left(
      'لم يعد تنفيذ المطالبة ' || v_claim.claim_number || ' مطلوبًا من مركزك بعد إغلاق المعالجة بناءً على رغبة العميل.',
      300
    )),
    null,
    true,
    new.created_at
  from private.notification_party_profile_ids(v_target_party_id) recipients
  on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
  do nothing;

  return new;
end;
$$;

revoke all on function private.materialize_warranty_claim_resolution_notification_event()
  from public, anon, authenticated, service_role;

comment on function private.materialize_warranty_claim_resolution_notification_event() is
  'Cube R Resolution event -> Cube L durable Inbox projector. Preserves assignment/reassignment and PD-079 Center notification semantics; normal/Admin-recovery completion adds Inbox-only Company visibility for other active Admins, with no completion Push/customer projection or workflow authority.';

-- Repair already-materialized action-required rows without recreating notifications.
-- Source-event identity remains the join authority, preserving durable idempotency.
alter table public.notifications
  disable trigger notifications_guard_mutation;

update public.notifications notification
set action_path = '/operations/claims/' || event.claim_id::text || '/review'
from public.warranty_claim_events event
where notification.source_domain = 'warranty_claim'
  and notification.event_type = 'warranty.claim_submitted'
  and notification.attention_level = 'action_required'
  and notification.action_path is null
  and event.event_kind = 'submitted'
  and notification.source_event_key = 'warranty_claim_events:' || event.id::text;

update public.notifications notification
set action_path = '/operations/claim-resolution-tasks/' || event.resolution_id::text
from public.warranty_claim_resolution_events event
where notification.source_domain = 'warranty_claim_resolution'
  and notification.event_type in ('claim_resolution.assigned', 'claim_resolution.reassigned')
  and notification.attention_level = 'action_required'
  and notification.action_path is null
  and (
    (notification.event_type = 'claim_resolution.assigned' and event.event_kind = 'resolution_assigned')
    or (notification.event_type = 'claim_resolution.reassigned' and event.event_kind = 'resolution_reassigned')
  )
  and notification.source_event_key = 'warranty_claim_resolution_events:' || event.id::text;

alter table public.notifications
  enable trigger notifications_guard_mutation;

comment on function private.materialize_warranty_claim_notification_event() is
  'UX-HANDOFF-01 cumulative Claim -> Cube L projector. Existing recipient/privacy/idempotency semantics remain authoritative; submitted Claims now route active Admin recipients to the authorized Claim review page.';

comment on function private.materialize_warranty_claim_resolution_notification_event() is
  'UX-HANDOFF-01 cumulative Resolution -> Cube L projector. Existing recipient/privacy/idempotency/completion semantics remain authoritative; assignment/reassignment now route only the current Center recipient to the exact authorized Resolution task.';
