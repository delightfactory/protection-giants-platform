import { randomUUID } from "node:crypto";
import { admin, assert, centerA, evidence, oneWinner, partyA, partyB, resolution, roll, sql, uq, userRpc } from "./verify-cube-r-claim-macro-fixture.mjs";

// Concurrent Resolution assignment.
{
  const f = await resolution("ASSIGN-RACE");
  const rs = await Promise.all([
    userRpc("assign_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_remedy_kind: "service_reinstall", p_performing_center_party_id: partyA }, admin),
    userRpc("assign_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_remedy_kind: "service_reinstall", p_performing_center_party_id: partyB }, admin),
  ]); oneWinner(rs, "Concurrent Resolution assignment");
  assert(sql(`select count(*) from public.warranty_claim_resolution_events where resolution_id=${uq(f.resolutionId)} and event_kind='resolution_assigned';`) === "1", "Assignment race duplicated event.");
}

// Customer withdrawal versus service completion.
{
  const f = await resolution("WITHDRAW-COMPLETE", "service_reinstall"); const ev = await evidence(f.resolutionId, "withdraw");
  const rs = await Promise.all([
    userRpc("cancel_assigned_claim_resolution_for_customer_withdrawal", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_reason: "MACRO-12A11 customer withdrawal races completion.", p_customer_message: "تم إغلاق تنفيذ الخدمة بناءً على طلب العميل أثناء اختبار التزامن." }, admin),
    userRpc("complete_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_completion_note: "MACRO-12A11 service completion races customer withdrawal.", p_evidence_paths: [ev], p_replacement_roll_serial: null }, centerA),
  ]); oneWinner(rs, "Customer withdrawal versus service completion");
  const s = sql(`select concat_ws('|',r.status,c.closed_at is not null) from public.warranty_claim_resolutions r join public.warranty_claims c on c.id=r.claim_id where r.id=${uq(f.resolutionId)};`); assert(["completed|t","cancelled|t"].includes(s), `Bad terminal ${s}`);
}

// Warranty-void race with R completion.
{
  const f = await resolution("VOID-COMPLETE", "service_reinstall"); const ev = await evidence(f.resolutionId, "void");
  const [v,c] = await Promise.all([
    userRpc("void_warranty_in_error", { p_action_request_id: randomUUID(), p_warranty_id: f.warrantyId, p_reason: "MACRO-12A11 Warranty void races R completion." }, admin),
    userRpc("complete_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_completion_note: "MACRO-12A11 completion races Warranty void safely.", p_evidence_paths: [ev], p_replacement_roll_serial: null }, centerA),
  ]);
  assert(c.response.ok, `Warranty-void race blocked valid completion: ${JSON.stringify(c.body)}`);
  assert(v.body?.code !== "40P01" && c.body?.code !== "40P01", "Warranty-void race deadlocked.");
  assert(sql(`select count(*) from public.warranties w join public.warranty_claims c on c.warranty_id=w.id where w.id=${uq(f.warrantyId)} and w.record_state='voided_in_error' and c.closed_at is null;`) === "0", "Voided Warranty + open Claim contradiction.");
}

// Same Roll reservation by two Resolutions.
{
  const a = await resolution("DUAL-RESERVE-A", "replacement_roll_reinstall"); const b = await resolution("DUAL-RESERVE-B", "replacement_roll_reinstall"); const r = await roll("DUAL-RESERVE-MAT");
  const rs = await Promise.all([
    userRpc("reserve_claim_resolution_roll", { p_action_request_id: randomUUID(), p_resolution_id: a.resolutionId, p_roll_id: r.id }, admin),
    userRpc("reserve_claim_resolution_roll", { p_action_request_id: randomUUID(), p_resolution_id: b.resolutionId, p_roll_id: r.id }, admin),
  ]);
  oneWinner(rs, "Same Roll reservation by two Resolutions");
  assert(sql(`select count(*) from public.warranty_claim_resolution_roll_allocations where roll_id=${uq(r.id)} and status in ('reserved','consumed');`) === "1", "Dual reserve left multiple owners.");
}
console.log("Claims Macro 12A11 concurrency A PASS.");
