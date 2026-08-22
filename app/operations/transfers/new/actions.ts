"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeTransferId } from "@/lib/transfers/transfer-id";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedTransferErrors = new Set([
  "PG_TRANSFER_UNAUTHENTICATED",
  "PG_TRANSFER_ACTOR_INACTIVE",
  "PG_TRANSFER_ACTOR_ROLE_INVALID",
  "PG_TRANSFER_ACTOR_PARTY_MISSING",
  "PG_TRANSFER_RECIPIENT_INVALID",
  "PG_TRANSFER_RECIPIENT_NOT_FOUND",
  "PG_TRANSFER_RECIPIENT_INACTIVE",
  "PG_TRANSFER_SENDER_RECIPIENT_SAME",
  "PG_TRANSFER_ROLL_COUNT_INVALID",
  "PG_TRANSFER_ROLL_ID_NULL",
  "PG_TRANSFER_ROLL_ID_DUPLICATE",
  "PG_TRANSFER_ROLL_NOT_FOUND",
  "PG_TRANSFER_PRODUCTION_VOIDED",
  "PG_TRANSFER_CUSTODY_MISSING",
  "PG_TRANSFER_ROLL_NOT_HELD",
  "PG_TRANSFER_ROLL_RESERVED",
  "PG_TRANSFER_ROLL_OPENED",
  "PG_TRANSFER_REQUEST_ID_REQUIRED",
  "PG_TRANSFER_REQUEST_ACTOR_CONFLICT",
  "PG_TRANSFER_REQUEST_PAYLOAD_CONFLICT",
  "PG_TRANSFER_SEQUENCE_EXHAUSTED",
]);

export type SendTransferActionInput = {
  requestId: string;
  recipientTransferId: string;
  rollIds: string[];
};

export type SendTransferActionResult =
  | {
      ok: true;
      transferId: string;
      transferNumber: string;
      rollCount: number;
      status: "pending";
    }
  | {
      ok: false;
      code: string;
    };

function publicTransferError(message: string | undefined): string {
  return message && exposedTransferErrors.has(message) ? message : "PG_TRANSFER_SEND_FAILED";
}

export async function sendRollTransfer(input: SendTransferActionInput): Promise<SendTransferActionResult> {
  const recipientTransferId = normalizeTransferId(input.recipientTransferId ?? "");
  const rollIds = Array.isArray(input.rollIds) ? [...new Set(input.rollIds)] : [];

  if (!uuidPattern.test(input.requestId ?? "")) return { ok: false, code: "PG_TRANSFER_REQUEST_ID_REQUIRED" };
  if (!recipientTransferId) return { ok: false, code: "PG_TRANSFER_RECIPIENT_INVALID" };
  if (rollIds.length < 1 || rollIds.length > 10000) return { ok: false, code: "PG_TRANSFER_ROLL_COUNT_INVALID" };
  if (rollIds.some((rollId) => !uuidPattern.test(rollId))) return { ok: false, code: "PG_TRANSFER_ROLL_NOT_FOUND" };

  const supabase = await createSupabaseServerClient();
  const { data: transferId, error } = await supabase.rpc("create_roll_transfer", {
    p_request_id: input.requestId,
    p_recipient_transfer_code: recipientTransferId,
    p_roll_ids: rollIds,
  });

  if (error || !transferId) {
    return { ok: false, code: publicTransferError(error?.message) };
  }

  const { data: transfer, error: transferError } = await supabase
    .from("roll_transfers")
    .select("transfer_number, roll_count, status")
    .eq("id", transferId)
    .maybeSingle();

  if (transferError || !transfer || transfer.status !== "pending") {
    return { ok: false, code: "PG_TRANSFER_SEND_CONFIRMATION_FAILED" };
  }

  return {
    ok: true,
    transferId,
    transferNumber: transfer.transfer_number,
    rollCount: transfer.roll_count,
    status: "pending",
  };
}
