export const PUSH_WORKER_CLAIM_LIMIT = 20;
export const PUSH_SOCKET_TIMEOUT_MS = 8_000;
export const PUSH_TTL_SECONDS = 6 * 60 * 60;

export type PushDeliveryOutcome =
  | "sent"
  | "subscription_gone"
  | "retryable_failure"
  | "terminal_failure";

export type PushDeliveryResult = Readonly<{
  result: PushDeliveryOutcome;
  httpStatus: number | null;
  errorCode: string | null;
}>;

export type PushWorkerClaimPresentation = Readonly<{
  notification_id: string;
  title: string;
  body: string;
  action_path: string;
  attention_level: string;
}>;

export type PushPayload = Readonly<{
  version: 1;
  notificationId: string;
  title: string;
  body: string;
  actionPath: string;
  attentionLevel: string;
  tag: string;
}>;

export type PushUrgency = "low" | "normal" | "high";

function compactText(value: string, maxCodePoints: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  const codePoints = Array.from(normalized);
  if (codePoints.length <= maxCodePoints) return normalized;
  return `${codePoints.slice(0, Math.max(1, maxCodePoints - 1)).join("")}…`;
}

export function safePushActionPath(value: string): string {
  const fallback = "/operations/notifications";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\0")) {
    return fallback;
  }

  try {
    const base = new URL("https://push.local");
    const parsed = new URL(trimmed, base);
    if (parsed.origin !== base.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildPushPayload(claim: PushWorkerClaimPresentation): PushPayload {
  return {
    version: 1,
    notificationId: claim.notification_id,
    title: compactText(claim.title, 120),
    body: compactText(claim.body, 240),
    actionPath: safePushActionPath(claim.action_path),
    attentionLevel: compactText(claim.attention_level, 32),
    tag: `pg-notification-${claim.notification_id}`,
  };
}

export function pushDeliveryOptions(attentionLevel: string): Readonly<{
  TTL: number;
  urgency: PushUrgency;
  timeout: number;
}> {
  const urgency: PushUrgency =
    attentionLevel === "action_required"
      ? "high"
      : attentionLevel === "info"
        ? "low"
        : "normal";

  return {
    TTL: PUSH_TTL_SECONDS,
    urgency,
    timeout: PUSH_SOCKET_TIMEOUT_MS,
  };
}

function readStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return null;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return Number.isInteger(statusCode) ? Number(statusCode) : null;
}

export function classifyPushTransportFailure(error: unknown): PushDeliveryResult {
  const statusCode = readStatusCode(error);

  if (statusCode === 404 || statusCode === 410) {
    return {
      result: "subscription_gone",
      httpStatus: statusCode,
      errorCode: "subscription_gone",
    };
  }

  if (statusCode === 429) {
    return {
      result: "retryable_failure",
      httpStatus: 429,
      errorCode: "provider_rate_limited",
    };
  }

  if (statusCode !== null && statusCode >= 500 && statusCode <= 599) {
    return {
      result: "retryable_failure",
      httpStatus: statusCode,
      errorCode: "provider_5xx",
    };
  }

  if (statusCode !== null && statusCode >= 400 && statusCode <= 499) {
    return {
      result: "terminal_failure",
      httpStatus: statusCode,
      errorCode: "provider_4xx",
    };
  }

  return {
    result: "retryable_failure",
    httpStatus: null,
    errorCode: statusCode === null ? "transport_error" : "provider_unexpected_response",
  };
}

export function classifyPushTransportSuccess(statusCode: unknown): PushDeliveryResult {
  if (Number.isInteger(statusCode) && Number(statusCode) >= 200 && Number(statusCode) <= 299) {
    return {
      result: "sent",
      httpStatus: Number(statusCode),
      errorCode: null,
    };
  }

  return classifyPushTransportFailure({ statusCode });
}
