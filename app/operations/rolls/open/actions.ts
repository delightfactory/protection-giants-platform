"use server";

import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedOpeningErrors = new Set([
  "PG_ROLL_OPENING_REQUEST_ID_REQUIRED",
  "PG_ROLL_OPENING_SERIAL_INVALID",
  "PG_ROLL_OPENING_CENTER_REQUIRED",
  "PG_ROLL_OPENING_CENTER_INACTIVE",
  "PG_ROLL_OPENING_ROLL_NOT_FOUND",
  "PG_ROLL_OPENING_REQUEST_CONFLICT",
  "PG_ROLL_OPENING_PRODUCTION_MISSING",
  "PG_ROLL_OPENING_PRODUCTION_INVALID",
  "PG_ROLL_OPENING_CUSTODY_MISSING",
  "PG_ROLL_OPENING_NOT_CURRENT_CUSTODIAN",
  "PG_ROLL_OPENING_TRANSFER_RESERVED",
  "PG_ROLL_ALREADY_OPENED",
]);

type RpcError = { message?: string } | null;
type RpcResponse = { data: unknown; error: RpcError };
type RpcCaller = (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;

export type RollOpeningCandidate = {
  rollId: string;
  serialNumber: string;
  lotNumber: string;
  productCode: string;
  productName: string;
  openedAt: string | null;
  eligibility: "eligible" | "already_opened" | "transfer_reserved";
};

export type ResolveRollOpeningResult =
  | { ok: true; candidate: RollOpeningCandidate }
  | { ok: false; code: string };

export type OpenRollResult =
  | { ok: true; candidate: RollOpeningCandidate }
  | { ok: false; code: string };

function publicOpeningError(message: string | undefined): string {
  return message && exposedOpeningErrors.has(message) ? message : "PG_ROLL_OPENING_FAILED";
}

function isCandidateRow(value: unknown): value is {
  roll_id: string;
  serial_number: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  opened_at: string | null;
  eligibility: "eligible" | "already_opened" | "transfer_reserved";
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.roll_id === "string"
    && typeof row.serial_number === "string"
    && typeof row.lot_number === "string"
    && typeof row.product_code === "string"
    && typeof row.product_name === "string"
    && (row.opened_at === null || typeof row.opened_at === "string")
    && ["eligible", "already_opened", "transfer_reserved"].includes(String(row.eligibility));
}

function toCandidate(row: ReturnType<typeof candidateShape>): RollOpeningCandidate {
  return {
    rollId: row.roll_id,
    serialNumber: row.serial_number,
    lotNumber: row.lot_number,
    productCode: row.product_code,
    productName: row.product_name,
    openedAt: row.opened_at,
    eligibility: row.eligibility,
  };
}

function candidateShape(row: unknown) {
  if (!isCandidateRow(row)) throw new Error("Invalid Roll Opening candidate shape.");
  return row;
}

async function callRpc(name: string, args: Record<string, unknown>): Promise<RpcResponse> {
  const supabase = await createSupabaseServerClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
  return rpc(name, args);
}

export async function resolveRollOpeningCandidate(serialInput: string): Promise<ResolveRollOpeningResult> {
  const serial = normalizeRollSerial(serialInput ?? "");
  if (!serial) return { ok: false, code: "PG_ROLL_OPENING_SERIAL_INVALID" };

  const { data, error } = await callRpc("resolve_roll_opening_candidate", { p_roll_serial: serial });
  if (error) return { ok: false, code: publicOpeningError(error.message) };
  if (!Array.isArray(data) || data.length !== 1 || !isCandidateRow(data[0])) {
    return { ok: false, code: "PG_ROLL_OPENING_CANDIDATE_INVALID" };
  }

  return { ok: true, candidate: toCandidate(data[0]) };
}

export async function openRoll(input: { requestId: string; serialNumber: string }): Promise<OpenRollResult> {
  const serial = normalizeRollSerial(input.serialNumber ?? "");
  if (!uuidPattern.test(input.requestId ?? "")) return { ok: false, code: "PG_ROLL_OPENING_REQUEST_ID_REQUIRED" };
  if (!serial) return { ok: false, code: "PG_ROLL_OPENING_SERIAL_INVALID" };

  const { data, error } = await callRpc("open_roll", {
    p_request_id: input.requestId,
    p_roll_serial: serial,
  });

  if (error || typeof data !== "string") {
    return { ok: false, code: publicOpeningError(error?.message) };
  }

  const confirmation = await resolveRollOpeningCandidate(serial);
  if (!confirmation.ok) return { ok: false, code: "PG_ROLL_OPENING_CONFIRMATION_FAILED" };
  if (confirmation.candidate.rollId !== data || confirmation.candidate.eligibility !== "already_opened") {
    return { ok: false, code: "PG_ROLL_OPENING_CONFIRMATION_FAILED" };
  }

  return { ok: true, candidate: confirmation.candidate };
}
