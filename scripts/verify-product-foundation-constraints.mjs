const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase API_URL and ANON_KEY are required.");
}

const adminEmail = "product-foundation-admin@example.test";
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

const signInResponse = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email: adminEmail, password }),
});
const signInBody = await readJson(signInResponse);

if (!signInResponse.ok || !signInBody?.access_token) {
  throw new Error(`Product constraint smoke requires the preceding Product Foundation admin fixture (${signInResponse.status}): ${JSON.stringify(signInBody)}`);
}

const token = signInBody.access_token;

async function rest(path, { method = "GET", body = undefined } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
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

const legacyDraft = await rest("products?select=id", {
  method: "POST",
  body: {
    code: "PG-INCOMPLETE",
    slug: "incomplete-product",
    name: "Incomplete Product",
    default_warranty_months: 12,
    marketing_description: "وصف موجود لكن تعريف المنتج غير مكتمل.",
    publication_status: "draft",
  },
});

if (!legacyDraft.response.ok || !Array.isArray(legacyDraft.body) || legacyDraft.body.length !== 1) {
  throw new Error(`Could not create an upgrade-safe incomplete draft fixture (${legacyDraft.response.status}): ${JSON.stringify(legacyDraft.body)}`);
}

const incompleteProductId = legacyDraft.body[0].id;
const invalidPublication = await rest(`products?id=eq.${encodeURIComponent(incompleteProductId)}&select=id,publication_status`, {
  method: "PATCH",
  body: { publication_status: "published" },
});

if (invalidPublication.response.ok) {
  throw new Error(`Database unexpectedly published an incomplete legacy-style Product: ${JSON.stringify(invalidPublication.body)}`);
}

const completeProduct = await rest("products?code=eq.PG-AI-PRO&select=id", { method: "GET" });
if (!completeProduct.response.ok || !Array.isArray(completeProduct.body) || completeProduct.body.length !== 1) {
  throw new Error(`Could not read Product fixture for asset constraints: ${JSON.stringify(completeProduct.body)}`);
}

const productId = completeProduct.body[0].id;
const mismatchedAsset = await rest("product_assets?select=id", {
  method: "POST",
  body: {
    product_id: productId,
    kind: "image",
    storage_path: `${productId}/invalid-image.pdf`,
    original_name: "invalid-image.pdf",
    mime_type: "application/pdf",
    size_bytes: 128,
    visibility: "internal",
    sort_order: 99,
  },
});

if (mismatchedAsset.response.ok) {
  throw new Error(`Database unexpectedly accepted Product asset kind/MIME mismatch: ${JSON.stringify(mismatchedAsset.body)}`);
}

console.log("Product Foundation database constraint smoke test passed.");
