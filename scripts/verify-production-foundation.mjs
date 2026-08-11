const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Production-Foundation-Test-2026!";
const adminEmail = "production-foundation-admin@example.test";
const dealerEmail = "production-foundation-dealer@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function adminCreateUser({ email, role, dealerId = null, displayName }) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role,
          dealer_id: dealerId,
          installation_center_id: null,
        },
      },
      user_metadata: { display_name: displayName },
    }),
  });
  const body = await readJson(response);
  assert(response.ok && body?.id, `Could not create ${role} user (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function signIn(email) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  assert(response.ok && body?.access_token, `Could not sign in ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(path, { method = "GET", token = null, body = undefined } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token ?? anonKey}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }
  const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

async function rpc(name, body, token) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
}

function expectSingleRow(result, label) {
  assert(
    result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label} failed (${result.response.status}): ${JSON.stringify(result.body)}`,
  );
  return result.body[0];
}

await adminCreateUser({ email: adminEmail, role: "admin", displayName: "مسؤول اختبار أوامر الإنتاج" });
const adminToken = await signIn(adminEmail);

const product = expectSingleRow(
  await rest("products?select=id,code,name,status", {
    method: "POST",
    token: adminToken,
    body: {
      code: "PG-PRODUCTION-TEST",
      name: "Production Test PPF",
      slug: "production-test-ppf",
      product_type: "PPF",
      category: "Paint Protection Film",
      version_name: "Test",
      width_mm: 1524,
      length_m: 15,
      thickness_mil: 7.5,
      weight_kg: 12.5,
      origin_country: "USA",
      default_warranty_months: 120,
      marketing_description: "منتج اختبار دورة الإنتاج.",
      technical_description: "مرجع لاختبار إنشاء أوامر الإنتاج واللفات.",
      features: ["Production smoke fixture"],
      warranty_coverage: "تغطية اختبارية.",
      care_instructions: "تعليمات عناية اختبارية.",
      publication_status: "draft",
    },
  }),
  "Production smoke product creation",
);

const created = await rpc(
  "create_production_order",
  {
    p_product_id: product.id,
    p_production_date: "2026-08-11",
    p_lots: [
      { quantity: 2, source_reference: "FACTORY-A" },
      { quantity: 3, source_reference: "FACTORY-B" },
    ],
    p_source_reference: "SOURCE-PO-1001",
    p_notes: "Atomic production smoke test",
  },
  adminToken,
);
assert(created.response.ok && typeof created.body === "string", `Production RPC failed: ${JSON.stringify(created.body)}`);
const orderId = created.body;

const order = expectSingleRow(
  await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=*`, { token: adminToken }),
  "Production order read",
);
assert(/^PG-PO-20260811-[0-9]{8}$/.test(order.order_number), `Invalid order number: ${order.order_number}`);
assert(order.total_rolls === 5 && order.status === "generated", `Invalid production header: ${JSON.stringify(order)}`);
assert(
  order.product_code_snapshot === "PG-PRODUCTION-TEST"
    && order.product_name_snapshot === "Production Test PPF"
    && order.product_version_snapshot === "Test"
    && Number(order.width_mm_snapshot) === 1524
    && Number(order.length_m_snapshot) === 15
    && Number(order.thickness_mil_snapshot) === 7.5
    && Number(order.weight_kg_snapshot) === 12.5
    && order.origin_country_snapshot === "USA",
  `Invalid Product snapshot: ${JSON.stringify(order)}`,
);

