const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const adminEmail = "product-foundation-admin@example.test";
const dealerEmail = "product-foundation-dealer@example.test";
const centerEmail = "product-foundation-center@example.test";
const password = "Product-Foundation-Test-2026!";

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function adminCreateUser({ email, role, dealerId = null, centerId = null, displayName }) {
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
          installation_center_id: centerId,
        },
      },
      user_metadata: {
        display_name: displayName,
      },
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

async function rest(path, { method = "GET", token = null, body = undefined, service = false } = {}) {
  const apiKey = service ? serviceRoleKey : anonKey;
  const authorization = service ? serviceRoleKey : token ?? anonKey;
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${authorization}`,
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

function expectSingleRow(result, label) {
  if (!result.response.ok || !Array.isArray(result.body) || result.body.length !== 1) {
    throw new Error(`${label} failed (${result.response.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body[0];
}

await adminCreateUser({
  email: adminEmail,
  role: "admin",
  displayName: "مسؤول اختبار المنتجات",
});
const adminToken = await signIn(adminEmail);

const completeProduct = {
  code: "PG-AI-PRO",
  name: "AI Pro",
  slug: "ai-pro",
  product_type: "PPF",
  category: "Paint Protection Film",
  version_name: "Pro",
  reference_price: 1200,
  currency_code: "USD",
  width_mm: 1524,
  length_m: 15,
  thickness_mil: 7.5,
  weight_kg: 12.5,
  origin_country: "USA",
  default_warranty_months: 120,
  marketing_description: "فيلم حماية احترافي للطلاء.",
  technical_description: "اختبار مرجعي لمواصفات المنتج.",
  features: ["حماية الطلاء", "سطح شفاف"],
  warranty_coverage: "تغطية ضمان اختبارية وفق سياسة المنتج.",
  care_instructions: "اتباع تعليمات العناية المعتمدة.",
  publication_status: "draft",
};

const inserted = await rest("products?select=*", {
  method: "POST",
  token: adminToken,
  body: completeProduct,
});
const product = expectSingleRow(inserted, "Admin complete product creation");

const draftAnon = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code,name`);
if (!draftAnon.response.ok || !Array.isArray(draftAnon.body) || draftAnon.body.length !== 0) {
  throw new Error(`Anonymous users can unexpectedly read a draft product: ${JSON.stringify(draftAnon.body)}`);
}

const invalidCode = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: { ...completeProduct, code: "bad sku", slug: "bad-sku", name: "Bad SKU" },
});
if (invalidCode.response.ok) {
  throw new Error("Database unexpectedly accepted a non-canonical product code.");
}

const invalidPricePair = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: { ...completeProduct, code: "PG-BAD-PRICE", slug: "bad-price", name: "Bad Price", currency_code: null },
});
if (invalidPricePair.response.ok) {
  throw new Error("Database unexpectedly accepted reference price without currency.");
}

const invalidPublished = await rest("products?select=id", {
  method: "POST",
  token: adminToken,
  body: {
    ...completeProduct,
    code: "PG-BAD-PUBLISH",
    slug: "bad-publish",
    name: "Bad Publish",
    marketing_description: null,
    publication_status: "published",
  },
});
if (invalidPublished.response.ok) {
  throw new Error("Database unexpectedly accepted a published product without marketing description.");
}

const published = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,publication_status`, {
  method: "PATCH",
  token: adminToken,
  body: { publication_status: "published" },
});
expectSingleRow(published, "Admin product publication");

const publicRead = await rest(
  `products?id=eq.${encodeURIComponent(product.id)}&select=id,code,slug,name,product_type,width_mm,length_m,thickness_mil,default_warranty_months,marketing_description`,
);
const publicProduct = expectSingleRow(publicRead, "Anonymous published product read");
if (publicProduct.code !== completeProduct.code || publicProduct.slug !== completeProduct.slug) {
  throw new Error(`Anonymous product payload is unexpected: ${JSON.stringify(publicProduct)}`);
}

const privatePriceRead = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=reference_price,currency_code`);
if (privatePriceRead.response.ok) {
  throw new Error(`Anonymous users unexpectedly received internal reference price data: ${JSON.stringify(privatePriceRead.body)}`);
}

const agent = expectSingleRow(
  await rest("country_agents?select=id,country_code", {
    method: "POST",
    token: adminToken,
    body: { code: "PF-AGENT", name: "وكيل دولة اختبار المنتجات", country_code: "EG" },
  }),
  "Product smoke Country Agent creation",
);

const dealer = expectSingleRow(
  await rest("dealers?select=id,country_agent_id", {
    method: "POST",
    token: adminToken,
    body: {
      code: "PF-DEALER",
      name: "موزع اختبار المنتجات",
      country_code: agent.country_code,
      country_agent_id: agent.id,
    },
  }),
  "Product smoke dealer creation",
);

const center = expectSingleRow(
  await rest("installation_centers?select=id", {
    method: "POST",
    token: adminToken,
    body: { code: "PF-CENTER", name: "مركز اختبار المنتجات", country_code: "EG", city: "Tanta", dealer_id: dealer.id },
  }),
  "Product smoke center creation",
);

await adminCreateUser({
  email: dealerEmail,
  role: "dealer",
  dealerId: dealer.id,
  displayName: "مستخدم موزع اختبار المنتجات",
});
await adminCreateUser({
  email: centerEmail,
  role: "center",
  centerId: center.id,
  displayName: "مستخدم مركز اختبار المنتجات",
});

const dealerToken = await signIn(dealerEmail);
const centerToken = await signIn(centerEmail);

for (const [label, token] of [["dealer", dealerToken], ["center", centerToken]]) {
  const operationalRead = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code,name,status,publication_status`, { token });
  expectSingleRow(operationalRead, `${label} operational product read`);
}

