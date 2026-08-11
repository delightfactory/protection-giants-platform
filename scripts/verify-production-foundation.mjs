const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Production-Foundation-Test-2026!";
const adminEmail = "production-foundation-admin@example.test";
const dealerEmail = "production-foundation-dealer@example.test";

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
  if (!response.ok || !body?.id) {
    throw new Error(`Could not create ${role} user (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function signIn(email) {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Could not sign in ${email} (${response.status}): ${JSON.stringify(body)}`);
  }
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
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label} failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

await adminCreateUser({
  email: adminEmail,
  role: "admin",
  displayName: "مسؤول اختبار أوامر الإنتاج",
});
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

if (!created.response.ok || typeof created.body !== "string") {
  throw new Error(`Production RPC failed (${created.response.status}): ${JSON.stringify(created.body)}`);
}
const orderId = created.body;

const order = expectSingleRow(
  await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=*`, { token: adminToken }),
  "Production order read",
);
if (!/^PG-PO-20260811-[0-9]{8}$/.test(order.order_number) || order.total_rolls !== 5) {
  throw new Error(`Production order header is inconsistent: ${JSON.stringify(order)}`);
}

const lotsResult = await rest(
  `production_lots?production_order_id=eq.${encodeURIComponent(orderId)}&select=*&order=lot_sequence.asc`,
  { token: adminToken },
);
if (!lotsResult.response.ok || !Array.isArray(lotsResult.body) || lotsResult.body.length !== 2) {
  throw new Error(`Expected two production lots: ${JSON.stringify(lotsResult.body)}`);
}
if (lotsResult.body.reduce((sum, lot) => sum + lot.roll_count, 0) !== 5) {
  throw new Error(`Lot quantities do not match order total: ${JSON.stringify(lotsResult.body)}`);
}
if (!lotsResult.body.every((lot, index) => lot.lot_sequence === index + 1 && /^PG-L-20260811-[0-9]{8}-[0-9]{2}$/.test(lot.lot_number))) {
  throw new Error(`Generated lot identities are invalid: ${JSON.stringify(lotsResult.body)}`);
}

const rollsResult = await rest(
  `rolls?production_order_id=eq.${encodeURIComponent(orderId)}&select=*&order=serial_number.asc`,
  { token: adminToken },
);
if (!rollsResult.response.ok || !Array.isArray(rollsResult.body) || rollsResult.body.length !== 5) {
  throw new Error(`Expected five generated rolls: ${JSON.stringify(rollsResult.body)}`);
}

const serials = new Set(rollsResult.body.map((roll) => roll.serial_number));
const erpSerials = new Set(rollsResult.body.map((roll) => roll.erp_serial));
if (serials.size !== 5 || erpSerials.size !== 5) {
  throw new Error("Generated roll identities are not unique.");
}
for (const roll of rollsResult.body) {
  if (!/^PG-R-20260811-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/.test(roll.serial_number)) {
    throw new Error(`Invalid internal roll serial: ${roll.serial_number}`);
  }
  if (!/^ERP-[A-F0-9]{16}$/.test(roll.erp_serial)) {
    throw new Error(`Invalid ERP serial: ${roll.erp_serial}`);
  }
}

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
if (directInsert.response.ok) {
  throw new Error("Authenticated admin unexpectedly bypassed the atomic production RPC with a direct roll insert.");
}

const dealer = expectSingleRow(
  await rest("dealers?select=id", {
    method: "POST",
    token: adminToken,
    body: { code: "PROD-DEALER", name: "وكيل اختبار الإنتاج", country_code: "EG" },
  }),
  "Production smoke dealer creation",
);
await adminCreateUser({
  email: dealerEmail,
  role: "dealer",
  dealerId: dealer.id,
  displayName: "مستخدم وكيل اختبار الإنتاج",
});
const dealerToken = await signIn(dealerEmail);

const dealerRead = await rest(`production_orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_number`, { token: dealerToken });
if (!dealerRead.response.ok || !Array.isArray(dealerRead.body) || dealerRead.body.length !== 0) {
  throw new Error(`Dealer unexpectedly read production data: ${JSON.stringify(dealerRead.body)}`);
}

const dealerCreate = await rpc(
  "create_production_order",
  {
    p_product_id: product.id,
    p_production_date: "2026-08-11",
    p_lots: [{ quantity: 1 }],
    p_source_reference: null,
    p_notes: null,
  },
  dealerToken,
);
if (dealerCreate.response.ok) {
  throw new Error("Dealer unexpectedly created a production order.");
}

const orderCountBeforeInvalid = await rest("production_orders?select=id", { token: adminToken });
if (!orderCountBeforeInvalid.response.ok || !Array.isArray(orderCountBeforeInvalid.body)) {
  throw new Error(`Could not read production order count: ${JSON.stringify(orderCountBeforeInvalid.body)}`);
}

const invalidCreate = await rpc(
  "create_production_order",
  {
    p_product_id: product.id,
    p_production_date: "2026-08-11",
    p_lots: [{ quantity: 2 }, { quantity: 0 }],
    p_source_reference: null,
    p_notes: null,
  },
  adminToken,
);
if (invalidCreate.response.ok) {
  throw new Error("Invalid lot quantity unexpectedly created a production order.");
}

const orderCountAfterInvalid = await rest("production_orders?select=id", { token: adminToken });
if (!orderCountAfterInvalid.response.ok || !Array.isArray(orderCountAfterInvalid.body)) {
  throw new Error(`Could not re-read production order count: ${JSON.stringify(orderCountAfterInvalid.body)}`);
}
if (orderCountAfterInvalid.body.length !== orderCountBeforeInvalid.body.length) {
  throw new Error("Failed production creation left a partial production-order record behind.");
}

const archived = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,status`, {
  method: "PATCH",
  token: adminToken,
  body: { status: "archived" },
});
expectSingleRow(archived, "Archive production smoke product");

const archivedProductCreate = await rpc(
  "create_production_order",
  {
    p_product_id: product.id,
    p_production_date: "2026-08-11",
    p_lots: [{ quantity: 1 }],
    p_source_reference: null,
    p_notes: null,
  },
  adminToken,
);
if (archivedProductCreate.response.ok) {
  throw new Error("Archived product unexpectedly accepted a new production order.");
}

console.log("Production order / lot / roll foundation smoke passed.");
