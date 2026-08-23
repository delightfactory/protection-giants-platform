import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const MIN_WORKER_SECRET_LENGTH = 32;
const MAX_WORKER_SECRET_LENGTH = 512;

export type PushWorkerAuthorization =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; status: 401 | 503; code: string }>;

function hashSecret(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function readConfiguredSecret(): string | null {
  const secret = process.env.PUSH_WORKER_SECRET?.trim();
  if (
    !secret ||
    secret.length < MIN_WORKER_SECRET_LENGTH ||
    secret.length > MAX_WORKER_SECRET_LENGTH ||
    /\s/u.test(secret)
  ) {
    return null;
  }
  return secret;
}

export function authorizePushWorkerRequest(request: Request): PushWorkerAuthorization {
  const configuredSecret = readConfiguredSecret();
  if (!configuredSecret) {
    return { ok: false, status: 503, code: "PG_PUSH_WORKER_NOT_CONFIGURED" };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (!match) {
    return { ok: false, status: 401, code: "PG_PUSH_WORKER_UNAUTHORIZED" };
  }

  const suppliedSecret = match[1];
  const equal = timingSafeEqual(hashSecret(configuredSecret), hashSecret(suppliedSecret));
  if (!equal) {
    return { ok: false, status: 401, code: "PG_PUSH_WORKER_UNAUTHORIZED" };
  }

  return { ok: true };
}
