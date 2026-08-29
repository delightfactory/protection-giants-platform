import "server-only";

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";
import {
  isWarrantyClaimRemedyKind,
  WARRANTY_CLAIM_EVIDENCE_BUCKET,
  type CustomerClaimSummary,
  type CustomerWarrantyClaimContext,
  type WarrantyClaimCategory,
} from "@/lib/warranty/claim-intake";

const ACCESS_VERSION = 1;
const ACCESS_MAX_AGE_SECONDS = 20 * 60;
const PUBLIC_CODE_PATTERN = /^[0-9a-f]{64}$/;
const CLEANUP_BATCH_SIZE = 10;
const CLEANUP_STORAGE_LIST_LIMIT = 100;

type ClaimAccessPayload = {
  v: 1;
  warrantyId: string;
  draftId: string;
  publicCodeHash: string;
  phoneFingerprint: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

type VerifiedPhoneRow = {
  warranty_id: string;
  normalized_phone: string;
  public_state: "active" | "expired";
  coverage_expires_at: string;
};

type ClaimContextRow = {
  warranty_id: string;
  current_phone_normalized: string;
  public_state: "active" | "expired";
  can_submit_new_claim: boolean;
  product_name: string;
  warranty_number: string;
  activated_at: string;
  coverage_expires_at: string;
  activating_center_name: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number | null;
  current_open_claim: unknown;
  recent_closed_claims: unknown;
};

type DraftCleanupRow = {
  draft_id: string;
  storage_paths: string[] | null;
};

export type FreshClaimAccess = {
  payload: ClaimAccessPayload;
  currentPhoneNormalized: string;
  context: CustomerWarrantyClaimContext;
};

function base64url(value: Buffer | string): string {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return buffer.toString("base64url");
}

function publicCodeHash(publicCode: string): string {
  return createHash("sha256").update(publicCode, "utf8").digest("base64url");
}

function rootKey(): Buffer {
  const { secretKey } = getSupabaseAdminEnv();
  return createHmac("sha256", secretKey)
    .update("ProtectionGiants:customer-claim:v1", "utf8")
    .digest();
}

function signingKey(): Buffer {
  return createHmac("sha256", rootKey()).update("access-token", "utf8").digest();
}

function phoneKey(): Buffer {
  return createHmac("sha256", rootKey()).update("phone-fingerprint", "utf8").digest();
}

function phoneFingerprint(normalizedPhone: string): string {
  return createHmac("sha256", phoneKey())
    .update(normalizedPhone, "utf8")
    .digest("base64url");
}

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieName(publicCode: string): string {
  return `pg_claim_${createHash("sha256").update(publicCode, "utf8").digest("hex").slice(0, 20)}`;
}

function cookiePath(publicCode: string): string {
  return `/w/${publicCode}/claim`;
}

function encodeToken(payload: ClaimAccessPayload): string {
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", signingKey())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function decodeToken(token: string): ClaimAccessPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !safeEqualText(signPayload(encoded), signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ClaimAccessPayload>;
    if (
      parsed.v !== ACCESS_VERSION
      || typeof parsed.warrantyId !== "string"
      || typeof parsed.draftId !== "string"
      || typeof parsed.publicCodeHash !== "string"
      || typeof parsed.phoneFingerprint !== "string"
      || typeof parsed.issuedAt !== "number"
      || typeof parsed.expiresAt !== "number"
      || typeof parsed.nonce !== "string"
    ) {
      return null;
    }
    return parsed as ClaimAccessPayload;
  } catch {
    return null;
  }
}

function parseClaimSummary(value: unknown): CustomerClaimSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const category = row.category;
  if (
    typeof row.claim_number !== "string"
    || typeof row.status !== "string"
    || typeof row.submitted_at !== "string"
    || typeof category !== "string"
    || typeof row.affected_area !== "string"
    || typeof row.description !== "string"
    || typeof row.evidence_count !== "number"
  ) {
    return null;
  }

  return {
    claimNumber: row.claim_number,
    status: row.status,
    submittedAt: row.submitted_at,
    category: category as WarrantyClaimCategory,
    affectedArea: row.affected_area,
    description: row.description,
    evidenceCount: row.evidence_count,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    customerDecisionMessage: typeof row.customer_decision_message === "string"
      ? row.customer_decision_message
      : null,
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
    resolutionStatus: typeof row.resolution_status === "string" ? row.resolution_status : null,
    remedyKind: isWarrantyClaimRemedyKind(row.remedy_kind) ? row.remedy_kind : null,
    performingCenterName: typeof row.performing_center_name === "string" ? row.performing_center_name : null,
    resolutionCompletedAt: typeof row.resolution_completed_at === "string" ? row.resolution_completed_at : null,
  };
}

function toCustomerContext(row: ClaimContextRow): CustomerWarrantyClaimContext {
  const closed = Array.isArray(row.recent_closed_claims)
    ? row.recent_closed_claims.map(parseClaimSummary).filter((item): item is CustomerClaimSummary => item !== null)
    : [];
  const serviceHistory = closed.flatMap((claim) => {
    if (
      claim.status !== "approved"
      || claim.resolutionStatus !== "completed"
      || !claim.remedyKind
      || !claim.resolutionCompletedAt
    ) {
      return [];
    }

    return [{
      claimNumber: claim.claimNumber,
      remedyKind: claim.remedyKind,
      performingCenterName: claim.performingCenterName,
      completedAt: claim.resolutionCompletedAt,
      customerDecisionMessage: claim.customerDecisionMessage,
    }];
  }).sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));

  return {
    publicState: row.public_state,
    canSubmitNewClaim: row.can_submit_new_claim,
    productName: row.product_name,
    warrantyNumber: row.warranty_number,
    activatedAt: row.activated_at,
    coverageExpiresAt: row.coverage_expires_at,
    activatingCenterName: row.activating_center_name,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    vehicleYear: row.vehicle_year,
    currentOpenClaim: parseClaimSummary(row.current_open_claim),
    recentClosedClaims: closed,
    serviceHistory,
  };
}

