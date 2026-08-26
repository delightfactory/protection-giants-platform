-- Cube Q — read authorization contract hardening.
-- Q professional reads reuse Cube M's locking authorization context. PostgreSQL
-- functions that acquire row locks must remain VOLATILE; do not mislabel these
-- RPCs STABLE merely because their domain purpose is read-only.

alter function public.list_admin_warranty_claims(integer, integer, text, text) volatile;
alter function public.get_admin_warranty_claim_detail(uuid) volatile;
alter function public.list_admin_warranty_claim_timeline(uuid) volatile;
alter function public.list_admin_warranty_claim_history(uuid, uuid, integer) volatile;
alter function public.list_actionable_claim_inspection_centers() volatile;
alter function public.list_center_pending_claim_inspections(integer, integer) volatile;
alter function public.get_center_claim_inspection_detail(uuid) volatile;
alter function public.list_warranty_claim_evidence_for_role(uuid, uuid) volatile;

comment on function private.lock_claim_read_context() is
  'Cube Q role-aware professional read authorization. Reuses Cube M active Admin/Center locked context; callers are intentionally VOLATILE because authorization acquires row locks.';