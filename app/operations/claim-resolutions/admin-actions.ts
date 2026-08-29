"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REMEDY_KINDS = new Set(["service_reinstall", "replacement_roll_reinstall"] as const);

type RemedyKind = "service_reinstall" | "replacement_roll_reinstall";

export type ResolutionAdminActionResult =
  | { ok: true; resultId: string }
  | { ok: false; code: string };

export type AssignResolutionInput = {
  requestId: string;
  resolutionId: string;
  remedyKind: RemedyKind;
  performingCenterPartyId: string;
};

export type ReassignResolutionInput = {
  requestId: string;
  resolutionId: string;
  performingCenterPartyId: string;
  reason: string;
};

export type ChangeResolutionRemedyInput = {
  requestId: string;
  resolutionId: string;
  remedyKind: RemedyKind;
  reason: string;
};

export type ReserveResolutionRollInput = {
  requestId: string;
  resolutionId: string;
  rollId: string;
};

export type ReleaseResolutionRollInput = {
  requestId: string;
  allocationId: string;
  reason: string;
};

const EXPOSED_ADMIN_ERRORS = new Set([
  "PG_CLAIM_RESOLUTION_ASSIGN_REQUEST_INVALID",
  "PG_CLAIM_RESOLUTION_REMEDY_INVALID",
  "PG_CLAIM_RESOLUTION_REASSIGN_REQUEST_INVALID",
  "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID",
  "PG_CLAIM_ROLL_RESERVE_REQUEST_INVALID",
  "PG_CLAIM_ROLL_RELEASE_REQUEST_INVALID",
  "PG_CLAIM_ROLL_RELEASE_REASON_INVALID",
  "PG_CLAIM_RESOLUTION_ACTION_REQUEST_CONFLICT",
  "PG_CLAIM_RESOLUTION_NOT_FOUND",
  "PG_CLAIM_WARRANTY_INVALID",
  "PG_CLAIM_RESOLUTION_ASSIGN_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_REASSIGN_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_STATE_INVALID",
  "PG_CLAIM_RESOLUTION_CENTER_UNCHANGED",
  "PG_CLAIM_RESOLUTION_REMEDY_UNCHANGED",
  "PG_CLAIM_RESOLUTION_MATERIAL_ACTIVE",
  "PG_CLAIM_ROLL_RESERVE_STATE_INVALID",
  "PG_CLAIM_ROLL_ALREADY_ALLOCATED",
  "PG_CLAIM_REPLACEMENT_ROLL_NOT_FOUND",
  "PG_CLAIM_ROLL_PRODUCTION_INVALID",
  "PG_CLAIM_ROLL_CUSTODY_MISSING",
  "PG_CLAIM_ROLL_NOT_PERFORMING_CENTER",
  "PG_CLAIM_ROLL_TRANSFER_RESERVED",
  "PG_CLAIM_ROLL_ALREADY_OPENED",
  "PG_CLAIM_ROLL_WARRANTY_EXISTS",
  "PG_CLAIM_ROLL_RETURN_REQUIRED",
  "PG_CLAIM_ROLL_PREVIOUSLY_CONSUMED",
  "PG_CLAIM_ROLL_PRODUCT_INELIGIBLE",
  "PG_CLAIM_ROLL_POLICY_BASIS_INVALID",
  "PG_CLAIM_ROLL_EVENT_INVALID",
  "PG_CLAIM_ROLL_RELEASE_STATE_INVALID",
  "PG_CLAIM_ROLL_RELEASE_OPENED_INVALID",
  "PG_CLAIM_ADMIN_REQUIRED",
  "PG_WARRANTY_ADMIN_REQUIRED",
  "PG_CLAIM_FORBIDDEN",
]);

function exposeError(message: string | undefined): string {
  return message && EXPOSED_ADMIN_ERRORS.has(message)
    ? message
    : "PG_CLAIM_RESOLUTION_ADMIN_ACTION_FAILED";
}

function parseUuidResult(data: unknown, errorMessage?: string): ResolutionAdminActionResult {
  if (errorMessage) return { ok: false, code: exposeError(errorMessage) };
  if (typeof data !== "string" || !UUID_PATTERN.test(data)) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_ADMIN_ACTION_FAILED" };
  }
  return { ok: true, resultId: data };
}

function validUuid(value: string): boolean {
  return UUID_PATTERN.test(value ?? "");
}

function validReason(reason: string): string | null {
  const normalized = reason.trim();
  return normalized.length >= 5 && normalized.length <= 500 ? normalized : null;
}

function revalidateResolution(resolutionId?: string) {
  revalidatePath("/operations/claim-resolutions");
  if (resolutionId) revalidatePath(`/operations/claim-resolutions/${resolutionId}`);
  revalidatePath("/operations/claims");
}

