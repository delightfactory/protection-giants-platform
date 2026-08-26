"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedDecisionErrors = new Set([
  "PG_CLAIM_DECISION_REQUEST_INVALID",
  "PG_CLAIM_CANCEL_REQUEST_INVALID",
  "PG_CLAIM_REOPEN_REQUEST_INVALID",
  "PG_CLAIM_DECISION_TEXT_INVALID",
  "PG_CLAIM_REOPEN_REASON_INVALID",
  "PG_CLAIM_ACTION_REQUEST_CONFLICT",
  "PG_CLAIM_NOT_FOUND",
  "PG_CLAIM_WARRANTY_INVALID",
  "PG_CLAIM_DECISION_STATE_INVALID",
  "PG_CLAIM_INSPECTION_PENDING",
  "PG_CLAIM_RESOLUTION_EXISTS",
  "PG_CLAIM_APPROVAL_RESOLUTION_MISSING",
  "PG_CLAIM_CANCEL_STATE_INVALID",
  "PG_CLAIM_APPROVAL_ALREADY_IN_EXECUTION",
  "PG_CLAIM_APPROVAL_EVENT_MISSING",
  "PG_CLAIM_RESOLUTION_UNEXPECTED",
  "PG_CLAIM_REOPEN_STATE_INVALID",
  "PG_CLAIM_REOPEN_RESOLUTION_EXISTS",
  "PG_CLAIM_REOPEN_LATER_CLAIM_EXISTS",
  "PG_CLAIM_REOPEN_INSPECTION_STATE_INVALID",
  "PG_CLAIM_REOPEN_DECISION_EVENT_MISSING",
  "PG_CLAIM_ADMIN_REQUIRED",
  "PG_CLAIM_FORBIDDEN",
  "PG_WARRANTY_ADMIN_REQUIRED",
]);

export type ClaimDecisionActionResult =
  | { ok: true; resultId: string }
  | { ok: false; code: string };

export type ClaimDecisionInput = {
  requestId: string;
  claimId: string;
  reason: string;
  customerMessage: string;
};

export type ReopenClaimDecisionInput = {
  requestId: string;
  claimId: string;
  reason: string;
};

function exposedError(message: string | undefined): string {
  return message && exposedDecisionErrors.has(message) ? message : "PG_CLAIM_DECISION_ACTION_FAILED";
}

function parseActionResult(data: unknown, errorMessage?: string): ClaimDecisionActionResult {
  if (errorMessage) return { ok: false, code: exposedError(errorMessage) };
  if (typeof data !== "string" || !uuidPattern.test(data)) {
    return { ok: false, code: "PG_CLAIM_DECISION_ACTION_FAILED" };
  }
  return { ok: true, resultId: data };
}

function validateIdentity(requestId: string, claimId: string, requestError: string): string | null {
  if (!uuidPattern.test(requestId ?? "")) return requestError;
  if (!uuidPattern.test(claimId ?? "")) return "PG_CLAIM_NOT_FOUND";
  return null;
}

type NormalizedDecisionInput =
  | { ok: true; reason: string; customerMessage: string }
  | { ok: false; code: string };

function normalizeDecisionInput(input: ClaimDecisionInput, requestError: string): NormalizedDecisionInput {
  const identityError = validateIdentity(input.requestId, input.claimId, requestError);
  if (identityError) return { ok: false, code: identityError };

  const reason = input.reason.trim();
  const customerMessage = input.customerMessage.trim();
  if (
    reason.length < 5
    || reason.length > 1000
    || customerMessage.length < 5
    || customerMessage.length > 1000
  ) {
    return { ok: false, code: "PG_CLAIM_DECISION_TEXT_INVALID" };
  }

  return { ok: true, reason, customerMessage };
}

function revalidateClaimDecision(claimId: string) {
  revalidatePath("/operations/claims");
  revalidatePath(`/operations/claims/${claimId}`);
  revalidatePath(`/operations/claims/${claimId}/review`);
  revalidatePath(`/operations/claims/${claimId}/decision`);
  revalidatePath("/operations/claim-inspections");
}

export async function approveClaimDecision(input: ClaimDecisionInput): Promise<ClaimDecisionActionResult> {
  const normalized = normalizeDecisionInput(input, "PG_CLAIM_DECISION_REQUEST_INVALID");
  if (!normalized.ok) return { ok: false, code: normalized.code };

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
    p_reason: normalized.reason,
    p_customer_message: normalized.customerMessage,
  } satisfies Database["public"]["Functions"]["approve_warranty_claim"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("approve_warranty_claim", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimDecision(input.claimId);
  return result;
}

export async function rejectClaimDecision(input: ClaimDecisionInput): Promise<ClaimDecisionActionResult> {
  const normalized = normalizeDecisionInput(input, "PG_CLAIM_DECISION_REQUEST_INVALID");
  if (!normalized.ok) return { ok: false, code: normalized.code };

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
    p_reason: normalized.reason,
    p_customer_message: normalized.customerMessage,
  } satisfies Database["public"]["Functions"]["reject_warranty_claim"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reject_warranty_claim", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimDecision(input.claimId);
  return result;
}

export async function cancelClaimDecision(input: ClaimDecisionInput): Promise<ClaimDecisionActionResult> {
  const normalized = normalizeDecisionInput(input, "PG_CLAIM_CANCEL_REQUEST_INVALID");
  if (!normalized.ok) return { ok: false, code: normalized.code };

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
    p_reason: normalized.reason,
    p_customer_message: normalized.customerMessage,
  } satisfies Database["public"]["Functions"]["cancel_warranty_claim"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_warranty_claim", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimDecision(input.claimId);
  return result;
}

export async function reopenClaimDecisionForCorrection(
  input: ReopenClaimDecisionInput,
): Promise<ClaimDecisionActionResult> {
  const identityError = validateIdentity(input.requestId, input.claimId, "PG_CLAIM_REOPEN_REQUEST_INVALID");
  if (identityError) return { ok: false, code: identityError };

  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) {
    return { ok: false, code: "PG_CLAIM_REOPEN_REASON_INVALID" };
  }

  const args = {
    p_action_request_id: input.requestId,
    p_claim_id: input.claimId,
    p_reason: reason,
  } satisfies Database["public"]["Functions"]["reopen_warranty_claim_decision_for_correction"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reopen_warranty_claim_decision_for_correction", args);
  const result = parseActionResult(data, error?.message);
  if (result.ok) revalidateClaimDecision(input.claimId);
  return result;
}
