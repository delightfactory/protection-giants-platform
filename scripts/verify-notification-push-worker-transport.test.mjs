import { describe, expect, it } from "vitest";
import {
  buildPushPayload,
  classifyPushTransportFailure,
  classifyPushTransportSuccess,
  pushDeliveryOptions,
  safePushActionPath,
  PUSH_SOCKET_TIMEOUT_MS,
  PUSH_TTL_SECONDS,
  PUSH_WORKER_CLAIM_LIMIT,
} from "../lib/notifications/push-worker-contract.ts";

const baseClaim = {
  notification_id: "8c5e1d20-7b72-4abf-a0dd-8aec7ad55eb1",
  title: "إجراء تشغيلي مطلوب",
  body: "يوجد إجراء جديد يحتاج مراجعتك داخل المنصة.",
  action_path: "/operations/notifications?source=push#latest",
  attention_level: "action_required",
  endpoint: "https://push.example.test/secret-endpoint",
  p256dh: "SECRET_P256DH",
  auth_secret: "SECRET_AUTH",
};

describe("Cube L Push worker transport contract", () => {
  it("builds a bounded privacy-safe payload without transport secrets", () => {
    const payload = buildPushPayload(baseClaim);
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      version: 1,
      notificationId: baseClaim.notification_id,
      title: baseClaim.title,
      body: baseClaim.body,
      actionPath: baseClaim.action_path,
      attentionLevel: "action_required",
      tag: `pg-notification-${baseClaim.notification_id}`,
    });
    expect(serialized).not.toContain(baseClaim.endpoint);
    expect(serialized).not.toContain(baseClaim.p256dh);
    expect(serialized).not.toContain(baseClaim.auth_secret);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(3072);
  });

  it("uses stable tags and safely bounds presentation text", () => {
    const payload = buildPushPayload({
      ...baseClaim,
      title: " أ ".repeat(200),
      body: " ب ".repeat(500),
    });
    const retryPayload = buildPushPayload(baseClaim);

    expect(Array.from(payload.title).length).toBeLessThanOrEqual(120);
    expect(Array.from(payload.body).length).toBeLessThanOrEqual(240);
    expect(payload.tag).toBe(retryPayload.tag);
  });

  it("accepts only same-origin relative action paths", () => {
    expect(safePushActionPath("/operations/rolls/123?tab=issue#top")).toBe(
      "/operations/rolls/123?tab=issue#top",
    );
    expect(safePushActionPath("https://evil.example/phish")).toBe("/operations/notifications");
    expect(safePushActionPath("//evil.example/phish")).toBe("/operations/notifications");
    expect(safePushActionPath("javascript:alert(1)")).toBe("/operations/notifications");
  });

  it("uses deliberate bounded TTL, timeout and attention-based urgency", () => {
    expect(PUSH_WORKER_CLAIM_LIMIT).toBe(20);
    expect(PUSH_TTL_SECONDS).toBe(6 * 60 * 60);
    expect(PUSH_SOCKET_TIMEOUT_MS).toBe(8000);
    expect(pushDeliveryOptions("action_required").urgency).toBe("high");
    expect(pushDeliveryOptions("warning").urgency).toBe("normal");
    expect(pushDeliveryOptions("info").urgency).toBe("low");
  });

  it("classifies provider expiry, throttling, transient and terminal responses", () => {
    expect(classifyPushTransportFailure({ statusCode: 404 })).toEqual({
      result: "subscription_gone",
      httpStatus: 404,
      errorCode: "subscription_gone",
    });
    expect(classifyPushTransportFailure({ statusCode: 410 }).result).toBe("subscription_gone");
    expect(classifyPushTransportFailure({ statusCode: 429 })).toEqual({
      result: "retryable_failure",
      httpStatus: 429,
      errorCode: "provider_rate_limited",
    });
    expect(classifyPushTransportFailure({ statusCode: 503 })).toEqual({
      result: "retryable_failure",
      httpStatus: 503,
      errorCode: "provider_5xx",
    });
    expect(classifyPushTransportFailure({ statusCode: 400 })).toEqual({
      result: "terminal_failure",
      httpStatus: 400,
      errorCode: "provider_4xx",
    });
  });

  it("retries network and unexpected responses without sending invalid DB status pairs", () => {
    expect(classifyPushTransportFailure(new Error("socket timeout"))).toEqual({
      result: "retryable_failure",
      httpStatus: null,
      errorCode: "transport_error",
    });
    expect(classifyPushTransportFailure({ statusCode: 302 })).toEqual({
      result: "retryable_failure",
      httpStatus: null,
      errorCode: "provider_unexpected_response",
    });
  });

  it("records only 2xx transport success as sent", () => {
    expect(classifyPushTransportSuccess(201)).toEqual({
      result: "sent",
      httpStatus: 201,
      errorCode: null,
    });
    expect(classifyPushTransportSuccess(503).result).toBe("retryable_failure");
    expect(classifyPushTransportSuccess(400).result).toBe("terminal_failure");
  });
});
