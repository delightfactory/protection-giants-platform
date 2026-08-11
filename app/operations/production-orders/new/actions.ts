"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import type { Json } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type LotInput = {
  quantity: number;
  source_reference?: string;
};

function isValidDateInput(value: string) {
  if (!datePattern.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function parseLots(value: FormDataEntryValue | null): LotInput[] | null {
  if (typeof value !== "string" || !value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 50) return null;

    let total = 0;
    const lots: LotInput[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const quantity = Number(record.quantity);
      const sourceReference = typeof record.source_reference === "string" ? record.source_reference.trim() : "";

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return null;
      if (sourceReference.length > 120) return null;

      total += quantity;
      if (total > 10000) return null;

      lots.push({
        quantity,
        ...(sourceReference ? { source_reference: sourceReference } : {}),
      });
    }

    return lots;
  } catch {
    return null;
  }
}

export async function createProductionOrder(formData: FormData) {
  await requireAdminProfile();

  const requestId = String(formData.get("request_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const productionDate = String(formData.get("production_date") ?? "").trim();
  const sourceReference = String(formData.get("source_reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const lots = parseLots(formData.get("lots_json"));

  if (
    !uuidPattern.test(requestId)
    || !uuidPattern.test(productId)
    || !isValidDateInput(productionDate)
    || sourceReference.length > 120
    || notes.length > 2000
    || !lots
  ) {
    redirect("/operations/production-orders/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_production_order", {
    p_request_id: requestId,
    p_product_id: productId,
    p_production_date: productionDate,
    p_lots: lots as Json,
    ...(sourceReference ? { p_source_reference: sourceReference } : {}),
    ...(notes ? { p_notes: notes } : {}),
  });

  if (error || !data) {
    redirect("/operations/production-orders/new?error=failed");
  }

  revalidatePath("/operations/production-orders");
  revalidatePath("/operations/rolls");
  redirect(`/operations/production-orders/${data}`);
}
