"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVIDENCE_BUCKET = "warranty-claim-evidence";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 5;
const STORAGE_LIST_LIMIT = 20;
const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type RecoveryEvidenceMime = keyof typeof IMAGE_EXTENSIONS;
type StorageListObject = { name: string; metadata?: Record<string, unknown> | null };

export type RecoveryEvidenceReference = { storagePath: string; mimeType: RecoveryEvidenceMime; sizeBytes: number; slot: number };
export type RecoveryEvidenceUploadResult =
  | { ok: true; evidence: RecoveryEvidenceReference }
  | { ok: false; code: string; evidence?: RecoveryEvidenceReference };
export type CompleteResolutionByAdminRecoveryInput = {
  requestId: string;
  resolutionId: string;
  completionNote: string;
  recoveryReason: string;
  evidencePaths: string[];
  replacementRollSerial?: string | null;
};
export type CompleteResolutionByAdminRecoveryResult = { ok: true; resolutionId: string } | { ok: false; code: string };

const EXPOSED_RECOVERY_ERRORS = new Set([
  "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REQUEST_INVALID",
  "PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID",
  "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REASON_INVALID",
  "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID",
  "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT",
  "PG_CLAIM_RESOLUTION_NOT_FOUND",
  "PG_CLAIM_WARRANTY_INVALID",
  "PG_CLAIM_RESOLUTION_COMPLETE_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_CENTER_CONTEXT_INVALID",
  "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED",
  "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_INVALID",
  "PG_CLAIM_RESOLUTION_SERVICE_MATERIAL_CONFLICT",
  "PG_CLAIM_CONSUMPTION_ALLOCATION_INVALID",
  "PG_CLAIM_RESOLUTION_REPLACEMENT_SCAN_MISMATCH",
  "PG_CLAIM_CONSUMPTION_PRODUCTION_INVALID",
  "PG_CLAIM_CONSUMPTION_CUSTODY_INVALID",
  "PG_CLAIM_CONSUMPTION_OPENING_INVALID",
  "PG_CLAIM_CONSUMPTION_QUALITY_PENDING",
  "PG_CLAIM_CONSUMPTION_QUALITY_RETURN_REQUIRED",
  "PG_CLAIM_ADMIN_REQUIRED",
  "PG_WARRANTY_ADMIN_REQUIRED",
  "PG_CLAIM_FORBIDDEN",
]);

function detectImageMime(bytes: Buffer): RecoveryEvidenceMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function storageMetadata(object: StorageListObject): { mimeType: string; sizeBytes: number } | null {
  const metadata = object.metadata;
  if (!metadata) return null;
  const mimeType = typeof metadata.mimetype === "string" ? metadata.mimetype : typeof metadata.contentType === "string" ? metadata.contentType : null;
  const rawSize = metadata.size;
  const sizeBytes = typeof rawSize === "number" ? rawSize : typeof rawSize === "string" ? Number(rawSize) : NaN;
  if (!mimeType || !Number.isFinite(sizeBytes) || sizeBytes < 1) return null;
  return { mimeType, sizeBytes };
}

function completionPathPattern(resolutionId: string) {
  return new RegExp(`^resolutions/${resolutionId}/completion/([1-5])-[0-9a-f]{64}\\.(jpg|png|webp)$`);
}

async function authorizeAdminRecoveryEvidence(resolutionId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(resolutionId)) return false;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_admin_warranty_claim_resolution_detail", { p_resolution_id: resolutionId });
  if (error || !data || data.length !== 1) return false;
  const detail = data[0];
  if (detail.resolution_id !== resolutionId || detail.resolution_status !== "assigned" || detail.claim_status !== "approved" || detail.claim_closed_at !== null || !detail.performing_center_party_id || !["service_reinstall", "replacement_roll_reinstall"].includes(detail.remedy_kind ?? "")) return false;
  const activeOperatorCount = Number(detail.active_operator_count ?? 0);
  if (!Number.isFinite(activeOperatorCount) || activeOperatorCount < 0) return false;
  return detail.performing_center_status === "suspended" || (detail.performing_center_status === "active" && activeOperatorCount === 0);
}

async function listRecoveryCompletionObjects(resolutionId: string): Promise<StorageListObject[] | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(EVIDENCE_BUCKET).list(`resolutions/${resolutionId}/completion`, { limit: STORAGE_LIST_LIMIT });
  return error ? null : (data ?? []) as StorageListObject[];
}

