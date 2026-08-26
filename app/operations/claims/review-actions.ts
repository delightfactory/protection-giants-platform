"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedReviewErrors = new Set([
  "PG_CLAIM_REVIEW_REQUEST_INVALID",
  "PG_CLAIM_INSPECTION_REQUEST_INVALID",
  "PG_CLAIM_INSPECTION_REASSIGN_REQUEST_INVALID",
  "PG_CLAIM_INSPECTION_REASSIGN_REASON_INVALID",
  "PG_CLAIM_ACTION_REQUEST_CONFLICT",
  "PG_CLAIM_NOT_FOUND",
  "PG_CLAIM_WARRANTY_INVALID",
  "PG_CLAIM_REVIEW_STATE_INVALID",
  "PG_CLAIM_INSPECTION_STATE_INVALID",
  "PG_CLAIM_INSPECTION_EXISTS",
  "PG_CLAIM_CENTER_REQUIRED",
  "PG_CLAIM_CENTER_INACTIVE",
  "PG_CLAIM_CENTER_UNACTIONABLE",
  "PG_CLAIM_INSPECTION_REASSIGN_STATE_INVALID",
  "PG_CLAIM_INSPECTION_REASSIGN_SAME_CENTER",
  "PG_CLAIM_ADMIN_REQUIRED",
  "PG_CLAIM_FORBIDDEN",
  "PG_WARRANTY_ADMIN_REQUIRED",
]);

export type ClaimReviewActionResult =
  | { ok: true; eventId: string }
  | { ok: false; code: string };

export type StartClaimReviewInput = {
  requestId: string;
  claimId: string;
};

export type RequestClaimInspectionInput = {
  requestId: string;
  claimId: string;
  centerPartyId: string;
};

export type ReassignClaimInspectionInput = RequestClaimInspectionInput & {
  reason: string;
};

function exposedError(message: string | undefined): string {
  return message && exposedReviewErrors.has(message) ? message : "PG_CLAIM_REVIEW_ACTION_FAILED";
}

function parseActionResult(data: unknown, errorMessage?: string): ClaimReviewActionResult {
  if (errorMessage) return { ok: false, code: exposedError(errorMessage) };
  if (typeof data !== "string" || !uuidPattern.test(data)) {
    return { ok: false, code: "PG_CLAIM_REVIEW_ACTION_FAILED" };
  }
  return { ok: true, eventId: data };
}

function validateRequestAndClaim(requestId: string, claimId: string): string | null {
  if (!uuidPattern.test(requestId ?? "")) return "PG_CLAIM_REVIEW_REQUEST_INVALID";
  if (!uuidPattern.test(claimId ?? "")) return "PG_CLAIM_NOT_FOUND";
  return null;
}

function revalidateClaimReview(claimId: string) {
  revalidatePath("/operations/claims");
  revalidatePath(`/operations/claims/${claimId}`);
  revalidatePath(`/operations/claims/${claimId}/review`);
}

export async function startClaimReview(input: StartClaimReviewInput): Promise<ClaimReviewActionResult> {
  const idError = validateRequestAndClaim(input.requestId, input.claimId);
  if (idError) return { ok: false, code: idError };

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
  } satisfies Database["public"]["Functions"]["start_warranty_claim_review"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_warranty_claim_review", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimReview(input.claimId);
  return result;
}

export async function requestClaimInspection(input: RequestClaimInspectionInput): Promise<ClaimReviewActionResult> {
  const idError = validateRequestAndClaim(input.requestId, input.claimId);
  if (idError) return { ok: false, code: idError };
  if (!uuidPattern.test(input.centerPartyId ?? "")) {
    return { ok: false, code: "PG_CLAIM_CENTER_REQUIRED" };
  }

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
    p_center_party_id: input.centerPartyId,
  } satisfies Database["public"]["Functions"]["request_warranty_claim_inspection"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_warranty_claim_inspection", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimReview(input.claimId);
  return result;
}

export async function reassignClaimInspection(input: ReassignClaimInspectionInput): Promise<ClaimReviewActionResult> {
  const idError = validateRequestAndClaim(input.requestId, input.claimId);
  if (idError) return { ok: false, code: idError };
  if (!uuidPattern.test(input.centerPartyId ?? "")) {
    return { ok: false, code: "PG_CLAIM_CENTER_REQUIRED" };
  }

  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) {
    return { ok: false, code: "PG_CLAIM_INSPECTION_REASSIGN_REASON_INVALID" };
  }

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
    p_center_party_id: input.centerPartyId,
    p_reason: reason,
  } satisfies Database["public"]["Functions"]["reassign_warranty_claim_inspection"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reassign_warranty_claim_inspection", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimReview(input.claimId);
  return result;
}
