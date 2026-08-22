"use server";

import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedRecoveryErrors = new Set([
  "PG_ROLL_RECOVERY_REQUEST_ID_REQUIRED",
  "PG_ROLL_RECOVERY_PHYSICAL_RECEIPT_REQUIRED",
  "PG_ROLL_RECOVERY_REASON_INVALID",
  "PG_ROLL_RECOVERY_SERIAL_INVALID",
  "PG_ROLL_RECOVERY_NOT_AUTHORIZED",
  "PG_ROLL_RECOVERY_ACTOR_INACTIVE",
  "PG_ROLL_RECOVERY_AGENT_PARTY_INVALID",
  "PG_ROLL_RECOVERY_AGENT_NOT_ENABLED",
  "PG_ROLL_RECOVERY_ROLL_NOT_FOUND",
  "PG_ROLL_RECOVERY_REQUEST_CONFLICT",
  "PG_ROLL_RECOVERY_PRODUCTION_MISSING",
  "PG_ROLL_RECOVERY_PRODUCTION_INVALID",
  "PG_ROLL_RECOVERY_NOT_OPENED",
  "PG_ROLL_RECOVERY_CUSTODY_MISSING",
  "PG_ROLL_RECOVERY_ALREADY_AT_DESTINATION",
  "PG_ROLL_RECOVERY_TRANSFER_RESERVED",
  "PG_ROLL_RECOVERY_AGENT_CENTER_REQUIRED",
  "PG_ROLL_RECOVERY_OUTSIDE_AGENT_SCOPE",
  "PG_ROLL_RECOVERY_RECEIPT_INCONSISTENT",
]);

export type OpenedRollRecoveryCandidate = {
  rollId: string;
  serialNumber: string;
  lotNumber: string;
  productCode: string;
  productName: string;
  openedAt: string;
  openingCenterName: string;
  currentCustodianType: string;
  currentCustodianName: string;
  recoveryDestinationName: string;
  eligibility: "eligible" | "transfer_reserved" | "already_at_destination";
};

export type ResolveRecoveryCandidateResult =
  | { ok: true; candidate: OpenedRollRecoveryCandidate }
  | { ok: false; code: string };

export type RecoverOpenedRollResult =
  | { ok: true; transferId: string }
  | { ok: false; code: string };

function publicRecoveryError(message: string | undefined): string {
  if (message === "PG_TRANSFER_ACTOR_INACTIVE") return "PG_ROLL_RECOVERY_ACTOR_INACTIVE";
  return message && exposedRecoveryErrors.has(message) ? message : "PG_ROLL_RECOVERY_FAILED";
}

function isCandidateRow(value: unknown): value is {
  roll_id: string;
  serial_number: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  opened_at: string;
  opening_center_name: string;
  current_custodian_type: string;
  current_custodian_name: string;
  recovery_destination_name: string;
  eligibility: "eligible" | "transfer_reserved" | "already_at_destination";
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.roll_id === "string"
    && typeof row.serial_number === "string"
    && typeof row.lot_number === "string"
    && typeof row.product_code === "string"
    && typeof row.product_name === "string"
    && typeof row.opened_at === "string"
    && typeof row.opening_center_name === "string"
    && typeof row.current_custodian_type === "string"
    && typeof row.current_custodian_name === "string"
    && typeof row.recovery_destination_name === "string"
    && ["eligible", "transfer_reserved", "already_at_destination"].includes(String(row.eligibility));
}

function toCandidate(row: Parameters<typeof isCandidateRow>[0]): OpenedRollRecoveryCandidate {
  if (!isCandidateRow(row)) throw new Error("Invalid Opened Roll Recovery candidate shape.");
  return {
    rollId: row.roll_id,
    serialNumber: row.serial_number,
    lotNumber: row.lot_number,
    productCode: row.product_code,
    productName: row.product_name,
    openedAt: row.opened_at,
    openingCenterName: row.opening_center_name,
    currentCustodianType: row.current_custodian_type,
    currentCustodianName: row.current_custodian_name,
    recoveryDestinationName: row.recovery_destination_name,
    eligibility: row.eligibility,
  };
}

export async function resolveOpenedRollRecoveryCandidate(serialInput: string): Promise<ResolveRecoveryCandidateResult> {
  const serial = normalizeRollSerial(serialInput ?? "");
  if (!serial) return { ok: false, code: "PG_ROLL_RECOVERY_SERIAL_INVALID" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_opened_roll_recovery_candidate", { p_roll_serial: serial });
  if (error) return { ok: false, code: publicRecoveryError(error.message) };
  if (!Array.isArray(data) || data.length !== 1 || !isCandidateRow(data[0])) {
    return { ok: false, code: "PG_ROLL_RECOVERY_CANDIDATE_INVALID" };
  }

  return { ok: true, candidate: toCandidate(data[0]) };
}

export async function recoverOpenedRoll(input: {
  requestId: string;
  serialNumber: string;
  reason: string;
  confirmPhysicalReceipt: boolean;
}): Promise<RecoverOpenedRollResult> {
  const serial = normalizeRollSerial(input.serialNumber ?? "");
  const reason = (input.reason ?? "").trim();

  if (!uuidPattern.test(input.requestId ?? "")) return { ok: false, code: "PG_ROLL_RECOVERY_REQUEST_ID_REQUIRED" };
  if (!serial) return { ok: false, code: "PG_ROLL_RECOVERY_SERIAL_INVALID" };
  if (reason.length < 5 || reason.length > 500) return { ok: false, code: "PG_ROLL_RECOVERY_REASON_INVALID" };
  if (input.confirmPhysicalReceipt !== true) return { ok: false, code: "PG_ROLL_RECOVERY_PHYSICAL_RECEIPT_REQUIRED" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recover_opened_roll", {
    p_request_id: input.requestId,
    p_roll_serial: serial,
    p_reason: reason,
    p_confirm_physical_receipt: true,
  });

  if (error || typeof data !== "string") {
    return { ok: false, code: publicRecoveryError(error?.message) };
  }

  return { ok: true, transferId: data };
}
