"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dealerStatuses = ["active", "suspended"] as const;

type DealerStatus = (typeof dealerStatuses)[number];

function isDealerStatus(value: string): value is DealerStatus {
  return dealerStatuses.some((status) => status === value);
}

export async function setDealerStatus(formData: FormData) {
  await requireAdminProfile();

  const dealerId = String(formData.get("dealer_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!uuidPattern.test(dealerId) || !isDealerStatus(status)) {
    redirect("/operations/dealers");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dealers")
    .update({ status })
    .eq("id", dealerId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/operations/dealers?error=lifecycle");
  }

  revalidatePath("/operations/dealers");
  redirect("/operations/dealers");
}