async function cleanupExpiredClaimDrafts(): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_expired_warranty_claim_draft_cleanup_candidates", {
    p_limit: CLEANUP_BATCH_SIZE,
  });
  if (error || !Array.isArray(data)) return;

  for (const candidate of data as DraftCleanupRow[]) {
    if (!candidate?.draft_id) continue;

    // Storage is the authoritative source for physical staged objects. Listing
    // the private draft folder also catches a rare upload that succeeded while
    // its DB registration response failed, so stale cleanup cannot leak orphans.
    const { data: objects, error: listError } = await admin.storage
      .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
      .list(candidate.draft_id, { limit: CLEANUP_STORAGE_LIST_LIMIT });
    if (listError) continue;

    const actualPaths = (objects ?? [])
      .map((object) => object.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
      .map((name) => `${candidate.draft_id}/${name}`);

    if (actualPaths.length > 0) {
      const { error: removeError } = await admin.storage
        .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
        .remove(actualPaths);
      if (removeError) continue;
    }

    // If the page was full, do not assume there were only this many physical
    // objects. Leave the draft cleanup_pending so a later verified request drains
    // the next batch. Finalize only after a short page proves the folder is below
    // the batch ceiling (possibly empty).
    if ((objects ?? []).length >= CLEANUP_STORAGE_LIST_LIMIT) continue;

    const { error: finalizeError } = await admin.rpc(
      "finalize_expired_warranty_claim_draft_cleanup",
      { p_draft_id: candidate.draft_id },
    );
    if (finalizeError) continue;
  }
}

export function isClaimPublicCode(value: string): boolean {
  return PUBLIC_CODE_PATTERN.test(value);
}

export async function verifyPhoneAndIssueClaimAccess(publicCode: string, phone: string): Promise<boolean> {
  if (!isClaimPublicCode(publicCode)) return false;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("verify_customer_warranty_claim_phone", {
    p_public_code: publicCode,
    p_phone: phone,
  });

  if (error || !Array.isArray(data) || data.length !== 1) return false;
  const row = data[0] as VerifiedPhoneRow;
  if (!row.warranty_id || !row.normalized_phone) return false;

  // Best-effort bounded reclamation only after a legitimate verification, so
  // invalid-phone traffic cannot amplify Storage work. Failure never blocks the
  // customer's valid Claim access; cleanup_pending rows remain retryable.
  try {
    await cleanupExpiredClaimDrafts();
  } catch {
    // Intentionally best effort; durable draft state remains the retry source.
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: ClaimAccessPayload = {
    v: ACCESS_VERSION,
    warrantyId: row.warranty_id,
    draftId: randomUUID(),
    publicCodeHash: publicCodeHash(publicCode),
    phoneFingerprint: phoneFingerprint(row.normalized_phone),
    issuedAt: now,
    expiresAt: now + ACCESS_MAX_AGE_SECONDS,
    nonce: randomUUID(),
  };

  const store = await cookies();
  store.set(cookieName(publicCode), encodeToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: cookiePath(publicCode),
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });

  return true;
}

export async function clearClaimAccess(publicCode: string): Promise<void> {
  if (!isClaimPublicCode(publicCode)) return;
  const store = await cookies();
  store.delete({ name: cookieName(publicCode), path: cookiePath(publicCode) });
}

export async function getFreshClaimAccess(publicCode: string): Promise<FreshClaimAccess | null> {
  if (!isClaimPublicCode(publicCode)) return null;

  const store = await cookies();
  const raw = store.get(cookieName(publicCode))?.value;
  if (!raw) return null;

  const payload = decodeToken(raw);
  const now = Math.floor(Date.now() / 1000);
  if (
    !payload
    || payload.expiresAt <= now
    || payload.issuedAt > now + 30
    || !safeEqualText(payload.publicCodeHash, publicCodeHash(publicCode))
  ) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_customer_warranty_claim_context", {
    p_public_code: publicCode,
    p_warranty_id: payload.warrantyId,
  });

  if (error || !Array.isArray(data) || data.length !== 1) return null;
  const row = data[0] as ClaimContextRow;
  if (
    row.warranty_id !== payload.warrantyId
    || !row.current_phone_normalized
    || !safeEqualText(phoneFingerprint(row.current_phone_normalized), payload.phoneFingerprint)
  ) {
    return null;
  }

  return {
    payload,
    currentPhoneNormalized: row.current_phone_normalized,
    context: toCustomerContext(row),
  };
}

export async function ensureFreshClaimDraft(access: FreshClaimAccess): Promise<boolean> {
  if (access.context.publicState !== "active" || !access.context.canSubmitNewClaim) return false;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("open_customer_warranty_claim_draft", {
    p_draft_id: access.payload.draftId,
    p_warranty_id: access.payload.warrantyId,
    p_verified_phone_normalized: access.currentPhoneNormalized,
    p_expires_at: new Date(access.payload.expiresAt * 1000).toISOString(),
  });

  return !error && data === access.payload.draftId;
}