export async function uploadAdminRecoveryCompletionEvidence(resolutionId: string, slot: number, file: File): Promise<RecoveryEvidenceUploadResult> {
  if (!UUID_PATTERN.test(resolutionId) || !Number.isInteger(slot) || slot < 1 || slot > MAX_IMAGES) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID" };
  if (!(await authorizeAdminRecoveryEvidence(resolutionId))) return { ok: false, code: "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED" };
  if (!file || file.size < 1 || file.size > MAX_IMAGE_BYTES) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_SIZE_INVALID" };
  if (!(file.type in IMAGE_EXTENSIONS)) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_TYPE_INVALID" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime || detectedMime !== file.type) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_TYPE_INVALID" };

  const digest = createHash("sha256").update(bytes).digest("hex");
  const extension = IMAGE_EXTENSIONS[detectedMime];
  const storagePath = `resolutions/${resolutionId}/completion/${slot}-${digest}.${extension}`;
  const evidence: RecoveryEvidenceReference = { storagePath, mimeType: detectedMime, sizeBytes: bytes.length, slot };
  const objectName = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const supabase = await createSupabaseServerClient();
  const { error: stageError } = await supabase.rpc("register_warranty_claim_admin_recovery_evidence_stage", {
    p_resolution_id: resolutionId,
    p_slot: slot,
    p_storage_path: storagePath,
    p_mime_type: detectedMime,
    p_size_bytes: bytes.length,
  });
  if (stageError) {
    return {
      ok: false,
      code: stageError.message === "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_NOT_ALLOWED"
        ? stageError.message
        : stageError.message === "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID"
          ? stageError.message
          : "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_FAILED",
      evidence,
    };
  }

  const admin = createSupabaseAdminClient();
  const existingObjects = await listRecoveryCompletionObjects(resolutionId);
  const existing = existingObjects?.find((object) => object.name === objectName);
  if (existing) {
    const metadata = storageMetadata(existing);
    return metadata?.mimeType === detectedMime && metadata.sizeBytes === bytes.length
      ? { ok: true, evidence }
      : { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_FAILED", evidence };
  }

  const { error: uploadError } = await admin.storage.from(EVIDENCE_BUCKET).upload(storagePath, bytes, { contentType: detectedMime, cacheControl: "3600", upsert: false });
  if (!uploadError) return { ok: true, evidence };

  const probeObjects = await listRecoveryCompletionObjects(resolutionId);
  if (!probeObjects) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_AMBIGUOUS", evidence };
  const probed = probeObjects.find((object) => object.name === objectName);
  if (!probed) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_FAILED", evidence };
  const metadata = storageMetadata(probed);
  return metadata?.mimeType === detectedMime && metadata.sizeBytes === bytes.length
    ? { ok: true, evidence }
    : { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_UPLOAD_FAILED", evidence };
}

export async function removeAdminRecoveryCompletionEvidence(resolutionId: string, storagePath: string): Promise<{ ok: boolean; code?: string }> {
  if (!UUID_PATTERN.test(resolutionId) || !completionPathPattern(resolutionId).test(storagePath)) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID" };

  const supabase = await createSupabaseServerClient();
  const { error: reserveError } = await supabase.rpc("reserve_operational_evidence_stage_delete", { p_storage_path: storagePath });
  if (reserveError) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED" };

  const admin = createSupabaseAdminClient();
  const { error: storageError } = await admin.storage.from(EVIDENCE_BUCKET).remove([storagePath]);
  if (storageError) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED" };

  const { error: finalizeError } = await supabase.rpc("finalize_operational_evidence_stage_delete", { p_storage_path: storagePath });
  return finalizeError ? { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_REMOVE_FAILED" } : { ok: true };
}

export async function completeWarrantyClaimResolutionByAdminRecovery(input: CompleteResolutionByAdminRecoveryInput): Promise<CompleteResolutionByAdminRecoveryResult> {
  if (!UUID_PATTERN.test(input.requestId) || !UUID_PATTERN.test(input.resolutionId)) return { ok: false, code: "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REQUEST_INVALID" };
  const completionNote = input.completionNote.trim();
  if (completionNote.length < 10 || completionNote.length > 2000) return { ok: false, code: "PG_CLAIM_RESOLUTION_COMPLETION_NOTE_INVALID" };
  const recoveryReason = input.recoveryReason.trim();
  if (recoveryReason.length < 5 || recoveryReason.length > 500) return { ok: false, code: "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_REASON_INVALID" };
  if (input.evidencePaths.length < 1 || input.evidencePaths.length > MAX_IMAGES || new Set(input.evidencePaths).size !== input.evidencePaths.length) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID" };

  const pathPattern = completionPathPattern(input.resolutionId);
  const slots = new Set<number>();
  for (const path of input.evidencePaths) {
    const match = path.match(pathPattern);
    if (!match) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID" };
    const slot = Number(match[1]);
    if (slots.has(slot)) return { ok: false, code: "PG_CLAIM_RESOLUTION_EVIDENCE_INVALID" };
    slots.add(slot);
  }

  const replacementRollSerial = input.replacementRollSerial?.trim() || undefined;
  const args = {
    p_action_request_id: input.requestId,
    p_resolution_id: input.resolutionId,
    p_completion_note: completionNote,
    p_evidence_paths: input.evidencePaths,
    p_recovery_reason: recoveryReason,
    p_replacement_roll_serial: replacementRollSerial,
  } satisfies Database["public"]["Functions"]["complete_warranty_claim_resolution_by_admin_recovery"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("complete_warranty_claim_resolution_by_admin_recovery", args);
  if (error) return { ok: false, code: EXPOSED_RECOVERY_ERRORS.has(error.message) ? error.message : "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_FAILED" };
  if (typeof data !== "string" || data !== input.resolutionId) return { ok: false, code: "PG_CLAIM_RESOLUTION_ADMIN_RECOVERY_FAILED" };

  revalidatePath("/operations/claim-resolutions");
  revalidatePath(`/operations/claim-resolutions/${input.resolutionId}`);
  revalidatePath("/operations/claims");
  return { ok: true, resolutionId: data };
}