export async function assignWarrantyClaimResolution(
  input: AssignResolutionInput,
): Promise<ResolutionAdminActionResult> {
  if (
    !validUuid(input.requestId)
    || !validUuid(input.resolutionId)
    || !validUuid(input.performingCenterPartyId)
  ) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_ASSIGN_REQUEST_INVALID" };
  }
  if (!REMEDY_KINDS.has(input.remedyKind)) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_REMEDY_INVALID" };
  }

  const args = {
    p_action_request_id: input.requestId,
    p_resolution_id: input.resolutionId,
    p_remedy_kind: input.remedyKind,
    p_performing_center_party_id: input.performingCenterPartyId,
  } satisfies Database["public"]["Functions"]["assign_warranty_claim_resolution"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_warranty_claim_resolution", args);
  const result = parseUuidResult(data, error?.message);
  if (result.ok) revalidateResolution(input.resolutionId);
  return result;
}

export async function reassignWarrantyClaimResolution(
  input: ReassignResolutionInput,
): Promise<ResolutionAdminActionResult> {
  if (
    !validUuid(input.requestId)
    || !validUuid(input.resolutionId)
    || !validUuid(input.performingCenterPartyId)
  ) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_REASSIGN_REQUEST_INVALID" };
  }
  const reason = validReason(input.reason);
  if (!reason) return { ok: false, code: "PG_CLAIM_RESOLUTION_REASSIGN_REQUEST_INVALID" };

  const args = {
    p_action_request_id: input.requestId,
    p_resolution_id: input.resolutionId,
    p_performing_center_party_id: input.performingCenterPartyId,
    p_reason: reason,
  } satisfies Database["public"]["Functions"]["reassign_warranty_claim_resolution"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reassign_warranty_claim_resolution", args);
  const result = parseUuidResult(data, error?.message);
  if (result.ok) revalidateResolution(input.resolutionId);
  return result;
}

export async function changeWarrantyClaimResolutionRemedy(
  input: ChangeResolutionRemedyInput,
): Promise<ResolutionAdminActionResult> {
  if (!validUuid(input.requestId) || !validUuid(input.resolutionId)) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID" };
  }
  if (!REMEDY_KINDS.has(input.remedyKind)) {
    return { ok: false, code: "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID" };
  }
  const reason = validReason(input.reason);
  if (!reason) return { ok: false, code: "PG_CLAIM_RESOLUTION_REMEDY_CHANGE_REQUEST_INVALID" };

  const args = {
    p_action_request_id: input.requestId,
    p_resolution_id: input.resolutionId,
    p_remedy_kind: input.remedyKind,
    p_reason: reason,
  } satisfies Database["public"]["Functions"]["change_warranty_claim_resolution_remedy"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("change_warranty_claim_resolution_remedy", args);
  const result = parseUuidResult(data, error?.message);
  if (result.ok) revalidateResolution(input.resolutionId);
  return result;
}

export async function reserveWarrantyClaimResolutionRoll(
  input: ReserveResolutionRollInput,
): Promise<ResolutionAdminActionResult> {
  if (!validUuid(input.requestId) || !validUuid(input.resolutionId) || !validUuid(input.rollId)) {
    return { ok: false, code: "PG_CLAIM_ROLL_RESERVE_REQUEST_INVALID" };
  }

  const args = {
    p_action_request_id: input.requestId,
    p_resolution_id: input.resolutionId,
    p_roll_id: input.rollId,
  } satisfies Database["public"]["Functions"]["reserve_claim_resolution_roll"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reserve_claim_resolution_roll", args);
  const result = parseUuidResult(data, error?.message);
  if (result.ok) revalidateResolution(input.resolutionId);
  return result;
}

export async function releaseWarrantyClaimResolutionRoll(
  input: ReleaseResolutionRollInput,
): Promise<ResolutionAdminActionResult> {
  if (!validUuid(input.requestId) || !validUuid(input.allocationId)) {
    return { ok: false, code: "PG_CLAIM_ROLL_RELEASE_REQUEST_INVALID" };
  }
  const reason = validReason(input.reason);
  if (!reason) return { ok: false, code: "PG_CLAIM_ROLL_RELEASE_REASON_INVALID" };

  const args = {
    p_action_request_id: input.requestId,
    p_allocation_id: input.allocationId,
    p_reason: reason,
  } satisfies Database["public"]["Functions"]["release_claim_resolution_roll"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("release_claim_resolution_roll", args);
  const result = parseUuidResult(data, error?.message);
  if (result.ok) revalidateResolution();
  return result;
}
