"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const transferMutationErrors = new Set([
  "PG_TRANSFER_UNAUTHENTICATED",
  "PG_TRANSFER_ACTOR_INACTIVE",
  "PG_TRANSFER_ACTOR_ROLE_INVALID",
  "PG_TRANSFER_ACTOR_PARTY_MISSING",
  "PG_TRANSFER_NOT_FOUND",
  "PG_TRANSFER_NOT_RECIPIENT",
  "PG_TRANSFER_NOT_SENDER",
  "PG_TRANSFER_INVALID_STATE",
  "PG_TRANSFER_RECEIPT_REQUEST_ID_REQUIRED",
  "PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID",
  "PG_TRANSFER_RECEIPT_ROLL_ID_NULL",
  "PG_TRANSFER_RECEIPT_ROLL_ID_DUPLICATE",
  "PG_TRANSFER_RECEIPT_ROLL_NOT_IN_TRANSFER",
  "PG_TRANSFER_RECEIPT_ITEM_ALREADY_RECEIVED",
  "PG_TRANSFER_RECEIPT_ITEM_RELEASED",
  "PG_TRANSFER_RECEIPT_ITEM_CLOSED",
  "PG_TRANSFER_RECEIPT_RESERVATION_INVALID",
  "PG_TRANSFER_RECEIPT_CUSTODY_MISSING",
  "PG_TRANSFER_RECEIPT_SENDER_CUSTODY_CHANGED",
  "PG_TRANSFER_RECEIPT_PRODUCTION_INVALID",
  "PG_TRANSFER_RECEIPT_STATE_INVALID",
  "PG_TRANSFER_RECEIPT_REQUEST_CONFLICT",
  "PG_TRANSFER_RESOLUTION_REQUEST_ID_REQUIRED",
  "PG_TRANSFER_RESOLUTION_ROLL_COUNT_INVALID",
  "PG_TRANSFER_RESOLUTION_ROLL_ID_NULL",
  "PG_TRANSFER_RESOLUTION_ROLL_ID_DUPLICATE",
  "PG_TRANSFER_RESOLUTION_ROLL_NOT_IN_TRANSFER",
  "PG_TRANSFER_RESOLUTION_ITEM_NOT_PENDING",
  "PG_TRANSFER_RESOLUTION_RESERVATION_INVALID",
  "PG_TRANSFER_RESOLUTION_CUSTODY_MISSING",
  "PG_TRANSFER_RESOLUTION_SENDER_CUSTODY_CHANGED",
  "PG_TRANSFER_RESOLUTION_PRODUCTION_INVALID",
  "PG_TRANSFER_RESOLUTION_STATE_INVALID",
  "PG_TRANSFER_RESOLUTION_REASON_INVALID",
  "PG_TRANSFER_RESOLUTION_REQUEST_CONFLICT",
  "PG_TRANSFER_ADMIN_REQUIRED",
  "PG_TRANSFER_ADMIN_RECOVERY_NOT_ALLOWED",
  "PG_TRANSFER_ADMIN_REASON_INVALID",
]);

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcInvoker = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

export type TransferActionResult =
  | { ok: true; transferId: string }
  | { ok: false; code: string };

function validateIds(transferId: string, rollIds?: string[]): string | null {
  if (!uuidPattern.test(transferId ?? "")) return "PG_TRANSFER_NOT_FOUND";
  if (!rollIds) return null;
  if (rollIds.length < 1 || rollIds.length > 10000) return "PG_TRANSFER_RECEIPT_ROLL_COUNT_INVALID";
  if (rollIds.some((rollId) => !uuidPattern.test(rollId))) return "PG_TRANSFER_RECEIPT_ROLL_NOT_IN_TRANSFER";
  if (new Set(rollIds).size !== rollIds.length) return "PG_TRANSFER_RECEIPT_ROLL_ID_DUPLICATE";
  return null;
}

function publicError(message: string | undefined, fallback: string): string {
  return message && transferMutationErrors.has(message) ? message : fallback;
}

function revalidateTransfer(transferId: string): void {
  revalidatePath("/operations/transfers");
  revalidatePath(`/operations/transfers/${transferId}`);
  revalidatePath(`/operations/transfers/${transferId}/receive`);
  revalidatePath("/operations/rolls");
}

async function invoke(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const supabase = await createSupabaseServerClient();
  // The generated schema type is updated by Database Quality after the new
  // migrations are accepted. Runtime RPC names/arguments are still validated
  // by PostgREST and the database contract tests before this action is ready.
  return (supabase.rpc as unknown as RpcInvoker)(name, args);
}

