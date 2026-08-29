"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPOSED_WITHDRAWAL_ERRORS = new Set([
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_REQUEST_INVALID",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_REASON_INVALID",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_CUSTOMER_MESSAGE_INVALID",
  "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT",
  "PG_CLAIM_RESOLUTION_NOT_FOUND",
  "PG_CLAIM_WARRANTY_INVALID",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_MATERIAL_CONSUMED",
  "PG_CLAIM_RESOLUTION_WITHDRAWAL_RELEASE_REQUIRED",
  "PG_CLAIM_ADMIN_REQUIRED",
  "PG_WARRANTY_ADMIN_REQUIRED",
  "PG_CLAIM_FORBIDDEN",
]);

export type CancelAssignedResolutionForWithdrawalInput = {
  requestId: string;
  resolutionId: string;
  reason: string;
  customerMessage: string;
};

export type CancelAssignedResolutionForWithdrawalResult =
  | { ok: true; resolutionId: string }
  | { ok: false; code: string };

function exposedError(message: string | undefined): string {
  return message && EXPOSED_WITHDRAWAL_ERRORS.has(message)
    ? message
    : "PG_CLAIM_RESOLUTION_WITHDRAWAL_FAILED";
}

export async function cancelAssignedResolutionForCustomerWithdrawal(
  input: CancelAssignedResolutionForWithdrawalInput,
): Promise<CancelAssignedResolutionForWithdrawalResult> {
  if (!UUID_PATTERN.test(input.requestId ?? "") || !UUID_PATTERN.test(input.resolutionId ?? "")) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_WITHDRAWAL_REQUEST_INVALID" };
  }

  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_WITHDRAWAL_REASON_INVALID" };
  }

  const customerMessage = input.customerMessage.trim();
  if (customerMessage.length < 5 || customerMessage.length > 1000) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_WITHDRAWAL_CUSTOMER_MESSAGE_INVALID" };
  }

  const args = {
    p_action_request_id: input.requestId,
    p_resolution_id: input.resolutionId,
    p_reason: reason,
    p_customer_message: customerMessage,
  } satisfies Database["public"]["Functions"]["cancel_assigned_claim_resolution_for_customer_withdrawal"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "cancel_assigned_claim_resolution_for_customer_withdrawal",
    args,
  );

  if (error) return { ok: false, code: exposedError(error.message) };
  if (typeof data !== "string" || data !== input.resolutionId) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_WITHDRAWAL_FAILED" };
  }

  revalidatePath("/operations/claim-resolutions");
  revalidatePath(`/operations/claim-resolutions/${input.resolutionId}`);
  revalidatePath("/operations/claims");
  return { ok: true, resolutionId: data };
}
