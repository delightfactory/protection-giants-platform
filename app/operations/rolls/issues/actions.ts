"use server";

import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import {
  parseRollIssueSubmission,
  ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET,
  type PreparedRollIssueImage,
  type RollPreinstallIssueCategory,
} from "@/lib/rolls/preinstall-issues";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedIssueErrors = new Set([
  "PG_ROLL_ISSUE_REQUEST_ID_REQUIRED",
  "PG_ROLL_ISSUE_SERIAL_INVALID",
  "PG_ROLL_ISSUE_CENTER_REQUIRED",
  "PG_ROLL_ISSUE_CENTER_INACTIVE",
  "PG_ROLL_ISSUE_ACTOR_INACTIVE",
  "PG_ROLL_ISSUE_FORBIDDEN",
  "PG_ROLL_ISSUE_ADMIN_REQUIRED",
  "PG_ROLL_ISSUE_ROLL_NOT_FOUND",
  "PG_ROLL_ISSUE_ROLL_NOT_OPENED",
  "PG_ROLL_ISSUE_PRODUCTION_MISSING",
  "PG_ROLL_ISSUE_PRODUCTION_INVALID",
  "PG_ROLL_ISSUE_CUSTODY_MISSING",
  "PG_ROLL_ISSUE_NOT_CURRENT_CUSTODIAN",
  "PG_ROLL_ISSUE_ACTIVE_ISSUE_EXISTS",
  "PG_ROLL_ISSUE_RETURN_REQUIRED_ALREADY",
  "PG_ROLL_ISSUE_INVALID_CATEGORY",
  "PG_ROLL_ISSUE_INVALID_DESCRIPTION",
  "PG_ROLL_ISSUE_INVALID_EVIDENCE",
  "PG_ROLL_ISSUE_REQUEST_CONFLICT",
  "PG_ROLL_ISSUE_INVALID_OUTCOME",
  "PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID",
  "PG_ROLL_ISSUE_NOT_FOUND",
  "PG_ROLL_ISSUE_ALREADY_RESOLVED",
]);

export type RollPreinstallIssueCandidate = {
  rollId: string;
  serialNumber: string;
  lotNumber: string;
  productCode: string;
  productName: string;
  openedAt: string;
  centerName: string;
  eligibility: "eligible" | "active_issue" | "return_required";
};

export type ResolveRollIssueCandidateResult =
  | { ok: true; candidate: RollPreinstallIssueCandidate }
  | { ok: false; code: string };

export type SubmitRollIssueResult =
  | { ok: true; issueId: string }
  | { ok: false; code: string };

export type ResolveRollIssueResult =
  | { ok: true; issueId: string }
  | { ok: false; code: string };

function publicIssueError(message: string | undefined, actor: "center" | "admin" = "center"): string {
  if (message === "PG_TRANSFER_ACTOR_INACTIVE") {
    return actor === "center" ? "PG_ROLL_ISSUE_CENTER_INACTIVE" : "PG_ROLL_ISSUE_ACTOR_INACTIVE";
  }
  return message && exposedIssueErrors.has(message) ? message : "PG_ROLL_ISSUE_FAILED";
}

function isCandidateRow(value: unknown): value is {
  roll_id: string;
  serial_number: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  opened_at: string;
  center_name: string;
  eligibility: "eligible" | "active_issue" | "return_required";
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.roll_id === "string"
    && typeof row.serial_number === "string"
    && typeof row.lot_number === "string"
    && typeof row.product_code === "string"
    && typeof row.product_name === "string"
    && typeof row.opened_at === "string"
    && typeof row.center_name === "string"
    && ["eligible", "active_issue", "return_required"].includes(String(row.eligibility));
}

function toCandidate(row: unknown): RollPreinstallIssueCandidate {
  if (!isCandidateRow(row)) throw new Error("Invalid Pre-install Issue candidate shape.");
  return {
    rollId: row.roll_id,
    serialNumber: row.serial_number,
    lotNumber: row.lot_number,
    productCode: row.product_code,
    productName: row.product_name,
    openedAt: row.opened_at,
    centerName: row.center_name,
    eligibility: row.eligibility,
  };
}

async function cleanupEvidence(paths: string[]) {
  if (paths.length === 0) return;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET).remove(paths);
  if (error) {
    throw new Error("Pre-install issue evidence compensation failed.", { cause: error });
  }
}

