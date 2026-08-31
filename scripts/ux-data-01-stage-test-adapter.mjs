// UX-DATA-01 legacy verifier adapter.
//
// Existing Cube Q/R runtime verifiers historically upload operational evidence
// directly with the local service-role key and then call the authoritative user
// RPC. Production no longer does that: its server actions register a stage before
// Storage upload. This adapter is test-only glue so the unchanged legacy fixtures
// satisfy the new DB invariant without weakening production RPCs or triggers.
//
// It captures metadata for local test uploads and, immediately before a legacy
// final business RPC, registers the matching stage using that RPC caller's JWT.

const originalFetch = globalThis.fetch;
const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (typeof originalFetch !== "function") {
  throw new Error("UX-DATA-01 test adapter requires global fetch.");
}

const uploads = new Map();
const registered = new Set();

function headersObject(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function byteLength(body) {
  if (body == null) return 0;
  if (typeof body === "string") return Buffer.byteLength(body);
  if (Buffer.isBuffer(body)) return body.length;
  if (body instanceof Uint8Array) return body.byteLength;
  if (body instanceof ArrayBuffer) return body.byteLength;
  return 0;
}

function requestUrl(input) {
  if (typeof input === "string" || input instanceof URL) return new URL(input);
  return new URL(input.url);
}

function parseJsonBody(body) {
  if (typeof body !== "string") return null;
  try { return JSON.parse(body); } catch { return null; }
}

function registrationFor(rpcName, body, path) {
  if (rpcName === "submit_warranty_claim_inspection") {
    const match = path.match(/^inspections\/([0-9a-f-]{36})\/([1-5])-[0-9a-f]{64}\.(jpg|png|webp)$/i);
    if (!match || match[1].toLowerCase() !== String(body?.p_inspection_id ?? "").toLowerCase()) return null;
    return {
      rpc: "register_warranty_claim_inspection_evidence_stage",
      args: { p_inspection_id: body.p_inspection_id, p_slot: Number(match[2]) },
    };
  }

  if (rpcName === "complete_warranty_claim_resolution") {
    const match = path.match(/^resolutions\/([0-9a-f-]{36})\/completion\/([1-5])-[0-9a-f]{64}\.(jpg|png|webp)$/i);
    if (!match || match[1].toLowerCase() !== String(body?.p_resolution_id ?? "").toLowerCase()) return null;
    return {
      rpc: "register_warranty_claim_resolution_completion_evidence_stage",
      args: { p_resolution_id: body.p_resolution_id, p_slot: Number(match[2]) },
    };
  }

  if (rpcName === "complete_warranty_claim_resolution_by_admin_recovery") {
    const match = path.match(/^resolutions\/([0-9a-f-]{36})\/completion\/([1-5])-[0-9a-f]{64}\.(jpg|png|webp)$/i);
    if (!match || match[1].toLowerCase() !== String(body?.p_resolution_id ?? "").toLowerCase()) return null;
    return {
      rpc: "register_warranty_claim_admin_recovery_evidence_stage",
      args: { p_resolution_id: body.p_resolution_id, p_slot: Number(match[2]) },
    };
  }

  return null;
}

async function registerLegacyEvidence(rpcName, body, requestHeaders) {
  if (!apiUrl || !anonKey || !Array.isArray(body?.p_evidence_paths)) return;

  const authorization = requestHeaders.authorization ?? requestHeaders.Authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return;

  for (const path of body.p_evidence_paths) {
    const upload = uploads.get(path);
    const registration = registrationFor(rpcName, body, path);
    if (!upload || !registration) continue;

    const key = `${registration.rpc}|${authorization}|${path}`;
    if (registered.has(key)) continue;

    const response = await originalFetch(`${apiUrl}/rest/v1/rpc/${registration.rpc}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...registration.args,
        p_storage_path: path,
        p_mime_type: upload.mimeType,
        p_size_bytes: upload.sizeBytes,
      }),
    });

    // Authorization/state failures are intentionally left to the original final
    // RPC so legacy tests continue asserting their canonical error contract.
    if (response.ok) registered.add(key);
  }
}

globalThis.fetch = async function uxData01Fetch(input, init = {}) {
  const url = requestUrl(input);
  const method = String(init.method ?? (typeof input === "object" && input?.method) ?? "GET").toUpperCase();
  const requestHeaders = headersObject(init.headers ?? (typeof input === "object" ? input?.headers : undefined));

  const storagePrefix = "/storage/v1/object/warranty-claim-evidence/";
  if (method === "POST" && url.pathname.startsWith(storagePrefix)) {
    const path = decodeURIComponent(url.pathname.slice(storagePrefix.length));
    const mimeType = requestHeaders["Content-Type"] ?? requestHeaders["content-type"];
    const sizeBytes = byteLength(init.body);
    if (/^(inspections\/|resolutions\/)/.test(path) && typeof mimeType === "string" && sizeBytes > 0) {
      uploads.set(path, { mimeType, sizeBytes });
    }
    return originalFetch(input, init);
  }

  const rpcPrefix = "/rest/v1/rpc/";
  if (method === "POST" && url.pathname.startsWith(rpcPrefix)) {
    const rpcName = url.pathname.slice(rpcPrefix.length);
    if ([
      "submit_warranty_claim_inspection",
      "complete_warranty_claim_resolution",
      "complete_warranty_claim_resolution_by_admin_recovery",
    ].includes(rpcName)) {
      const body = parseJsonBody(init.body);
      if (body) await registerLegacyEvidence(rpcName, body, requestHeaders);
    }
  }

  return originalFetch(input, init);
};
