import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

import { DELETE, POST, PUT } from "../app/api/notifications/push-subscription/route.ts";

const origin = "https://platform.example.test";
const endpoint = "https://push.example.test/subscription/device-current";
const p256dh = "BExampleP256dhKey_DeviceCurrent_1234567890";
const authSecret = "AuthSecretDeviceCurrent_1234567890";

function request(method, body, headers = {}) {
  return new Request(`${origin}/api/notifications/push-subscription`, {
    method,
    headers: {
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
    body,
  });
}

function jsonRequest(method, value, headers = {}) {
  return request(method, JSON.stringify(value), headers);
}

function installClient({ user = true, rpcResult } = {}) {
  const rpc = vi.fn(async () => rpcResult ?? { data: null, error: null });
  const getUser = vi.fn(async () => ({
    data: { user: user ? { id: "11111111-1111-4111-8111-111111111111" } : null },
    error: null,
  }));
  createSupabaseServerClientMock.mockResolvedValue({ auth: { getUser }, rpc });
  return { rpc, getUser };
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Cube L Push subscription API security boundary", () => {
  it("rejects missing Origin before opening an authenticated session", async () => {
    const response = await PUT(jsonRequest("PUT", {
      endpoint,
      keys: { p256dh, auth: authSecret },
    }, { Origin: "" }));

    expect(response.status).toBe(403);
    expect(await responseJson(response)).toEqual({ error: "PG_PUSH_ORIGIN_REQUIRED" });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects a foreign Origin before session or body processing", async () => {
    const response = await POST(jsonRequest("POST", { endpoint }, {
      Origin: "https://attacker.example.test",
      "Sec-Fetch-Site": "cross-site",
    }));

    expect(response.status).toBe(403);
    expect(await responseJson(response)).toEqual({ error: "PG_PUSH_CROSS_ORIGIN" });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when Fetch Metadata says the request is not same-origin", async () => {
    const response = await DELETE(jsonRequest("DELETE", { endpoint }, {
      "Sec-Fetch-Site": "same-site",
    }));

    expect(response.status).toBe(403);
    expect(await responseJson(response)).toEqual({ error: "PG_PUSH_CROSS_ORIGIN" });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("requires JSON before opening the session", async () => {
    const response = await POST(request("POST", JSON.stringify({ endpoint }), {
      "Content-Type": "text/plain",
    }));

    expect(response.status).toBe(415);
    expect(await responseJson(response)).toEqual({ error: "PG_PUSH_JSON_REQUIRED" });
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("requires an authenticated Supabase user before parsing or calling RPCs", async () => {
    const { rpc } = installClient({ user: false });
    const response = await PUT(jsonRequest("PUT", {
      endpoint,
      keys: { p256dh, auth: authSecret },
    }));

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({ error: "PG_PUSH_UNAUTHENTICATED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed and oversized bodies without an RPC call", async () => {
    const { rpc } = installClient();

    const malformed = await POST(request("POST", "{not-json"));
    expect(malformed.status).toBe(400);
    expect(await responseJson(malformed)).toEqual({ error: "PG_PUSH_BODY_INVALID" });

    const oversized = await POST(request("POST", JSON.stringify({
      endpoint,
      padding: "x".repeat(9000),
    })));
    expect(oversized.status).toBe(413);
    expect(await responseJson(oversized)).toEqual({ error: "PG_PUSH_BODY_TOO_LARGE" });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("registers only the current device material and never echoes secrets", async () => {
    const { rpc } = installClient({
      rpcResult: { data: "22222222-2222-4222-8222-222222222222", error: null },
    });

    const response = await PUT(jsonRequest("PUT", {
      endpoint,
      keys: { p256dh, auth: authSecret },
    }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ state: "subscribed" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("register_push_subscription", {
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth_secret: authSecret,
    });
    expect(text).not.toContain(endpoint);
    expect(text).not.toContain(p256dh);
    expect(text).not.toContain(authSecret);
  });

  it("reads current-device state through the privacy-safe RPC", async () => {
    const { rpc } = installClient({
      rpcResult: { data: "disabled", error: null },
    });

    const response = await POST(jsonRequest("POST", { endpoint }));

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ state: "disabled" });
    expect(rpc).toHaveBeenCalledWith("current_push_subscription_state", {
      p_endpoint: endpoint,
    });
  });

  it("maps disable false to missing so foreign and absent endpoints stay indistinguishable", async () => {
    const { rpc } = installClient({
      rpcResult: { data: false, error: null },
    });

    const response = await DELETE(jsonRequest("DELETE", { endpoint }));

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ state: "missing" });
    expect(rpc).toHaveBeenCalledWith("disable_push_subscription", {
      p_endpoint: endpoint,
    });
  });

  it("maps endpoint ownership conflict to a generic safe conflict and hides raw database details", async () => {
    installClient({
      rpcResult: {
        data: null,
        error: {
          message: "PG_PUSH_ENDPOINT_OWNED",
          details: `foreign profile owns ${endpoint}`,
        },
      },
    });

    const response = await PUT(jsonRequest("PUT", {
      endpoint,
      keys: { p256dh, auth: authSecret },
    }));
    const text = await response.text();

    expect(response.status).toBe(409);
    expect(JSON.parse(text)).toEqual({ error: "PG_PUSH_ENDPOINT_CONFLICT" });
    expect(text).not.toContain("PG_PUSH_ENDPOINT_OWNED");
    expect(text).not.toContain(endpoint);
    expect(text).not.toContain("foreign profile");
  });

  it("fails closed on an unexpected state value or thrown transport error", async () => {
    installClient({ rpcResult: { data: "unexpected-state", error: null } });
    const unexpectedState = await POST(jsonRequest("POST", { endpoint }));
    expect(unexpectedState.status).toBe(500);
    expect(await responseJson(unexpectedState)).toEqual({ error: "PG_PUSH_OPERATION_FAILED" });

    const rpc = vi.fn(async () => {
      throw new Error(`transport included ${endpoint}`);
    });
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u" } }, error: null })) },
      rpc,
    });
    const thrown = await DELETE(jsonRequest("DELETE", { endpoint }));
    const text = await thrown.text();
    expect(thrown.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "PG_PUSH_OPERATION_FAILED" });
    expect(text).not.toContain(endpoint);
  });
});
