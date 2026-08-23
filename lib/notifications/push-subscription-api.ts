const MAX_PUSH_API_BODY_BYTES = 8 * 1024;
const PUSH_KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;

export const pushSubscriptionStates = ["missing", "disabled", "subscribed"] as const;
export type PushSubscriptionState = (typeof pushSubscriptionStates)[number];

export class PushApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "PushApiError";
  }
}

type JsonRecord = Record<string, unknown>;

function fail(status: number, code: string): never {
  throw new PushApiError(status, code);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(value: JsonRecord, expectedKeys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(400, "PG_PUSH_BODY_INVALID");
  }
}

function normalizeEndpoint(value: unknown): string {
  if (typeof value !== "string") fail(400, "PG_PUSH_BODY_INVALID");

  const endpoint = value.trim();
  if (
    endpoint.length < 16 ||
    endpoint.length > 4096 ||
    /\s/.test(endpoint)
  ) {
    fail(400, "PG_PUSH_ENDPOINT_INVALID");
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    fail(400, "PG_PUSH_ENDPOINT_INVALID");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    fail(400, "PG_PUSH_ENDPOINT_INVALID");
  }

  return endpoint;
}

function normalizePushKey(value: unknown): string {
  if (typeof value !== "string") fail(400, "PG_PUSH_BODY_INVALID");

  const key = value.trim();
  if (key.length < 16 || key.length > 512 || !PUSH_KEY_PATTERN.test(key)) {
    fail(400, "PG_PUSH_KEYS_INVALID");
  }

  return key;
}

export function assertPushApiRequest(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) fail(403, "PG_PUSH_ORIGIN_REQUIRED");

  let suppliedOrigin: string;
  let requestOrigin: string;
  try {
    suppliedOrigin = new URL(originHeader).origin;
    requestOrigin = new URL(request.url).origin;
  } catch {
    fail(403, "PG_PUSH_CROSS_ORIGIN");
  }

  if (suppliedOrigin !== requestOrigin) {
    fail(403, "PG_PUSH_CROSS_ORIGIN");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite.toLowerCase() !== "same-origin") {
    fail(403, "PG_PUSH_CROSS_ORIGIN");
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    fail(415, "PG_PUSH_JSON_REQUIRED");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      fail(400, "PG_PUSH_BODY_INVALID");
    }
    if (parsedLength > MAX_PUSH_API_BODY_BYTES) {
      fail(413, "PG_PUSH_BODY_TOO_LARGE");
    }
  }
}

async function readBoundedJsonObject(request: Request): Promise<JsonRecord> {
  if (!request.body) fail(400, "PG_PUSH_BODY_INVALID");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_PUSH_API_BODY_BYTES) {
        await reader.cancel();
        fail(413, "PG_PUSH_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) fail(400, "PG_PUSH_BODY_INVALID");

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(400, "PG_PUSH_BODY_INVALID");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    fail(400, "PG_PUSH_BODY_INVALID");
  }

  if (!isRecord(parsed)) fail(400, "PG_PUSH_BODY_INVALID");
  return parsed;
}

export async function readPushEndpointInput(request: Request): Promise<{ endpoint: string }> {
  const body = await readBoundedJsonObject(request);
  requireExactKeys(body, ["endpoint"]);
  return { endpoint: normalizeEndpoint(body.endpoint) };
}

export async function readPushRegistrationInput(request: Request): Promise<{
  endpoint: string;
  p256dh: string;
  authSecret: string;
}> {
  const body = await readBoundedJsonObject(request);
  requireExactKeys(body, ["endpoint", "keys"]);
  if (!isRecord(body.keys)) fail(400, "PG_PUSH_BODY_INVALID");
  requireExactKeys(body.keys, ["auth", "p256dh"]);

  return {
    endpoint: normalizeEndpoint(body.endpoint),
    p256dh: normalizePushKey(body.keys.p256dh),
    authSecret: normalizePushKey(body.keys.auth),
  };
}

export function isPushSubscriptionState(value: unknown): value is PushSubscriptionState {
  return typeof value === "string" && pushSubscriptionStates.includes(value as PushSubscriptionState);
}

export function jsonPushApiResponse(payload: object, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export function pushApiErrorResponse(error: unknown): Response {
  if (error instanceof PushApiError) {
    return jsonPushApiResponse({ error: error.code }, error.status);
  }
  return jsonPushApiResponse({ error: "PG_PUSH_OPERATION_FAILED" }, 500);
}

export function pushRpcErrorResponse(error: unknown): Response {
  const message =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  switch (message) {
    case "PG_PUSH_AUTH_REQUIRED":
      return jsonPushApiResponse({ error: "PG_PUSH_UNAUTHENTICATED" }, 401);
    case "PG_PUSH_ACCESS_INACTIVE":
      return jsonPushApiResponse({ error: "PG_PUSH_ACCESS_INACTIVE" }, 403);
    case "PG_PUSH_ENDPOINT_OWNED":
      return jsonPushApiResponse({ error: "PG_PUSH_ENDPOINT_CONFLICT" }, 409);
    case "PG_PUSH_ENDPOINT_INVALID":
    case "PG_PUSH_KEYS_INVALID":
      return jsonPushApiResponse({ error: "PG_PUSH_INPUT_INVALID" }, 400);
    default:
      return jsonPushApiResponse({ error: "PG_PUSH_OPERATION_FAILED" }, 500);
  }
}
