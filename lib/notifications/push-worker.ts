import "server-only";

import webPush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  buildPushPayload,
  classifyPushTransportFailure,
  classifyPushTransportSuccess,
  pushDeliveryOptions,
  PUSH_WORKER_CLAIM_LIMIT,
  type PushDeliveryResult,
} from "@/lib/notifications/push-worker-contract";

type PushClaim =
  Database["public"]["Functions"]["claim_notification_push_deliveries"]["Returns"][number];

type RecordedState = "sent" | "retry" | "dead" | "record_failed";

export type PushWorkerBatchSummary = Readonly<{
  claimed: number;
  sent: number;
  retry: number;
  dead: number;
  recordFailed: number;
}>;

type VapidConfig = Readonly<{
  subject: string;
  publicKey: string;
  privateKey: string;
}>;

const VAPID_KEY_PATTERN = /^[A-Za-z0-9_-]+$/u;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("PG_PUSH_WORKER_NOT_CONFIGURED");
  return value;
}

function readVapidConfig(): VapidConfig {
  const subject = requiredEnv("WEB_PUSH_VAPID_SUBJECT");
  const publicKey = requiredEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = requiredEnv("WEB_PUSH_VAPID_PRIVATE_KEY");

  let parsedSubject: URL;
  try {
    parsedSubject = new URL(subject);
  } catch {
    throw new Error("PG_PUSH_WORKER_NOT_CONFIGURED");
  }

  if (!(["mailto:", "https:"] as const).includes(parsedSubject.protocol as "mailto:" | "https:")) {
    throw new Error("PG_PUSH_WORKER_NOT_CONFIGURED");
  }

  if (
    publicKey.length < 80 ||
    publicKey.length > 120 ||
    privateKey.length < 40 ||
    privateKey.length > 80 ||
    !VAPID_KEY_PATTERN.test(publicKey) ||
    !VAPID_KEY_PATTERN.test(privateKey)
  ) {
    throw new Error("PG_PUSH_WORKER_NOT_CONFIGURED");
  }

  return { subject, publicKey, privateKey };
}

async function sendClaim(claim: PushClaim, vapid: VapidConfig): Promise<PushDeliveryResult> {
  const payload = JSON.stringify(buildPushPayload(claim));
  const deliveryOptions = pushDeliveryOptions(claim.attention_level);

  try {
    const response = await webPush.sendNotification(
      {
        endpoint: claim.endpoint,
        keys: {
          p256dh: claim.p256dh,
          auth: claim.auth_secret,
        },
      },
      payload,
      {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        TTL: deliveryOptions.TTL,
        urgency: deliveryOptions.urgency,
        timeout: deliveryOptions.timeout,
      },
    );

    return classifyPushTransportSuccess(response.statusCode);
  } catch (error) {
    return classifyPushTransportFailure(error);
  }
}

async function recordResult(
  claim: PushClaim,
  result: PushDeliveryResult,
): Promise<RecordedState> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("record_notification_push_delivery_result", {
    p_delivery_id: claim.delivery_id,
    p_claim_token: claim.claim_token,
    p_result: result.result,
    p_http_status: result.httpStatus ?? undefined,
    p_error_code: result.errorCode ?? undefined,
  });

  if (error || (data !== "sent" && data !== "retry" && data !== "dead")) {
    return "record_failed";
  }

  return data;
}

async function processClaim(claim: PushClaim, vapid: VapidConfig): Promise<RecordedState> {
  const result = await sendClaim(claim, vapid);
  return recordResult(claim, result);
}

export async function runPushWorkerBatch(): Promise<PushWorkerBatchSummary> {
  // Validate transport configuration before leasing any row. A deployment with
  // missing/bad VAPID configuration must fail closed without consuming claims.
  const vapid = readVapidConfig();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_notification_push_deliveries", {
    p_limit: PUSH_WORKER_CLAIM_LIMIT,
  });

  if (error) throw new Error("PG_PUSH_WORKER_CLAIM_FAILED");

  const claims = data ?? [];
  const states = await Promise.all(claims.map((claim) => processClaim(claim, vapid)));

  return states.reduce<PushWorkerBatchSummary>(
    (summary, state) => ({
      claimed: summary.claimed,
      sent: summary.sent + (state === "sent" ? 1 : 0),
      retry: summary.retry + (state === "retry" ? 1 : 0),
      dead: summary.dead + (state === "dead" ? 1 : 0),
      recordFailed: summary.recordFailed + (state === "record_failed" ? 1 : 0),
    }),
    {
      claimed: claims.length,
      sent: 0,
      retry: 0,
      dead: 0,
      recordFailed: 0,
    },
  );
}
