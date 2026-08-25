"use server";

import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const exposedSupportErrors = new Set([
  "PG_WARRANTY_REQUEST_ID_REQUIRED",
  "PG_WARRANTY_REQUEST_CONFLICT",
  "PG_WARRANTY_ADMIN_REQUIRED",
  "PG_WARRANTY_NOT_FOUND",
  "PG_WARRANTY_DETAILS_INVALID",
  "PG_WARRANTY_CORRECTION_REASON_INVALID",
  "PG_WARRANTY_ALREADY_VOIDED",
]);

export type WarrantySupportResult =
  | { ok: true; eventId: string }
  | { ok: false; code: string };

export type CorrectWarrantyDetailsInput = {
  requestId: string;
  warrantyId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string;
  vehicleColor: string;
  vehicleVin: string;
  reason: string;
};

export type VoidWarrantyInput = {
  requestId: string;
  warrantyId: string;
  reason: string;
};

function supportError(message: string | undefined): string {
  return message && exposedSupportErrors.has(message) ? message : "PG_WARRANTY_SUPPORT_FAILED";
}

function validateIds(requestId: string, warrantyId: string): string | null {
  if (!uuidPattern.test(requestId ?? "")) return "PG_WARRANTY_REQUEST_ID_REQUIRED";
  if (!uuidPattern.test(warrantyId ?? "")) return "PG_WARRANTY_NOT_FOUND";
  return null;
}

function parseSupportResult(data: unknown, errorMessage?: string): WarrantySupportResult {
  if (errorMessage) return { ok: false, code: supportError(errorMessage) };
  if (typeof data !== "string" || !uuidPattern.test(data)) {
    return { ok: false, code: "PG_WARRANTY_SUPPORT_FAILED" };
  }
  return { ok: true, eventId: data };
}

export async function correctWarrantyDetails(input: CorrectWarrantyDetailsInput): Promise<WarrantySupportResult> {
  const idError = validateIds(input.requestId, input.warrantyId);
  if (idError) return { ok: false, code: idError };

  const args = {
    p_action_request_id: input.requestId,
    p_warranty_id: input.warrantyId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail,
    p_vehicle_make: input.vehicleMake,
    p_vehicle_model: input.vehicleModel,
    p_vehicle_year: input.vehicleYear,
    p_vehicle_plate: input.vehiclePlate,
    p_vehicle_color: input.vehicleColor,
    p_vehicle_vin: input.vehicleVin,
    p_reason: input.reason,
  } as unknown as Database["public"]["Functions"]["correct_warranty_details"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("correct_warranty_details", args);
  const result = parseSupportResult(data, error?.message);

  if (result.ok) {
    revalidatePath("/operations/warranties");
    revalidatePath(`/operations/warranties/${input.warrantyId}`);
  }
  return result;
}

export async function voidWarrantyInError(input: VoidWarrantyInput): Promise<WarrantySupportResult> {
  const idError = validateIds(input.requestId, input.warrantyId);
  if (idError) return { ok: false, code: idError };

  const args = {
    p_action_request_id: input.requestId,
    p_warranty_id: input.warrantyId,
    p_reason: input.reason,
  } satisfies Database["public"]["Functions"]["void_warranty_in_error"]["Args"];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("void_warranty_in_error", args);
  const result = parseSupportResult(data, error?.message);

  if (result.ok) {
    revalidatePath("/operations/warranties");
    revalidatePath(`/operations/warranties/${input.warrantyId}`);
  }
  return result;
}