const lotsResult = await rest(
  `production_lots?production_order_id=eq.${encodeURIComponent(orderId)}&select=*&order=lot_sequence.asc`,
  { token: adminToken },
);
assert(lotsResult.response.ok && Array.isArray(lotsResult.body) && lotsResult.body.length === 2, "Expected two Lots.");
assert(lotsResult.body.reduce((sum, lot) => sum + lot.roll_count, 0) === 5, "Lot total does not match order total.");
assert(
  lotsResult.body.every((lot, index) => lot.lot_sequence === index + 1 && /^PG-L-20260811-[0-9]{8}-[0-9]{2}$/.test(lot.lot_number)),
  `Invalid Lot identities: ${JSON.stringify(lotsResult.body)}`,
);

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=*&order=serial_number.asc`,
  { token: adminToken },
);
assert(rollsResult.response.ok && Array.isArray(rollsResult.body) && rollsResult.body.length === 5, "Expected five Rolls.");
assert(new Set(rollsResult.body.map((roll) => roll.serial_number)).size === 5, "Internal Roll serials are not unique.");
assert(new Set(rollsResult.body.map((roll) => roll.erp_serial)).size === 5, "ERP serials are not unique.");
for (const roll of rollsResult.body) {
  assert(/^PG-R-20260811-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/.test(roll.serial_number), `Invalid Roll serial: ${roll.serial_number}`);
  assert(/^ERP-[A-F0-9]{16}$/.test(roll.erp_serial), `Invalid ERP serial: ${roll.erp_serial}`);
}

// Non-physical Product content remains editable; historical production still uses its snapshot.
expectSingleRow(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,name`, {
    method: "PATCH",
    token: adminToken,
    body: { name: "Production Test PPF Updated" },
  }),
  "Non-physical Product edit after production",
);
const historicalOrder = expectSingleRow(
  await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=product_name_snapshot,width_mm_snapshot`, { token: adminToken }),
  "Historical production snapshot read",
);
assert(
  historicalOrder.product_name_snapshot === "Production Test PPF" && Number(historicalOrder.width_mm_snapshot) === 1524,
  `Historical production snapshot drifted: ${JSON.stringify(historicalOrder)}`,
);

// A produced SKU cannot silently become a different physical specification.
const lockedSpecEdit = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,width_mm`, {
  method: "PATCH",
  token: adminToken,
  body: { width_mm: 1600 },
});
assert(!lockedSpecEdit.response.ok, "Produced SKU physical specification unexpectedly changed.");

const directInsert = await rest("rolls?select=id", {
  method: "POST",
  token: adminToken,
  body: {
    product_id: product.id,
    production_order_id: orderId,
    production_lot_id: lotsResult.body[0].id,
    roll_index: 99,
    serial_number: "PG-R-20260811-99999999-01-0099",
    erp_serial: "ERP-AAAAAAAAAAAAAAAA",
  },
});
assert(!directInsert.response.ok, "Admin bypassed the atomic RPC with a direct Roll insert.");
const directOrderPatch = await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}`, {
  method: "PATCH",
  token: adminToken,
  body: { total_rolls: 99 },
});
assert(!directOrderPatch.response.ok, "Admin directly updated immutable production data.");
const directLotDelete = await rest(`production_lots?id=eq.${encodeURIComponent(lotsResult.body[0].id)}`, {
  method: "DELETE",
  token: adminToken,
});
assert(!directLotDelete.response.ok, "Admin directly deleted immutable production data.");

const incompleteProduct = expectSingleRow(
  await rest("products?select=id", {
    method: "POST",
    token: adminToken,
    body: {
      code: "PG-INCOMPLETE-PROD",
      name: "Incomplete Production Product",
      slug: "incomplete-production-product",
      default_warranty_months: 12,
    },
  }),
  "Incomplete product fixture creation",
);
const incompleteCreate = await rpc(
  "create_production_order",
  { p_product_id: incompleteProduct.id, p_production_date: "2026-08-11", p_lots: [{ quantity: 1 }] },
  adminToken,
);
assert(!incompleteCreate.response.ok, "Incomplete Product unexpectedly entered production.");

const dealer = expectSingleRow(
  await rest("dealers?select=id", {
    method: "POST",
    token: adminToken,
    body: { code: "PROD-DEALER", name: "وكيل اختبار الإنتاج", country_code: "EG" },
  }),
  "Production smoke dealer creation",
);
await adminCreateUser({ email: dealerEmail, role: "dealer", dealerId: dealer.id, displayName: "مستخدم وكيل اختبار الإنتاج" });
const dealerToken = await signIn(dealerEmail);
const dealerRead = await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=id`, { token: dealerToken });
assert(dealerRead.response.ok && Array.isArray(dealerRead.body) && dealerRead.body.length === 0, "Dealer read production data.");
assert(
  !(await rpc("create_production_order", { p_product_id: product.id, p_production_date: "2026-08-11", p_lots: [{ quantity: 1 }] }, dealerToken)).response.ok,
  "Dealer created production data.",
);
assert(
  !(await rpc("void_production_order", { p_order_id: orderId, p_reason: "Dealer must not void production" }, dealerToken)).response.ok,
  "Dealer voided a production order.",
);