export async function receiveTransferItems(input: {
  requestId: string;
  transferId: string;
  rollIds: string[];
}): Promise<TransferActionResult> {
  const rollIds = Array.isArray(input.rollIds) ? [...new Set(input.rollIds)] : [];
  const idError = validateIds(input.transferId, rollIds);
  if (idError) return { ok: false, code: idError };
  if (!uuidPattern.test(input.requestId ?? "")) return { ok: false, code: "PG_TRANSFER_RECEIPT_REQUEST_ID_REQUIRED" };

  const { data, error } = await invoke("receive_roll_transfer_items", {
    p_request_id: input.requestId,
    p_transfer_id: input.transferId,
    p_roll_ids: rollIds,
  });

  if (error || data !== input.transferId) {
    return { ok: false, code: publicError(error?.message, "PG_TRANSFER_RECEIPT_FAILED") };
  }

  revalidateTransfer(input.transferId);
  return { ok: true, transferId: input.transferId };
}

export async function cancelTransfer(transferId: string): Promise<TransferActionResult> {
  const idError = validateIds(transferId);
  if (idError) return { ok: false, code: idError };
  const { data, error } = await invoke("cancel_roll_transfer", { p_transfer_id: transferId });
  if (error || data !== transferId) return { ok: false, code: publicError(error?.message, "PG_TRANSFER_ACTION_FAILED") };
  revalidateTransfer(transferId);
  return { ok: true, transferId };
}

export async function rejectTransfer(transferId: string): Promise<TransferActionResult> {
  const idError = validateIds(transferId);
  if (idError) return { ok: false, code: idError };
  const { data, error } = await invoke("reject_roll_transfer", { p_transfer_id: transferId });
  if (error || data !== transferId) return { ok: false, code: publicError(error?.message, "PG_TRANSFER_ACTION_FAILED") };
  revalidateTransfer(transferId);
  return { ok: true, transferId };
}

async function releaseItems(input: {
  requestId: string;
  transferId: string;
  rollIds: string[];
  reason: string;
  admin: boolean;
}): Promise<TransferActionResult> {
  const rollIds = Array.isArray(input.rollIds) ? [...new Set(input.rollIds)] : [];
  const idError = validateIds(input.transferId, rollIds);
  if (idError) return { ok: false, code: idError.replace("RECEIPT", "RESOLUTION") };
  if (!uuidPattern.test(input.requestId ?? "")) return { ok: false, code: "PG_TRANSFER_RESOLUTION_REQUEST_ID_REQUIRED" };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 500) return { ok: false, code: "PG_TRANSFER_RESOLUTION_REASON_INVALID" };

  const { data, error } = await invoke(
    input.admin ? "admin_release_unreceived_roll_transfer_items" : "release_unreceived_roll_transfer_items",
    {
      p_request_id: input.requestId,
      p_transfer_id: input.transferId,
      p_roll_ids: rollIds,
      p_reason: reason,
    },
  );

  if (error || data !== input.transferId) {
    return { ok: false, code: publicError(error?.message, "PG_TRANSFER_ACTION_FAILED") };
  }

  revalidateTransfer(input.transferId);
  return { ok: true, transferId: input.transferId };
}

export async function releaseUnreceivedTransferItems(input: {
  requestId: string;
  transferId: string;
  rollIds: string[];
  reason: string;
}): Promise<TransferActionResult> {
  return releaseItems({ ...input, admin: false });
}

export async function adminReleaseUnreceivedTransferItems(input: {
  requestId: string;
  transferId: string;
  rollIds: string[];
  reason: string;
}): Promise<TransferActionResult> {
  return releaseItems({ ...input, admin: true });
}

export async function adminRecoveryCancelTransfer(input: {
  transferId: string;
  reason: string;
}): Promise<TransferActionResult> {
  const idError = validateIds(input.transferId);
  if (idError) return { ok: false, code: idError };
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 500) return { ok: false, code: "PG_TRANSFER_ADMIN_REASON_INVALID" };

  const { data, error } = await invoke("admin_cancel_pending_roll_transfer", {
    p_transfer_id: input.transferId,
    p_reason: reason,
  });
  if (error || data !== input.transferId) return { ok: false, code: publicError(error?.message, "PG_TRANSFER_ACTION_FAILED") };
  revalidateTransfer(input.transferId);
  return { ok: true, transferId: input.transferId };
}
