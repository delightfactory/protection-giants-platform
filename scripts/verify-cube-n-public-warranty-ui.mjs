import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(source, fragment, message) {
  assert(source.includes(fragment), message);
}

const serverMap = read("lib/warranty/public-warranty.ts");
const page = read("app/(public)/w/[publicCode]/page.tsx");
const notFound = read("app/(public)/w/[publicCode]/not-found.tsx");
const css = read("app/(public)/w/[publicCode]/page.module.css");
const landing = read("app/(public)/warranty/page.tsx");

includes(serverMap, 'import "server-only"', "Public Warranty mapping must remain server-only.");
includes(serverMap, "createSupabasePublicClient", "Public Warranty reads must use the anonymous public Supabase client.");
assert(!serverMap.includes("createSupabaseServerClient"), "Signed-in server sessions must not change bearer-link visibility.");
includes(serverMap, "/^[0-9a-f]{64}$/", "Public Warranty code must retain its exact 64-character lowercase hex format guard.");
includes(serverMap, 'rpc("resolve_public_warranty"', "Public Warranty UI must resolve only through the narrow public RPC.");
includes(serverMap, 'data.length !== 1', "Unexpected resolver multiplicity must fail closed.");
includes(serverMap, 'kind: "temporarily_unavailable"', "Runtime shape failures must map to a safe temporary-unavailable state.");
assert(!serverMap.includes("console."), "Bearer public codes must not enter application console logging.");

for (const state of [
  "active",
  "expired",
  "not_activated",
  "no_current_warranty_after_void",
  "unavailable_for_warranty",
  "temporarily_unavailable",
  "not_found",
]) {
  includes(serverMap, `\"${state}\"`, `Server mapping is missing public state ${state}.`);
}

includes(page, 'export const dynamic = "force-dynamic"', "Public Warranty page must remain dynamic.");
includes(page, "export const revalidate = 0", "Public Warranty page must not serve a stale revalidated Warranty state.");
includes(page, 'referrer: "no-referrer"', "Bearer Warranty page must suppress outbound referrer leakage.");
includes(page, "index: false", "Bearer Warranty pages must remain noindex.");
includes(page, "follow: false", "Bearer Warranty pages must remain nofollow.");
includes(page, "resolvePublicWarranty(publicCode)", "Page must resolve the bearer code only through the server mapping.");
includes(page, 'if (view.kind === "not_found") notFound()', "Malformed and unknown public codes must share the route 404 experience.");

for (const copy of [
  "الضمان ساري",
  "انتهت مدة الضمان",
  "لم يتم تفعيل الضمان بعد",
  "لا يوجد ضمان حالي على هذا الرول",
  "هذا الرول غير متاح لتفعيل الضمان",
  "بيانات الضمان غير متاحة مؤقتًا",
  "رقم الضمان",
  "تاريخ التفعيل",
  "نهاية التغطية",
  "مركز التركيب",
  "السيارة",
]) {
  includes(page, copy, `Public Warranty page is missing required Arabic copy: ${copy}`);
}

// Cube N remains an anonymous minimal projection. Cube P is allowed to add only
// one same-origin affordance that enters the separately phone-verified Claim
// surface; no Claim record, status, evidence or customer identity may leak here.
for (const forbidden of [
  "customerName",
  "customerPhone",
  "customerEmail",
  "vehicleVin",
  "vehiclePlate",
  "rollSerial",
  "erpSerial",
  "voidReason",
  "OTP",
]) {
  assert(!page.includes(forbidden) && !serverMap.includes(forbidden), `Public Warranty surface leaked deferred/private field or action ${forbidden}.`);
}

for (const privateClaimFragment of [
  "currentOpenClaim",
  "recentClosedClaims",
  "claimNumber",
  "claimId",
  "claimStatusLabel",
  "evidenceCount",
  "evidencePaths",
  "submitWarrantyClaim",
  "verifyWarrantyClaimPhone",
  "getFreshClaimAccess",
  "warranty_claims",
  "warranty_claim_events",
  "warranty_claim_evidence",
]) {
  assert(!page.includes(privateClaimFragment), `Anonymous Warranty page leaked private Claim projection/action ${privateClaimFragment}.`);
}
assert(!serverMap.includes("claim") && !serverMap.includes("Claim"),
  "Cube N anonymous resolver must remain completely unaware of Claim data/lifecycle state.");

includes(page, 'import Link from "next/link"', "Cube P Claim affordance must use the framework same-origin Link component.");
includes(page, 'view.kind === "active" || view.kind === "expired"',
  "Claim entry affordance must remain bounded to effective active/expired Warranty states only.");
includes(page, '<Link href={`/w/${publicCode}/claim`}>',
  "Public Warranty may link only to the permanent-code-scoped, phone-verified Claim entry route.");
includes(page, 'view.kind === "active" ? "طلب خدمة الضمان" : "متابعة المطالبات"',
  "Active and expired Warranty states need the frozen Cube P customer-safe Claim affordance copy.");
const hrefCount = (page.match(/\bhref=/g) ?? []).length;
assert(hrefCount === 1, `Anonymous Warranty page must contain exactly one bounded navigation affordance; found ${hrefCount}.`);
assert(!/href\s*=\s*["']https?:/i.test(page), "Bearer Warranty page must not add outbound external links.");

assert(!/<form\b/i.test(page), "Public Warranty bearer page must not add a manual lookup form.");
assert(!/<input\b/i.test(page), "Public Warranty bearer page must not add identifier search inputs.");

includes(notFound, "تعذر فتح الضمان من هذا الرابط", "Unknown/malformed links need one generic Arabic invalid-link state.");
assert(!notFound.includes("publicCode"), "Invalid-link UI must never echo the submitted bearer code.");
assert(!/<form\b/i.test(notFound) && !/<input\b/i.test(notFound), "Invalid-link state must not offer enumerable identifier search.");
includes(notFound, 'href="/warranty"', "Invalid Warranty links need a same-origin recovery path back to QR guidance.");
includes(notFound, 'href="/centers"', "Invalid Warranty links need a same-origin Center-directory support path.");
assert(!/href\s*=\s*["']https?:/i.test(notFound), "Invalid-link recovery must not leak bearer context to external destinations.");

includes(landing, "امسح رمز QR الخاص بالضمان", "Warranty landing must guide customers to the official QR path.");
includes(landing, "نسخة السيارة أو شهادة الضمان أو الفاتورة", "Warranty landing must reference the three approved future customer copies.");
assert(!/<form\b/i.test(landing) && !/<input\b/i.test(landing), "Warranty landing must not introduce manual public lookup.");
assert(!landing.includes("لم يُفعّل للعامة بعد"), "Warranty landing must not retain the pre-Cube-N placeholder state.");

includes(css, "width: min(calc(100% - 24px), 780px)", "Public Warranty card needs a bounded mobile-first content width.");
includes(css, "grid-template-columns: repeat(2, minmax(0, 1fr))", "Warranty facts need coherent wider-screen layout.");
includes(css, "@media (max-width: 620px)", "Public Warranty presentation needs an explicit phone breakpoint.");
includes(css, "grid-template-columns: 1fr", "Warranty facts must collapse to one column on phones.");
includes(css, "overflow-wrap: anywhere", "Public Warranty values must not create horizontal mobile overflow.");

console.log("Cube N N3 public Warranty UI contract verified.");
