"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeTransferId } from "@/lib/transfers/transfer-id";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return { ok: false, code: error?.message ?? "PG_TRANSFER_SEND_FAILED" };
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
