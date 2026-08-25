"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clearClaimAccess,
  getFreshClaimAccess,
  isClaimPublicCode,
  verifyPhoneAndIssueClaimAccess,
} from "@/lib/warranty/claim-access.server";
import {
  isWarrantyClaimCategory,
  isWarrantyClaimEvidenceMime,
  validateWarrantyClaimImage,
  WARRANTY_CLAIM_ALLOWED_IMAGES,
  WARRANTY_CLAIM_EVIDENCE_BUCKET,
  WARRANTY_CLAIM_MAX_IMAGES,
  type WarrantyClaimEvidenceMime,
  type WarrantyClaimEvidenceReference,
  type WarrantyClaimSubmitResult,
  type WarrantyClaimUploadResult,
  type WarrantyClaimVerificationResult,
} from "@/lib/warranty/claim-intake";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.(jpg|png|webp)$/;

const EXPOSED_SUBMIT_ERRORS = new Set([
  "PG_CLAIM_REQUEST_INVALID",
  "PG_CLAIM_CATEGORY_INVALID",
  "PG_CLAIM_AFFECTED_AREA_INVALID",
  "PG_CLAIM_DESCRIPTION_INVALID",
  "PG_CLAIM_EVIDENCE_INVALID",
  "PG_CLAIM_WARRANTY_UNAVAILABLE",
  "PG_CLAIM_VERIFICATION_STALE",
  "PG_CLAIM_WARRANTY_EXPIRED",
  "PG_CLAIM_OPEN_EXISTS",
  "PG_CLAIM_REQUEST_CONFLICT",
]);

type StorageListObject = {
  name: string;
  metadata?: Record<string, unknown> | null;
};

function authoritativeSubmitError(message: string | undefined): string | null {
  return message && EXPOSED_SUBMIT_ERRORS.has(message) ? message : null;
}

function evidenceFileName(path: string): string {
  return path.slice(path.indexOf("/") + 1);
}

function storageMetadata(object: StorageListObject): { mimeType: string; sizeBytes: number } | null {
  const metadata = object.metadata;
  if (!metadata) return null;
  const mime = typeof metadata.mimetype === "string"
    ? metadata.mimetype
    : typeof metadata.contentType === "string"
      ? metadata.contentType
      : null;
  const sizeValue = metadata.size;
  const size = typeof sizeValue === "number"
    ? sizeValue
    : typeof sizeValue === "string"
      ? Number(sizeValue)
      : NaN;

  if (!mime || !Number.isFinite(size) || size < 1) return null;
  return { mimeType: mime, sizeBytes: size };
}

function detectWarrantyClaimImageMime(bytes: Buffer): WarrantyClaimEvidenceMime | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

async function cleanupEvidence(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(WARRANTY_CLAIM_EVIDENCE_BUCKET).remove(paths);
  return !error;
}

export async function verifyWarrantyClaimPhone(
  publicCode: string,
  phone: string,
): Promise<WarrantyClaimVerificationResult> {
  if (!isClaimPublicCode(publicCode) || phone.trim().length < 5 || phone.trim().length > 32) {
    return { ok: false, code: "PG_CLAIM_VERIFICATION_FAILED" };
  }

  try {
    const verified = await verifyPhoneAndIssueClaimAccess(publicCode, phone);
    if (!verified) return { ok: false, code: "PG_CLAIM_VERIFICATION_FAILED" };
    revalidatePath(`/w/${publicCode}/claim`);
    return { ok: true };
  } catch {
    return { ok: false, code: "PG_CLAIM_SERVICE_UNAVAILABLE" };
  }
}

export async function endWarrantyClaimAccess(publicCode: string): Promise<void> {
  await clearClaimAccess(publicCode);
  if (isClaimPublicCode(publicCode)) revalidatePath(`/w/${publicCode}/claim`);
}