async function ensureEvidenceUploaded(issueId: string, images: PreparedRollIssueImage[]) {
  const admin = createSupabaseAdminClient();
  const uploadedPaths: string[] = [];

  for (const image of images) {
    const fileName = image.storagePath.slice(issueId.length + 1);
    const { data: existing, error: listError } = await admin.storage
      .from(ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET)
      .list(issueId, { limit: 10, search: fileName });

    if (listError) {
      await cleanupEvidence(uploadedPaths);
      return { ok: false as const, code: "PG_ROLL_ISSUE_EVIDENCE_UPLOAD_FAILED" };
    }

    if (existing?.some((object) => object.name === fileName)) continue;

    const { error: uploadError } = await admin.storage
      .from(ROLL_PREINSTALL_ISSUE_EVIDENCE_BUCKET)
      .upload(image.storagePath, image.file, {
        contentType: image.mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      await cleanupEvidence(uploadedPaths);
      return { ok: false as const, code: "PG_ROLL_ISSUE_EVIDENCE_UPLOAD_FAILED" };
    }

    uploadedPaths.push(image.storagePath);
  }

  return { ok: true as const, uploadedPaths };
}

async function matchingIssueExists(issueId: string, requestId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("roll_preinstall_issues")
    .select("id, request_id")
    .eq("id", issueId)
    .eq("request_id", requestId)
    .maybeSingle();
  return !error && data?.id === issueId && data.request_id === requestId;
}

export async function resolveRollPreinstallIssueCandidate(serialInput: string): Promise<ResolveRollIssueCandidateResult> {
  const serial = normalizeRollSerial(serialInput ?? "");
  if (!serial) return { ok: false, code: "PG_ROLL_ISSUE_SERIAL_INVALID" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_roll_preinstall_issue_candidate", { p_roll_serial: serial });
  if (error) return { ok: false, code: publicIssueError(error.message, "center") };
  if (!Array.isArray(data) || data.length !== 1 || !isCandidateRow(data[0])) {
    return { ok: false, code: "PG_ROLL_ISSUE_CANDIDATE_INVALID" };
  }

  return { ok: true, candidate: toCandidate(data[0]) };
}

export async function submitRollPreinstallIssue(formData: FormData): Promise<SubmitRollIssueResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const issueId = String(formData.get("issue_id") ?? "").trim();
  const serial = normalizeRollSerial(String(formData.get("serial_number") ?? ""));

  if (!uuidPattern.test(requestId) || !uuidPattern.test(issueId)) {
    return { ok: false, code: "PG_ROLL_ISSUE_REQUEST_ID_REQUIRED" };
  }
  if (!serial) return { ok: false, code: "PG_ROLL_ISSUE_SERIAL_INVALID" };

  const parsed = await parseRollIssueSubmission(formData, issueId);
  if (!parsed.ok) return parsed;

  const uploaded = await ensureEvidenceUploaded(issueId, parsed.value.images);
  if (!uploaded.ok) return uploaded;

  const evidencePaths = parsed.value.images.map((image) => image.storagePath);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_roll_preinstall_issue", {
    p_request_id: requestId,
    p_issue_id: issueId,
    p_roll_serial: serial,
    p_category: parsed.value.category satisfies RollPreinstallIssueCategory,
    p_description: parsed.value.description,
    p_evidence_paths: evidencePaths,
  });

  if (error || typeof data !== "string") {
    const domainCode = error?.message && exposedIssueErrors.has(error.message)
      ? error.message
      : null;

    // Only a transport/unknown response is eligible for commit-recovery. A
    // database domain error (especially REQUEST_CONFLICT) must remain visible
    // and must never be converted into a false success merely because the old
    // issue_id/request_id pair exists.
    if (!domainCode && await matchingIssueExists(issueId, requestId)) {
      return { ok: true, issueId };
    }

    // Compensate only objects created by this invocation. Deterministic objects
    // found before upload may already belong to a durable earlier attempt and
    // are therefore never deleted by a later failed retry.
    await cleanupEvidence(uploaded.uploadedPaths);
    return { ok: false, code: publicIssueError(error?.message, "center") };
  }

  return { ok: true, issueId: data };
}

export async function resolveRollPreinstallIssue(input: {
  requestId: string;
  issueId: string;
  outcome: "cleared_for_use" | "return_required";
  reason: string;
}): Promise<ResolveRollIssueResult> {
  const reason = input.reason.trim();
  if (!uuidPattern.test(input.requestId) || !uuidPattern.test(input.issueId)) {
    return { ok: false, code: "PG_ROLL_ISSUE_REQUEST_ID_REQUIRED" };
  }
  if (reason.length < 5 || reason.length > 500) {
    return { ok: false, code: "PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_roll_preinstall_issue", {
    p_request_id: input.requestId,
    p_issue_id: input.issueId,
    p_outcome: input.outcome,
    p_reason: reason,
  });

  if (error || typeof data !== "string") {
    return { ok: false, code: publicIssueError(error?.message, "admin") };
  }
  return { ok: true, issueId: data };
}

export async function markRollPreinstallIssueReportedInError(input: {
  requestId: string;
  issueId: string;
  reason: string;
}): Promise<ResolveRollIssueResult> {
  const reason = input.reason.trim();
  if (!uuidPattern.test(input.requestId) || !uuidPattern.test(input.issueId)) {
    return { ok: false, code: "PG_ROLL_ISSUE_REQUEST_ID_REQUIRED" };
  }
  if (reason.length < 5 || reason.length > 500) {
    return { ok: false, code: "PG_ROLL_ISSUE_RESOLUTION_REASON_INVALID" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_roll_preinstall_issue_reported_in_error", {
    p_request_id: input.requestId,
    p_issue_id: input.issueId,
    p_reason: reason,
  });

  if (error || typeof data !== "string") {
    return { ok: false, code: publicIssueError(error?.message, "admin") };
  }
  return { ok: true, issueId: data };
}