const countBeforeInvalid = await rest("production_orders?select=id", { token: adminToken });
assert(countBeforeInvalid.response.ok && Array.isArray(countBeforeInvalid.body), "Could not count production orders.");
assert(
  !(await rpc("create_production_order", {
    p_product_id: product.id,
    p_production_date: "2026-08-11",
    p_lots: [{ quantity: 2 }, { quantity: 0 }],
  }, adminToken)).response.ok,
  "Invalid Lot quantity created an order.",
);
assert(
  !(await rpc("create_production_order", {
    p_product_id: product.id,
    p_production_date: "2026-08-11",
    p_lots: [{ quantity: "2" }],
  }, adminToken)).response.ok,
  "String Lot quantity bypassed the RPC contract.",
);
const countAfterInvalid = await rest("production_orders?select=id", { token: adminToken });
assert(
  countAfterInvalid.response.ok && Array.isArray(countAfterInvalid.body) && countAfterInvalid.body.length === countBeforeInvalid.body.length,
  "Failed production creation left a partial order.",
);

const voidReason = "اختبار إبطال أمر لم يمثل إنتاجًا فعليًا";
const voided = await rpc("void_production_order", { p_order_id: orderId, p_reason: voidReason }, adminToken);
assert(voided.response.ok && voided.body === orderId, `Admin could not void order: ${JSON.stringify(voided.body)}`);
const voidedAgain = await rpc("void_production_order", { p_order_id: orderId, p_reason: "Repeated safe void request" }, adminToken);
assert(voidedAgain.response.ok && voidedAgain.body === orderId, "Repeated void was not idempotent.");
const voidedOrder = expectSingleRow(
  await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=status,void_reason,voided_by,voided_at`, { token: adminToken }),
  "Voided order read",
);
assert(
  voidedOrder.status === "voided" && voidedOrder.void_reason === voidReason && voidedOrder.voided_by && voidedOrder.voided_at,
  `Invalid void audit: ${JSON.stringify(voidedOrder)}`,
);
const retainedLots = await rest(`production_lots?production_order_id=eq.${encodeURIComponent(orderId)}&select=id`, { token: adminToken });
const retainedRolls = await rest(`rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=id`, { token: adminToken });
assert(retainedLots.response.ok && retainedLots.body.length === 2, "Voiding removed Lots.");
assert(retainedRolls.response.ok && retainedRolls.body.length === 5, "Voiding removed Roll identities.");

// With no operational production left for this Product, a physical correction becomes possible again.
expectSingleRow(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,width_mm`, {
    method: "PATCH",
    token: adminToken,
    body: { width_mm: 1600 },
  }),
  "Physical Product correction after all production was voided",
);
const preservedAfterVoid = expectSingleRow(
  await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=width_mm_snapshot`, { token: adminToken }),
  "Voided snapshot preservation read",
);
assert(Number(preservedAfterVoid.width_mm_snapshot) === 1524, "Voided historical snapshot changed after Product correction.");

expectSingleRow(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,status`, {
    method: "PATCH",
    token: adminToken,
    body: { status: "archived" },
  }),
  "Archive production smoke product",
);
assert(
  !(await rpc("create_production_order", { p_product_id: product.id, p_production_date: "2026-08-11", p_lots: [{ quantity: 1 }] }, adminToken)).response.ok,
  "Archived Product unexpectedly accepted new production.",
);

console.log("Production order / lot / roll foundation closure smoke passed.");
