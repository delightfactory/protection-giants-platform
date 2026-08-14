import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const password = "Cube-E-Identity-Test-2026!";
const adminEmail = "cube-e-identity-admin@example.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function createAdmin() {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: adminEmail,
      password,
      email_confirm: true,
      app_metadata: {
        pg_provisioning: {
          version: "operational-v1",
          role: "admin",
        },
      },
      user_metadata: { display_name: "مسؤول اختبار Cube E" },
    }),
  });
  const body = await readJson(response);
  assert(response.ok && body?.id, `Could not create Cube E admin (${response.status}): ${JSON.stringify(body)}`);
}

async function signIn() {
  const response = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password }),
  });
  const body = await readJson(response);
  assert(response.ok && body?.access_token, `Could not sign in Cube E admin: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function rest(path, { method = "GET", token, body } = {}) {
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

function expectOne(result, label) {
  assert(
    result.response.ok && Array.isArray(result.body) && result.body.length === 1,
    `${label} failed (${result.response.status}): ${JSON.stringify(result.body)}`,
  );
  return result.body[0];
}

function productFixture(code, slug, gtin = null) {
  return {
    code,
    gtin,
    name: code,
    slug,
    product_type: "PPF",
    category: "Paint Protection Film",
    version_name: "Cube E",
    width_mm: 1524,
    length_m: 15,
    thickness_mil: 7.5,
    weight_kg: 12.5,
    origin_country: "USA",
    default_warranty_months: 120,
    marketing_description: "Cube E identity verification fixture.",
    technical_description: "Cube E identity verification fixture.",
    features: ["Identity verification"],
    warranty_coverage: "Test coverage.",
    care_instructions: "Test care.",
    publication_status: "draft",
  };
}

await createAdmin();
const adminToken = await signIn();

const gtin13 = "4006381333931";
const gtin12 = "012345678905";
const gtin14 = "10012345000017";

const validProduct = expectOne(
  await rest("products?select=id,gtin", {
    method: "POST",
    token: adminToken,
    body: productFixture("PG-GTIN-VALID", "pg-gtin-valid", gtin13),
  }),
  "Valid GTIN Product creation",
);
assert(validProduct.gtin === gtin13, `GTIN leading/content preservation failed: ${JSON.stringify(validProduct)}`);

const invalidChecksum = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: productFixture("PG-GTIN-BAD", "pg-gtin-bad", "4006381333932"),
});
assert(!invalidChecksum.response.ok, "Database unexpectedly accepted an invalid GTIN check digit.");

const invalidLength = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: productFixture("PG-GTIN-LENGTH", "pg-gtin-length", "1234567890"),
});
assert(!invalidLength.response.ok, "Database unexpectedly accepted an unsupported GTIN length.");

const invalidCharacters = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: productFixture("PG-GTIN-CHARS", "pg-gtin-chars", "40063813339A1"),
});
assert(!invalidCharacters.response.ok, "Database unexpectedly accepted a non-digit GTIN.");

const duplicate = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: productFixture("PG-GTIN-DUP", "pg-gtin-dup", gtin13),
});
assert(!duplicate.response.ok, "Database unexpectedly accepted duplicate Product GTIN.");

const editableProduct = expectOne(
  await rest("products?select=id,gtin", {
    method: "POST",
    token: adminToken,
    body: productFixture("PG-GTIN-EDIT", "pg-gtin-edit", gtin12),
  }),
  "Pre-production GTIN Product creation",
);
expectOne(
  await rest(`products?id=eq.${encodeURIComponent(editableProduct.id)}&select=id,gtin`, {
    method: "PATCH",
    token: adminToken,
    body: { gtin: gtin14 },
  }),
  "Pre-production GTIN change",
);
expectOne(
  await rest(`products?id=eq.${encodeURIComponent(editableProduct.id)}&select=id,gtin`, {
    method: "PATCH",
    token: adminToken,
    body: { gtin: null },
  }),
  "Pre-production GTIN clear",
);

const producedProduct = expectOne(
  await rest("products?select=id,gtin", {
    method: "POST",
    token: adminToken,
    body: productFixture("PG-GTIN-PRODUCED", "pg-gtin-produced"),
  }),
  "Produced Product fixture creation",
);

const production = await rpc("create_production_order", {
  p_request_id: randomUUID(),
  p_product_id: producedProduct.id,
  p_production_date: "2026-08-14",
  p_lots: [{ quantity: 1 }],
  p_source_reference: "CUBE-E-GTIN",
  p_notes: "Cube E GTIN lifecycle verification",
}, adminToken);
assert(production.response.ok && typeof production.body === "string", `Could not create production for GTIN lock test: ${JSON.stringify(production.body)}`);

const anonRollBrowse = await rest("rolls?select=serial_number&limit=1");
assert(
  !anonRollBrowse.response.ok || (Array.isArray(anonRollBrowse.body) && anonRollBrowse.body.length === 0),
  `Anonymous Roll browsing unexpectedly exposed operational Roll data: ${JSON.stringify(anonRollBrowse.body)}`,
);

const firstAssignment = expectOne(
  await rest(`products?id=eq.${encodeURIComponent(producedProduct.id)}&select=id,gtin`, {
    method: "PATCH",
    token: adminToken,
    body: { gtin: gtin12 },
  }),
  "One-time GTIN assignment after production",
);
assert(firstAssignment.gtin === gtin12, "One-time GTIN assignment did not persist exactly.");

const changedAfterProduction = await rest(`products?id=eq.${encodeURIComponent(producedProduct.id)}&select=id,gtin`, {
  method: "PATCH",
  token: adminToken,
  body: { gtin: gtin14 },
});
assert(!changedAfterProduction.response.ok, "Produced Product GTIN unexpectedly changed after assignment.");

const clearedAfterProduction = await rest(`products?id=eq.${encodeURIComponent(producedProduct.id)}&select=id,gtin`, {
  method: "PATCH",
  token: adminToken,
  body: { gtin: null },
});
assert(!clearedAfterProduction.response.ok, "Produced Product GTIN unexpectedly cleared after assignment.");

const lockedRead = expectOne(
  await rest(`products?id=eq.${encodeURIComponent(producedProduct.id)}&select=id,gtin`, { token: adminToken }),
  "Locked GTIN readback",
);
assert(lockedRead.gtin === gtin12, `Produced Product GTIN drifted: ${JSON.stringify(lockedRead)}`);

console.log("Cube E Product GTIN and anonymous Roll-boundary verification passed.");
