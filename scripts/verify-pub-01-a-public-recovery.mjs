import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const resolverPagePath = "app/(public)/r/[serial]/page.tsx";
const legacyRoutePath = "app/(public)/r/[serial]/route.ts";
const rollNotFoundPath = "app/(public)/r/[serial]/not-found.tsx";
const rootNotFoundPath = "app/not-found.tsx";

assert(fs.existsSync(resolverPagePath), "Public Roll QR resolver must be a page so invalid codes can render a branded 404 state.");
assert(!fs.existsSync(legacyRoutePath), "Legacy plain-text Roll QR route handler must be removed.");
assert(fs.existsSync(rollNotFoundPath), "Roll QR route must own a branded not-found recovery state.");
assert(fs.existsSync(rootNotFoundPath), "Root application must own a branded not-found state.");

const resolver = fs.readFileSync(resolverPagePath, "utf8");
const rollNotFound = fs.readFileSync(rollNotFoundPath, "utf8");
const rootNotFound = fs.readFileSync(rootNotFoundPath, "utf8");

assert(resolver.includes("normalizeRollSerial(rawSerial)"),
  "Public Roll resolver must keep canonical serial normalization.");
assert(resolver.includes('rpc(\n    "resolve_public_roll_product_slug"') || resolver.includes('rpc("resolve_public_roll_product_slug"'),
  "Public Roll resolver must keep the narrow public resolver RPC.");
assert(!resolver.includes('.from("rolls")') && !resolver.includes("createSupabaseAdminClient"),
  "Public recovery must not gain direct Roll-table or service-role authority.");
assert(resolver.includes("if (!serial) notFound();") && resolver.includes("if (!productSlug) notFound();"),
  "Malformed and unknown Roll QR values must converge on the same branded not-found path.");
assert(resolver.includes('redirect(`/products/${encodeURIComponent(productSlug)}`)'),
  "Valid Roll QR values must preserve the canonical Product redirect.");
assert(resolver.includes('export const dynamic = "force-dynamic"'),
  "Public Roll resolution must remain dynamic rather than becoming a cached existence oracle.");

assert(rollNotFound.includes("تعذر فتح هذا الرمز")
  && rollNotFound.includes("أعد مسح رمز QR الأصلي")
  && rollNotFound.includes('href="/warranty"')
  && rollNotFound.includes('href="/centers"'),
  "Invalid Roll QR recovery must provide branded re-scan, Warranty guidance and Center-directory paths.");
assert(rollNotFound.includes("لا تعرض هذه الصفحة ما إذا كان رقم أو سجل معين موجودًا داخل النظام"),
  "Roll recovery copy must explicitly preserve non-enumeration expectations.");
assert(!rollNotFound.includes("rawSerial") && !rollNotFound.includes("serial}"),
  "Invalid Roll recovery must not echo the attempted serial back to the public user.");
assert(!/name=["'](?:phone|vin|warranty|serial)/i.test(rollNotFound),
  "Roll recovery must not introduce public identifier lookup fields.");

assert(rootNotFound.includes("SiteHeader") && rootNotFound.includes("SiteFooter") && rootNotFound.includes("EmptyState"),
  "Root 404 must reuse the branded public shell and shared empty-state primitive.");
assert(rootNotFound.includes("الصفحة غير متاحة")
  && rootNotFound.includes('href="/"')
  && rootNotFound.includes('href="/warranty"'),
  "Root 404 must provide safe Home and Warranty recovery paths.");
assert(!rootNotFound.includes(">Not Found<") && !rootNotFound.includes('"Not Found"'),
  "Primary branded 404 UI must not fall back to raw framework-style English Not Found copy.");

console.log("PUB-01-A public recovery contract PASS: branded 404 recovery, safe Roll QR resolution, no public enumeration or invented support lookup.");
