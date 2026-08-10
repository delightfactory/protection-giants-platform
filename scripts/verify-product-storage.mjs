const apiUrl = process.env.API_URL;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Local Supabase API_URL, SERVICE_ROLE_KEY and ANON_KEY are required.");
}

const bucket = "product-assets";
const objectPath = "ci/product-storage-smoke.png";
const storageHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const bucketResponse = await fetch(`${apiUrl}/storage/v1/bucket/${bucket}`, {
  headers: storageHeaders,
});
const bucketBody = await readJson(bucketResponse);

if (!bucketResponse.ok || bucketBody?.public !== false) {
  throw new Error(`Private Product asset bucket is unavailable (${bucketResponse.status}): ${JSON.stringify(bucketBody)}`);
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZxvAAAAAASUVORK5CYII=",
  "base64",
);

const uploadResponse = await fetch(`${apiUrl}/storage/v1/object/${bucket}/${objectPath}`, {
  method: "POST",
  headers: {
    ...storageHeaders,
    "Content-Type": "image/png",
    "x-upsert": "false",
  },
  body: tinyPng,
});
const uploadBody = await readJson(uploadResponse);

if (!uploadResponse.ok) {
  throw new Error(`Product asset Storage upload failed (${uploadResponse.status}): ${JSON.stringify(uploadBody)}`);
}

try {
  const signResponse = await fetch(`${apiUrl}/storage/v1/object/sign/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      ...storageHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const signBody = await readJson(signResponse);

  if (!signResponse.ok || !(signBody?.signedURL || signBody?.signedUrl)) {
    throw new Error(`Product asset signed URL creation failed (${signResponse.status}): ${JSON.stringify(signBody)}`);
  }

  const anonymousDownload = await fetch(`${apiUrl}/storage/v1/object/authenticated/${bucket}/${objectPath}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (anonymousDownload.ok) {
    throw new Error("Anonymous access unexpectedly downloaded an object from the private Product asset bucket.");
  }
} finally {
  const deleteResponse = await fetch(`${apiUrl}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      ...storageHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [objectPath] }),
  });
  const deleteBody = await readJson(deleteResponse);

  if (!deleteResponse.ok) {
    throw new Error(`Product asset Storage cleanup failed (${deleteResponse.status}): ${JSON.stringify(deleteBody)}`);
  }
}

console.log("Product Storage API smoke test passed.");