const dealerWrite = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,name`, {
  method: "PATCH",
  token: dealerToken,
  body: { name: "Dealer must not change this" },
});
if (!dealerWrite.response.ok || !Array.isArray(dealerWrite.body) || dealerWrite.body.length !== 0) {
  throw new Error(`Dealer unexpectedly modified Product data: ${JSON.stringify(dealerWrite.body)}`);
}

const unchanged = expectSingleRow(
  await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,name`, { token: adminToken }),
  "Product unchanged after dealer write attempt",
);
if (unchanged.name !== completeProduct.name) {
  throw new Error(`Dealer write changed product name unexpectedly: ${unchanged.name}`);
}

const asset = expectSingleRow(
  await rest("product_assets?select=id,product_id,storage_path,visibility", {
    method: "POST",
    token: adminToken,
    body: {
      product_id: product.id,
      kind: "datasheet",
      label: "Data Sheet",
      storage_path: `${product.id}/ci-product-datasheet.pdf`,
      original_name: "datasheet.pdf",
      mime_type: "application/pdf",
      size_bytes: 128,
      visibility: "public",
      sort_order: 1,
    },
  }),
  "Admin product asset metadata creation",
);

const serviceAssetRead = await rest(`product_assets?id=eq.${encodeURIComponent(asset.id)}&select=id,product_id,visibility`, { service: true });
expectSingleRow(serviceAssetRead, "Service-role public asset metadata read");

const anonAssetRead = await rest(`product_assets?id=eq.${encodeURIComponent(asset.id)}&select=id,product_id,visibility`);
if (anonAssetRead.response.ok) {
  throw new Error(`Anonymous users unexpectedly received product asset metadata directly: ${JSON.stringify(anonAssetRead.body)}`);
}

const bucketResponse = await fetch(`${apiUrl}/storage/v1/bucket/product-assets`, {
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  },
});
const bucketBody = await readJson(bucketResponse);
if (!bucketResponse.ok || bucketBody?.public !== false) {
  throw new Error(`Private product-assets bucket is not available as configured (${bucketResponse.status}): ${JSON.stringify(bucketBody)}`);
}

const archived = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,status`, {
  method: "PATCH",
  token: adminToken,
  body: { status: "archived" },
});
expectSingleRow(archived, "Admin product archive");

const archivedAnon = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,code,name`);
if (!archivedAnon.response.ok || !Array.isArray(archivedAnon.body) || archivedAnon.body.length !== 0) {
  throw new Error(`Archived product unexpectedly remains public: ${JSON.stringify(archivedAnon.body)}`);
}

const reactivated = await rest(`products?id=eq.${encodeURIComponent(product.id)}&select=id,status`, {
  method: "PATCH",
  token: adminToken,
  body: { status: "active" },
});
expectSingleRow(reactivated, "Admin product reactivation");

console.log("Product Foundation regression smoke test passed with Agent hierarchy fixtures.");
