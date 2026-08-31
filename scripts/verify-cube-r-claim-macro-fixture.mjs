import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;
if (!apiUrl || !serviceRoleKey || !anonKey) throw new Error("Supabase env is required.");
const password = "Cube-J-Roll-Opening-2026!";
let seq = Number(String(Date.now()).slice(-7));

export function assert(v, m) { if (!v) throw new Error(m); }
async function json(r) { const t = await r.text(); if (!t) return null; try { return JSON.parse(t); } catch { return t; } }
async function req(path, { method = "GET", token = serviceRoleKey, key = serviceRoleKey, body, raw, type } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  let payload;
  if (raw !== undefined) { headers["Content-Type"] = type ?? "application/octet-stream"; payload = raw; }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const response = await fetch(`${apiUrl}${path}`, { method, headers, body: payload });
  return { response, body: await json(response) };
}
const rpc = (name, body, token = serviceRoleKey, key = serviceRoleKey) => req(`/rest/v1/rpc/${name}`, { method: "POST", body, token, key });
export const userRpc = (name, body, token) => rpc(name, body, token, anonKey);
async function signIn(email) {
  const r = await req("/auth/v1/token?grant_type=password", { method: "POST", token: anonKey, key: anonKey, body: { email, password } });
  assert(r.response.ok && r.body?.access_token, `Sign in failed ${email}: ${r.response.status}`); return r.body.access_token;
}
function db() {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n");
  const name = names.find((x) => x.startsWith("supabase_db_")); assert(name, "Supabase DB container missing."); return name.trim();
}
export function sql(text) { return execFileSync("docker", ["exec", "-i", db(), "psql", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", text], { encoding: "utf8" }).trim(); }
function run(text) { return execFileSync("docker", ["exec", "-i", db(), "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: text, encoding: "utf8" }); }
export function uq(v) { assert(/^[0-9a-f-]{36}$/i.test(v), `Bad uuid ${v}`); return `'${v}'::uuid`; }
function tq(v) { return `'${String(v).replaceAll("'", "''")}'`; }
function claimNo() { seq = (seq + 1) % 10000000; return `PG-C-8${String(seq).padStart(7, "0")}`; }
export function oneWinner(results, label) {
  for (const r of results) assert(r.body?.code !== "40P01" && r.body?.message !== "deadlock detected", `${label}: 40P01 deadlock`);
  const ok = results.filter((r) => r.response.ok); assert(ok.length === 1, `${label}: expected one winner ${JSON.stringify(results.map((r) => [r.response.status, r.body]))}`); return ok[0];
}
export function dbLogs() {
  return execFileSync(
    "sh",
    ["-lc", `docker logs ${db()} 2>&1 | grep -E 'deadlock detected|SQLSTATE 40P01' || true`],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  ).trim();
}

export const admin = await signIn("cube-j-admin@example.test");
export const centerA = await signIn("cube-j-center-a@example.test");
export const centerB = await signIn("cube-j-center-b@example.test");
const adminId = sql(`select p.id from public.profiles p join auth.users u on u.id=p.id where u.email='cube-j-admin@example.test' and p.role='admin' and p.status='active' limit 1;`);
export const partyA = sql(`select op.id from public.operational_parties op join public.installation_centers c on c.id=op.installation_center_id where c.code='CUBE-J-CENTER-A' and c.status='active' limit 1;`);
export const partyB = sql(`select op.id from public.operational_parties op join public.installation_centers c on c.id=op.installation_center_id where c.code='CUBE-J-CENTER-B' and c.status='active' limit 1;`);
const productId = sql(`select id from public.products where status='active' and product_type='PPF' order by created_at,id limit 1;`);
assert(adminId && partyA && partyB && productId, "Macro fixtures missing.");

export async function roll(label) {
  const o = await userRpc("create_production_order", { p_request_id: randomUUID(), p_product_id: productId, p_production_date: "2026-08-29", p_lots: [{ quantity: 1, source_reference: `MACRO-${label}` }], p_source_reference: `MACRO-${label}`, p_notes: `12A11 ${label}` }, admin);
  assert(o.response.ok, `Production failed ${label}: ${JSON.stringify(o.body)}`);
  const [id, serial] = sql(`select concat_ws('|',id,serial_number) from public.rolls where production_order_id=${uq(o.body)} limit 1;`).split("|");
  run(`update public.roll_custody_current set custodian_party_id=${uq(partyA)}, confirmed_at=now() where roll_id=${uq(id)};
       insert into public.roll_custody_events(roll_id,custody_sequence,custodian_party_id,confirmed_at) values(${uq(id)},(select coalesce(max(custody_sequence),0)+1 from public.roll_custody_events where roll_id=${uq(id)}),${uq(partyA)},now());`);
  return { id, serial };
}
async function warranty(label) {
  const r = await roll(`${label}-W`);
  const opened = await userRpc("open_roll", { p_request_id: randomUUID(), p_roll_serial: r.serial }, centerA); assert(opened.response.ok, `Open failed ${label}`);
  const phone = `+201099${String(++seq).padStart(6, "0").slice(-6)}`;
  const a = await userRpc("activate_roll_warranty", { p_request_id: randomUUID(), p_roll_serial: r.serial, p_customer_name: `Macro ${label}`, p_customer_phone: phone, p_customer_email: null, p_vehicle_make: "Macro", p_vehicle_model: label.slice(0, 30), p_vehicle_year: 2026, p_vehicle_plate: `M${String(seq).slice(-5)}`, p_vehicle_color: "Black", p_vehicle_vin: `MACRO${String(seq).padStart(12,"0")}`.slice(0,17) }, centerA);
  const id = Array.isArray(a.body) ? a.body[0]?.warranty_id : a.body?.warranty_id ?? a.body; assert(a.response.ok && id, `Activation failed ${label}: ${JSON.stringify(a.body)}`); return { id };
}
export async function resolution(label, remedy = null, party = partyA) {
  const w = await warranty(label); const claimId = randomUUID(); const resolutionId = randomUUID();
  run(`insert into public.warranty_claims(id,request_id,warranty_id,claim_number,category,affected_area,description,status,submitted_at,closed_at,created_at,updated_at,decided_by_profile_id,decision_reason,customer_decision_message,decided_at)
       values(${uq(claimId)},${uq(randomUUID())},${uq(w.id)},${tq(claimNo())},'other','MACRO-12A11',${tq(`MACRO-12A11:${label}`)},'approved',now()-interval '3 sec',null,now()-interval '4 sec',now()-interval '2 sec',${uq(adminId)},'12A11 approved race fixture.','تم قبول المطالبة لاختبار التزامن.',now()-interval '2 sec');
       insert into public.warranty_claim_resolutions(id,claim_id,status,authorized_by_profile_id,authorized_at,created_at,updated_at) values(${uq(resolutionId)},${uq(claimId)},'authorized',${uq(adminId)},now()-interval '1 sec',now()-interval '1 sec',now()-interval '1 sec');`);
  if (remedy) { const a = await userRpc("assign_warranty_claim_resolution", { p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_remedy_kind: remedy, p_performing_center_party_id: party }, admin); assert(a.response.ok, `Assign failed ${label}: ${JSON.stringify(a.body)}`); }
  return { warrantyId: w.id, claimId, resolutionId };
}
export async function evidence(resolutionId, label) {
  const bytes = Buffer.from([0xff,0xd8,0xff,0xe0,...Buffer.from(`macro-${label}-${resolutionId}`)]); const digest = createHash("sha256").update(bytes).digest("hex");
  const path = `resolutions/${resolutionId}/completion/1-${digest}.jpg`;
  const staged = await userRpc("register_warranty_claim_resolution_completion_evidence_stage", {
    p_resolution_id: resolutionId,
    p_slot: 1,
    p_storage_path: path,
    p_mime_type: "image/jpeg",
    p_size_bytes: bytes.length,
  }, centerA);
  assert(staged.response.ok && /^[0-9a-f-]{36}$/i.test(String(staged.body)),
    `Evidence stage registration failed ${label}: ${staged.response.status} ${JSON.stringify(staged.body)}`);
  const u = await req(`/storage/v1/object/warranty-claim-evidence/${path}`, { method: "POST", raw: bytes, type: "image/jpeg" }); assert(u.response.ok, `Evidence upload failed ${label}`); return path;
}
export async function reserve(resolutionId, rollId) {
  const r = await userRpc("reserve_claim_resolution_roll", { p_action_request_id: randomUUID(), p_resolution_id: resolutionId, p_roll_id: rollId }, admin); assert(r.response.ok, `Reserve failed: ${JSON.stringify(r.body)}`); return r.body;
}
export async function openCandidate(candidate) { const r = await userRpc("open_roll", { p_request_id: randomUUID(), p_roll_serial: candidate.serial }, centerA); assert(r.response.ok, `Candidate open failed: ${JSON.stringify(r.body)}`); }
