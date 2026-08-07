"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const centerStatuses = ["active", "suspended"] as const;

type CenterStatus = (typeof centerStatuses)[number];

function isCenterStatus(value: string): value is CenterStatus {
  return centerStatuses.some((status) => status === value);
}

export async function setCenterStatus(formData: FormData) {
  await requireAdminProfile();

  const centerId = String(formData.get("center_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!uuidPattern.test(centerId) || !isCenterStatus(status)) {
    redirect("/operations/centers");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("installation_centers")
    .update({ status })
    .eq("id", centerId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/operations/centers?error=lifecycle");
  }

  revalidatePath("/operations/centers");
  redirect("/operations/centers");
}
