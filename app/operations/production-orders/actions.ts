"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function voidProductionOrder(formData: FormData) {
  await requireAdminProfile();

  const orderId = String(formData.get("order_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!uuidPattern.test(orderId)) {
    redirect("/operations/production-orders");
  }

  if (reason.length < 5 || reason.length > 500) {
    redirect(`/operations/production-orders/${orderId}?error=void-invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("void_production_order", {
    p_order_id: orderId,
    p_reason: reason,
  });

  if (error || data !== orderId) {
    redirect(`/operations/production-orders/${orderId}?error=void-failed`);
  }

  revalidatePath("/operations/production-orders");
  revalidatePath(`/operations/production-orders/${orderId}`);
  revalidatePath("/operations/rolls");
  revalidatePath(`/print/production-orders/${orderId}`);
  redirect(`/operations/production-orders/${orderId}?status=voided`);
}
