"use server";

import type { Database } from "@/lib/supabase/database.types";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedWarrantyErrors = new Set([
  "PG_WARRANTY_REQUEST_ID_REQUIRED",
  "PG_WARRANTY_REQUEST_CONFLICT",
  "PG_WARRANTY_CENTER_REQUIRED",
  "PG_WARRANTY_CENTER_INACTIVE",
  "PG_WARRANTY_SERIAL_INVALID",
  "PG_WARRANTY_ROLL_NOT_FOUND",
  "PG_WARRANTY_PRODUCTION_INVALID",
  "PG_WARRANTY_CUSTODY_MISSING",
  "PG_WARRANTY_NOT_CURRENT_CUSTODIAN",
  "PG_WARRANTY_TRANSFER_RESERVED",
  "PG_WARRANTY_ROLL_NOT_OPENED",
  "PG_WARRANTY_ISSUE_PENDING",
  "PG_WARRANTY_RETURN_REQUIRED",
  "PG_WARRANTY_ALREADY_ACTIVATED",
  "PG_WARRANTY_POLICY_INCOMPLETE",
  "PG_WARRANTY_CUSTOMER_INVALID",
  "PG_WARRANTY_VEHICLE_INVALID",
  "PG_WARRANTY_FORBIDDEN",
  "PG_WARRANTY_NOT_FOUND",
  "PG_WARRANTY_LIST_PAGING_INVALID",
  "PG_WARRANTY_SEARCH_INVALID",
  "PG_WARRANTY_FILTER_INVALID",
]);

export type WarrantyEligibility =
  | "eligible"
  | "production_invalid"
  | "transfer_reserved"
  | "not_opened"
  | "return_required"
  | "issue_pending"
  | "already_activated"
  | "policy_incomplete";

export type WarrantyActivationCandidate = {
  rollId: string;
  serialNumber: string;
  lotNumber: string;
  productCode: string;
  productName: string;
  productVersion: string | null;
  openedAt: string | null;
  actingCenterPartyId: string;
  actingCenterName: string;
  warrantyMonths: number | null;
  blockingIssueState: string | null;
  existingWarrantyId: string | null;
  existingWarrantyNumber: string | null;
  eligibility: WarrantyEligibility;
};

export type WarrantyActivationInput = {
  requestId: string;
  serialNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string;
  vehicleColor: string;
  vehicleVin: string;
};

export type WarrantyActivationResult = {
  warrantyId: string;
  warrantyNumber: string;
  recordState: "issued" | "voided_in_error";
  activatedAt: string;
  coverageExpiresAt: string;
  productCode: string;
  productName: string;
  productVersion: string | null;
  activatingCenterName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string | null;
  vehicleColor: string | null;
  vehicleVin: string;
};

export type ResolveWarrantyActivationResult =
  | { ok: true; candidate: WarrantyActivationCandidate }
  | { ok: false; code: string };

export type ActivateWarrantyResult =
  | { ok: true; warranty: WarrantyActivationResult }
  | { ok: false; code: string };

function publicWarrantyError(message: string | undefined): string {
  return message && exposedWarrantyErrors.has(message) ? message : "PG_WARRANTY_FAILED";
}

function isCandidateRow(value: unknown): value is {
  roll_id: string;
  serial_number: string;
  lot_number: string;
  product_code: string;
  product_name: string;
  product_version: string | null;
  opened_at: string | null;
  acting_center_party_id: string;
  acting_center_name: string;
  warranty_months: number | null;
  blocking_issue_state: string | null;
  existing_warranty_id: string | null;
  existing_warranty_number: string | null;
  eligibility: WarrantyEligibility;
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.roll_id === "string"
    && typeof row.serial_number === "string"
    && typeof row.lot_number === "string"
    && typeof row.product_code === "string"
    && typeof row.product_name === "string"
    && (row.product_version === null || typeof row.product_version === "string")
    && (row.opened_at === null || typeof row.opened_at === "string")
    && typeof row.acting_center_party_id === "string"
    && typeof row.acting_center_name === "string"
    && (row.warranty_months === null || typeof row.warranty_months === "number")
    && (row.blocking_issue_state === null || typeof row.blocking_issue_state === "string")
    && (row.existing_warranty_id === null || typeof row.existing_warranty_id === "string")
    && (row.existing_warranty_number === null || typeof row.existing_warranty_number === "string")
    && [
      "eligible",
      "production_invalid",
      "transfer_reserved",
      "not_opened",
      "return_required",
      "issue_pending",
      "already_activated",
      "policy_incomplete",
    ].includes(String(row.eligibility));
}

