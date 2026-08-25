"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clearClaimAccess,
  ensureFreshClaimDraft,
  getFreshClaimAccess,
  isClaimPublicCode,
  verifyPhoneAndIssueClaimAccess,
  type FreshClaimAccess,
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
  "PG_CLAIM_DRAFT_CLOSED",
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

function draftMutationError(message: string | undefined, fallback: string): string {
  switch (message) {
    case "PG_CLAIM_VERIFICATION_STALE":
      return "PG_CLAIM_VERIFICATION_STALE";
    case "PG_CLAIM_DRAFT_CLOSED":
      return "PG_CLAIM_NOT_SUBMITTABLE";
    case "PG_CLAIM_DRAFT_EVIDENCE_LIMIT":
      return "PG_CLAIM_EVIDENCE_COUNT_INVALID";
    case "PG_CLAIM_DRAFT_EVIDENCE_DELETING":
      return "PG_CLAIM_EVIDENCE_REMOVE_FAILED";
    case "PG_CLAIM_WARRANTY_EXPIRED":
    case "PG_CLAIM_WARRANTY_UNAVAILABLE":
      return "PG_CLAIM_NOT_SUBMITTABLE";
    default:
      return fallback;
  }
}

async function registerDraftEvidence(
  access: FreshClaimAccess,
  evidence: WarrantyClaimEvidenceReference,
): Promise<{ ok: true } | { ok: false; code: string; authoritative: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("register_customer_warranty_claim_draft_evidence", {
    p_draft_id: access.payload.draftId,
    p_warranty_id: access.payload.warrantyId,
    p_verified_phone_normalized: access.currentPhoneNormalized,
    p_storage_path: evidence.storagePath,
    p_mime_type: evidence.mimeType,
    p_size_bytes: evidence.sizeBytes,
  });

  if (!error && data === true) return { ok: true };

  const authoritative = Boolean(error?.message?.startsWith("PG_CLAIM_"));
  return {
    ok: false,
    code: draftMutationError(error?.message, authoritative
      ? "PG_CLAIM_EVIDENCE_UPLOAD_FAILED"
      : "PG_CLAIM_EVIDENCE_UPLOAD_AMBIGUOUS"),
    authoritative,
  };
}

async function reserveDraftEvidenceRemoval(
  access: FreshClaimAccess,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("unregister_customer_warranty_claim_draft_evidence", {
    p_draft_id: access.payload.draftId,
    p_warranty_id: access.payload.warrantyId,
    p_verified_phone_normalized: access.currentPhoneNormalized,
    p_storage_path: storagePath,
  });

  if (!error && data === true) return { ok: true };
  return {
    ok: false,
    code: draftMutationError(error?.message, "PG_CLAIM_EVIDENCE_REMOVE_FAILED"),
  };
}

async function finalizeDraftEvidenceRemoval(
  access: FreshClaimAccess,
  storagePath: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc(
    "finalize_customer_warranty_claim_draft_evidence_removal",
    {
      p_draft_id: access.payload.draftId,
      p_warranty_id: access.payload.warrantyId,
      p_storage_path: storagePath,
    },
  );
  return !error && data === true;
}

async function safelyDiscardUncommittedEvidence(
  access: FreshClaimAccess,
  paths: string[],
): Promise<void> {
  const admin = createSupabaseAdminClient();

  for (const storagePath of paths) {
    const reserved = await reserveDraftEvidenceRemoval(access, storagePath);
    if (!reserved.ok) continue;

    const { error: removeError } = await admin.storage
      .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
      .remove([storagePath]);
    if (removeError) continue;

    await finalizeDraftEvidenceRemoval(access, storagePath);
  }
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
  if (!(await ensureFreshClaimDraft(access))) {
    return { ok: false, code: "PG_CLAIM_VERIFICATION_STALE" };
  }

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
  const evidence: WarrantyClaimEvidenceReference = {
    storagePath,
    mimeType: detectedMime,
    sizeBytes: bytes.length,
  };
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

    const registered = await registerDraftEvidence(access, evidence);
    return registered.ok
      ? { ok: true, evidence }
      : { ok: false, code: registered.code };
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

  const registered = await registerDraftEvidence(access, evidence);
  if (registered.ok) return { ok: true, evidence };

  // A named DB rejection proves registration rolled back, so this newly uploaded
  // uncommitted object may be compensated. Unknown/transport ambiguity preserves
  // it; retrying the same file reuses the content-addressed path and idempotent
  // registration. Expired-draft cleanup lists the actual Storage folder, so even
  // an unregistered object cannot grow into a permanent orphan.
  if (registered.authoritative) {
    await admin.storage.from(WARRANTY_CLAIM_EVIDENCE_BUCKET).remove([storagePath]);
  }
  return { ok: false, code: registered.code };
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

  // DB reservation comes first. If Claim submit won the draft lock, this fails
  // as closed and Storage is never touched. If removal wins, submit can no longer
  // consume this path because it is delete_pending.
  const reserved = await reserveDraftEvidenceRemoval(access, storagePath);
  if (!reserved.ok) return reserved;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(WARRANTY_CLAIM_EVIDENCE_BUCKET)
    .remove([storagePath]);
  if (error) {
    // Keep delete_pending metadata. A user retry or bounded stale-draft cleanup
    // still knows the path and can complete physical deletion safely.
    return { ok: false, code: "PG_CLAIM_EVIDENCE_REMOVE_FAILED" };
  }

  const finalized = await finalizeDraftEvidenceRemoval(access, storagePath);
  return finalized
    ? { ok: true }
    : { ok: false, code: "PG_CLAIM_EVIDENCE_REMOVE_FAILED" };
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

  const domainError = authoritativeSubmitError(error?.message);
  if (domainError) {
    // Compensate only through the locked draft lifecycle. If this request had
    // actually committed earlier, its draft tombstone is submitted and every
    // unregister fails closed, preserving committed Claim evidence.
    await safelyDiscardUncommittedEvidence(
      access,
      evidence.map((item) => item.storagePath),
    );
    return {
      ok: false,
      code: domainError === "PG_CLAIM_DRAFT_CLOSED"
        ? "PG_CLAIM_NOT_SUBMITTABLE"
        : domainError,
    };
  }

  // Unknown/transport failure is ambiguous. Resolve an already-committed request
  // first. If the lookup cannot prove the Claim exists, preserve staged evidence
  // and the same request id; deleting here could race a DB commit whose response
  // was lost.
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
