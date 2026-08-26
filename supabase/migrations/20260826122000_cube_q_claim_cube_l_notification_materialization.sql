-- Cube Q — Claim Review, Inspection & Decision, notification integration
-- Project immutable Claim events into the existing Cube L per-Profile Inbox.
-- No new notification transport, customer messaging channel, or workflow state is
-- introduced here.

create function private.materialize_warranty_claim_notification_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
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

  -- review_started is intentionally silent: the acting Admin already knows that
  -- review began, and there is no new task for another operational party.
  if new.event_kind = 'review_started' then
    return new;
  end if;

  -- New customer Claim -> Company/Admin action.
  if new.event_kind = 'submitted' then
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
      'claim.submitted',
      'warranty_claim',
      v_source_event_key,
      'action_required',
      'مطالبة ضمان جديدة تحتاج مراجعة',
      'تم استلام المطالبة ' || v_claim.claim_number || '. افتح المطالبة لبدء المراجعة.',
      '/operations/claims/' || v_claim.id::text,
      true,
      new.created_at
    from private.notification_party_profile_ids(v_company_party_id) recipients
    on conflict (recipient_profile_id, source_domain, source_event_key, event_type)
    do nothing;

    return new;
  end if;

  -- Inspection request/reassignment -> currently assigned Center only. The action
  -- points to the Center queue rather than a detail URL so historical Inbox rows
  -- remain safe after later reassignment/cancellation.
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

  -- PD-078 can restore the same requested inspection after a mistaken ordinary
  -- cancellation. The task must not silently reappear after the Center was told
  -- that it disappeared, so the same immutable correction event also projects a
  -- fresh action-required Center notification.
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
  -- exclusively on the verified customer Claim projection.
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

create trigger warranty_claim_events_notification_materializer
  after insert on public.warranty_claim_events
  for each row
  execute function private.materialize_warranty_claim_notification_event();

comment on function private.materialize_warranty_claim_notification_event() is
  'Cube Q bounded Cube L projector for Claim-domain events. New Claims and actionable inspection changes notify the exact operational party, final decisions/corrections are Inbox-only for other active Admins, customer messaging stays on the verified Claim projection, and Push never controls Claim state.';