export async function uploadWarrantyClaimEvidence(
  publicCode: string,
  file: File,
): Promise<WarrantyClaimUploadResult> {
  const access = await getFreshClaimAccess(publicCode);
  if (!access) return { ok: false, code: "PG_CLAIM_VERIFICATION_REQUIRED" };
  if (!access.context.canSubmitNewClaim) return { ok: false, code: "PG_CLAIM_NOT_SUBMITTABLE" };

  const validation = validateWarrantyClaimImage(file);
  if (validation) return { ok: false, code: validation };
  if (!isWarrantyClaimEvidenceMime(file.type)) {
    return { ok: false, code: "PG_CLAIM_EVIDENCE_TYPE_INVALID" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedMime = detectWarrantyClaimImageMime(bytes);
  if (!detectedMime || detectedMime !== file.type) {
    return { ok: false, code: "PG_CLAIM_EVIDENCE_TYPE_INVALID" };
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  const extension = WARRANTY_CLAIM_ALLOWED_IMAGES[detectedMime];
  const storagePath = `${access.payload.draftId}/${digest}.${extension}`;
  const fileName = evidenceFileName(storagePath);
  const admin = createSupabaseAdminClient();

  const { data: existingObjects, error: listError } = await admin.storage
    .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
    .list(access.payload.draftId, { limit: WARRANTY_CLAIM_MAX_IMAGES + 1 });

  if (listError) return { ok: false, code: "PG_CLAIM_EVIDENCE_UPLOAD_FAILED" };

  const existing = (existingObjects ?? []).find((object) => object.name === fileName);
  if (existing) {
    const metadata = storageMetadata(existing as StorageListObject);
    if (!metadata || metadata.mimeType !== detectedMime || metadata.sizeBytes !== bytes.length) {
      return { ok: false, code: "PG_CLAIM_EVIDENCE_UPLOAD_FAILED" };
    }
    return {
      ok: true,
      evidence: { storagePath, mimeType: detectedMime, sizeBytes: bytes.length },
    };
  }

  if ((existingObjects ?? []).length >= WARRANTY_CLAIM_MAX_IMAGES) {
    return { ok: false, code: "PG_CLAIM_EVIDENCE_COUNT_INVALID" };
  }

  const { error: uploadError } = await admin.storage
    .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: detectedMime,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) return { ok: false, code: "PG_CLAIM_EVIDENCE_UPLOAD_FAILED" };

  return {
    ok: true,
    evidence: { storagePath, mimeType: detectedMime, sizeBytes: bytes.length },
  };
}

export async function removeWarrantyClaimEvidence(
  publicCode: string,
  storagePath: string,
): Promise<{ ok: boolean; code?: string }> {
  const access = await getFreshClaimAccess(publicCode);
  if (!access) return { ok: false, code: "PG_CLAIM_VERIFICATION_REQUIRED" };

  if (
    !EVIDENCE_PATH_PATTERN.test(storagePath)
    || !storagePath.startsWith(`${access.payload.draftId}/`)
  ) {
    return { ok: false, code: "PG_CLAIM_EVIDENCE_INVALID" };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(WARRANTY_CLAIM_EVIDENCE_BUCKET).remove([storagePath]);
  return error
    ? { ok: false, code: "PG_CLAIM_EVIDENCE_REMOVE_FAILED" }
    : { ok: true };
}

async function authoritativeEvidence(
  draftId: string,
  paths: string[],
): Promise<WarrantyClaimEvidenceReference[] | null> {
  if (
    paths.length < 1
    || paths.length > WARRANTY_CLAIM_MAX_IMAGES
    || new Set(paths).size !== paths.length
  ) {
    return null;
  }

  for (const path of paths) {
    if (!EVIDENCE_PATH_PATTERN.test(path) || !path.startsWith(`${draftId}/`)) return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
    .list(draftId, { limit: WARRANTY_CLAIM_MAX_IMAGES + 1 });
  if (error) return null;

  const objects = (data ?? []) as StorageListObject[];
  const resolved: WarrantyClaimEvidenceReference[] = [];

  for (const path of paths) {
    const object = objects.find((candidate) => candidate.name === evidenceFileName(path));
    if (!object) return null;
    const metadata = storageMetadata(object);
    if (!metadata || !isWarrantyClaimEvidenceMime(metadata.mimeType)) return null;
    if (metadata.sizeBytes > 8 * 1024 * 1024) return null;
    resolved.push({
      storagePath: path,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
    });
  }

  return resolved;
}

export async function submitWarrantyClaim(input: {
  publicCode: string;
  requestId: string;
  category: string;
  affectedArea: string;
  description: string;
  evidencePaths: string[];
}): Promise<WarrantyClaimSubmitResult> {
  if (!UUID_PATTERN.test(input.requestId)) {
    return { ok: false, code: "PG_CLAIM_REQUEST_INVALID" };
  }
  if (!isWarrantyClaimCategory(input.category)) {
    return { ok: false, code: "PG_CLAIM_CATEGORY_INVALID" };
  }

  const access = await getFreshClaimAccess(input.publicCode);
  if (!access) return { ok: false, code: "PG_CLAIM_VERIFICATION_REQUIRED" };

  const evidence = await authoritativeEvidence(access.payload.draftId, input.evidencePaths);
  if (!evidence) return { ok: false, code: "PG_CLAIM_EVIDENCE_INVALID" };

  const admin = createSupabaseAdminClient();
  const rpcEvidence = evidence.map((item) => ({
    storage_path: item.storagePath,
    mime_type: item.mimeType,
    size_bytes: item.sizeBytes,
  }));

  const { data, error } = await admin.rpc("create_customer_warranty_claim", {
    p_request_id: input.requestId,
    p_warranty_id: access.payload.warrantyId,
    p_public_code: input.publicCode,
    p_verified_phone_normalized: access.currentPhoneNormalized,
    p_draft_id: access.payload.draftId,
    p_category: input.category,
    p_affected_area: input.affectedArea,
    p_description: input.description,
    p_evidence: rpcEvidence,
  });

  if (!error && Array.isArray(data) && data.length === 1) {
    const row = data[0] as { claim_id: string; claim_number: string };
    revalidatePath(`/w/${input.publicCode}/claim`);
    return { ok: true, claimId: row.claim_id, claimNumber: row.claim_number };
  }

  // A named domain rejection is authoritative: the database transaction rolled
  // back and staged evidence may be compensated. Never reinterpret a request
  // conflict as a successful retry merely because that request id already exists.
  const domainError = authoritativeSubmitError(error?.message);
  if (domainError) {
    const cleaned = await cleanupEvidence(evidence.map((item) => item.storagePath));
    if (!cleaned) return { ok: false, code: "PG_CLAIM_EVIDENCE_COMPENSATION_FAILED" };
    return { ok: false, code: domainError };
  }

  // Unknown/transport failure is ambiguous. First resolve an already-committed
  // request. If that lookup cannot prove the Claim exists, preserve the staged
  // evidence and the caller's request id for a safe same-request retry. Deleting
  // here could race a server-side commit whose HTTP response was lost.
  const { data: existing, error: existingError } = await admin.rpc(
    "get_customer_warranty_claim_by_request",
    {
      p_request_id: input.requestId,
      p_warranty_id: access.payload.warrantyId,
    },
  );

  if (!existingError && Array.isArray(existing) && existing.length === 1) {
    const row = existing[0] as { claim_id: string; claim_number: string };
    revalidatePath(`/w/${input.publicCode}/claim`);
    return { ok: true, claimId: row.claim_id, claimNumber: row.claim_number };
  }

  return { ok: false, code: "PG_CLAIM_SUBMIT_AMBIGUOUS" };
}
