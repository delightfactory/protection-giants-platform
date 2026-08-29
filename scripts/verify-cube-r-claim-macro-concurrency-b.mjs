import { randomUUID } from "node:crypto";
import { admin, assert, centerA, dbLogs, evidence, oneWinner, openCandidate, reserve, resolution, roll, sql, uq, userRpc } from "./verify-cube-r-claim-macro-fixture.mjs";

// Remedy/reservation race.
{
  const f = await resolution("REMEDY-RESERVE", "replacement_roll_reinstall"); const r = await roll("REMEDY-RESERVE-MAT");
  const rs = await Promise.all([
    userRpc("change_warranty_claim_resolution_remedy", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_remedy_kind: "service_reinstall", p_reason: "MACRO-12A11 remedy correction races reservation." }, admin),
    userRpc("reserve_claim_resolution_roll", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_roll_id: r.id }, admin),
  ]);
  oneWinner(rs, "Remedy/reservation race");
  const s = sql(`select concat_ws('|',r.remedy_kind,(select count(*) from public.warranty_claim_resolution_roll_allocations a where a.resolution_id=r.id and a.status='reserved')) from public.warranty_claim_resolutions r where r.id=${uq(f.resolutionId)};`);
  assert(["service_reinstall|0","replacement_roll_reinstall|1"].includes(s), `Hidden material state ${s}`);
}

// Cube K issue versus replacement completion.
{
  const f = await resolution("K-COMPLETE", "replacement_roll_reinstall"); const r = await roll("K-COMPLETE-MAT"); await reserve(f.resolutionId,r.id); await openCandidate(r); const ev = await evidence(f.resolutionId,"k");
  const rs = await Promise.all([
    userRpc("create_roll_preinstall_issue", { p_request_id: randomUUID(), p_issue_id: randomUUID(), p_roll_serial: r.serial, p_category: "physical_damage", p_description: "MACRO-12A11 Cube K issue races replacement completion.", p_evidence_paths: [] }, centerA),
    userRpc("complete_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_completion_note: "MACRO-12A11 replacement completion races Cube K issue.", p_evidence_paths: [ev], p_replacement_roll_serial: r.serial }, centerA),
  ]);
  oneWinner(rs, "Cube K issue versus replacement completion");
  const s = sql(`select concat_ws('|',res.status,a.status,(select count(*) from public.roll_preinstall_issues i where i.roll_id=a.roll_id and i.status='submitted')) from public.warranty_claim_resolutions res join public.warranty_claim_resolution_roll_allocations a on a.resolution_id=res.id where res.id=${uq(f.resolutionId)};`);
  assert(["completed|consumed|0","assigned|reserved|1"].includes(s), `K/completion bad state ${s}`);
}

// Allocation release versus replacement completion.
{
  const f = await resolution("RELEASE-COMPLETE", "replacement_roll_reinstall"); const r = await roll("RELEASE-COMPLETE-MAT"); const allocationId = await reserve(f.resolutionId,r.id); await openCandidate(r); const ev = await evidence(f.resolutionId,"release");
  const rs = await Promise.all([
    userRpc("release_claim_resolution_roll", { p_action_request_id: randomUUID(), p_allocation_id: allocationId, p_reason: "MACRO-12A11 explicit release races replacement completion." }, admin),
    userRpc("complete_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: f.resolutionId, p_completion_note: "MACRO-12A11 replacement completion races allocation release.", p_evidence_paths: [ev], p_replacement_roll_serial: r.serial }, centerA),
  ]);
  oneWinner(rs, "Allocation release versus replacement completion");
  const s = sql(`select concat_ws('|',res.status,a.status,c.closed_at is null) from public.warranty_claim_resolutions res join public.warranty_claims c on c.id=res.claim_id join public.warranty_claim_resolution_roll_allocations a on a.resolution_id=res.id where res.id=${uq(f.resolutionId)} and a.id=${uq(allocationId)};`);
  assert(["completed|consumed|f","assigned|released|t"].includes(s), `Release/completion bad state ${s}`);
}

const bad = sql(`with mc as (select c.* from public.warranty_claims c where c.description like 'MACRO-12A11:%') select count(*) from mc c join public.warranties w on w.id=c.warranty_id left join public.warranty_claim_resolutions r on r.claim_id=c.id where (w.record_state='voided_in_error' and c.closed_at is null) or (r.status in ('completed','cancelled') and c.closed_at is null) or (r.status in ('authorized','assigned') and c.closed_at is not null) or (r.status='completed' and not exists(select 1 from public.warranty_claim_resolution_evidence e where e.resolution_id=r.id)) or (r.status='cancelled' and exists(select 1 from public.warranty_claim_resolution_roll_allocations a where a.resolution_id=r.id and a.status in ('reserved','consumed')));`);
assert(bad === "0", `MACRO-12A11 dead-end audit found ${bad} contradictions.`);
const logs = dbLogs();
assert(!logs.includes("deadlock detected") && !logs.includes("SQLSTATE 40P01"), "Claims Macro produced PostgreSQL 40P01 deadlock evidence.");
console.log("Claims Macro 12A11 concurrency B PASS: no 40P01 and no macro dead-end state.");