function toCandidate(row: ReturnType<typeof candidateShape>): WarrantyActivationCandidate {
  return {
    rollId: row.roll_id,
    serialNumber: row.serial_number,
    lotNumber: row.lot_number,
    productCode: row.product_code,
    productName: row.product_name,
    productVersion: row.product_version,
    openedAt: row.opened_at,
    actingCenterPartyId: row.acting_center_party_id,
    actingCenterName: row.acting_center_name,
    warrantyMonths: row.warranty_months,
    blockingIssueState: row.blocking_issue_state,
    existingWarrantyId: row.existing_warranty_id,
    existingWarrantyNumber: row.existing_warranty_number,
    eligibility: row.eligibility,
  };
}

function candidateShape(row: unknown) {
  if (!isCandidateRow(row)) throw new Error("Invalid Warranty activation candidate shape.");
  return row;
}

function isActivationRow(value: unknown): value is {
  warranty_id: string;
  warranty_number: string;
  record_state: "issued" | "voided_in_error";
  activated_at: string;
  coverage_expires_at: string;
  product_code: string;
  product_name: string;
  product_version: string | null;
  activating_center_name: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  vehicle_color: string | null;
  vehicle_vin: string;
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.warranty_id === "string"
    && typeof row.warranty_number === "string"
    && ["issued", "voided_in_error"].includes(String(row.record_state))
    && typeof row.activated_at === "string"
    && typeof row.coverage_expires_at === "string"
    && typeof row.product_code === "string"
    && typeof row.product_name === "string"
    && (row.product_version === null || typeof row.product_version === "string")
    && typeof row.activating_center_name === "string"
    && typeof row.customer_name === "string"
    && typeof row.customer_phone === "string"
    && (row.customer_email === null || typeof row.customer_email === "string")
    && typeof row.vehicle_make === "string"
    && typeof row.vehicle_model === "string"
    && (row.vehicle_year === null || typeof row.vehicle_year === "number")
    && (row.vehicle_plate === null || typeof row.vehicle_plate === "string")
    && (row.vehicle_color === null || typeof row.vehicle_color === "string")
    && typeof row.vehicle_vin === "string";
}

function toActivation(row: Extract<Database["public"]["Functions"]["activate_roll_warranty"]["Returns"], unknown[]>[number]): WarrantyActivationResult {
  if (!isActivationRow(row)) throw new Error("Invalid Warranty activation result shape.");
  return {
    warrantyId: row.warranty_id,
    warrantyNumber: row.warranty_number,
    recordState: row.record_state,
    activatedAt: row.activated_at,
    coverageExpiresAt: row.coverage_expires_at,
    productCode: row.product_code,
    productName: row.product_name,
    productVersion: row.product_version,
    activatingCenterName: row.activating_center_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    vehicleMake: row.vehicle_make,
    vehicleModel: row.vehicle_model,
    vehicleYear: row.vehicle_year,
    vehiclePlate: row.vehicle_plate,
    vehicleColor: row.vehicle_color,
    vehicleVin: row.vehicle_vin,
  };
}

export async function resolveWarrantyActivationCandidate(serialInput: string): Promise<ResolveWarrantyActivationResult> {
  const serial = normalizeRollSerial(serialInput ?? "");
  if (!serial) return { ok: false, code: "PG_WARRANTY_SERIAL_INVALID" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_warranty_activation_candidate", { p_roll_serial: serial });
  if (error) return { ok: false, code: publicWarrantyError(error.message) };
  if (!Array.isArray(data) || data.length !== 1 || !isCandidateRow(data[0])) {
    return { ok: false, code: "PG_WARRANTY_CANDIDATE_INVALID" };
  }

  return { ok: true, candidate: toCandidate(data[0]) };
}

export async function activateWarranty(input: WarrantyActivationInput): Promise<ActivateWarrantyResult> {
  const serial = normalizeRollSerial(input.serialNumber ?? "");
  if (!uuidPattern.test(input.requestId ?? "")) return { ok: false, code: "PG_WARRANTY_REQUEST_ID_REQUIRED" };
  if (!serial) return { ok: false, code: "PG_WARRANTY_SERIAL_INVALID" };

  const args = {
    p_request_id: input.requestId,
    p_roll_serial: serial,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail,
    p_vehicle_make: input.vehicleMake,
    p_vehicle_model: input.vehicleModel,
    p_vehicle_year: input.vehicleYear,
    p_vehicle_plate: input.vehiclePlate,
    p_vehicle_color: input.vehicleColor,
    p_vehicle_vin: input.vehicleVin,
  } as unknown as Database["public"]["Functions"]["activate_roll_warranty"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("activate_roll_warranty", args);
  if (error) return { ok: false, code: publicWarrantyError(error.message) };
  if (!Array.isArray(data) || data.length !== 1 || !isActivationRow(data[0])) {
    return { ok: false, code: "PG_WARRANTY_CONFIRMATION_FAILED" };
  }

  return { ok: true, warranty: toActivation(data[0]) };
}
