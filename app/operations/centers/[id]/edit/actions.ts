"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseCenterCoreInput } from "@/lib/centers/center-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateCenter(formData: FormData) {
  await requireAdminProfile();

  const centerId = String(formData.get("center_id") ?? "").trim();

  if (!uuidPattern.test(centerId)) {
    redirect("/operations/centers");
  }

  const input = parseCenterCoreInput(formData);

  if (!input) {
    redirect(`/operations/centers/${centerId}/edit?error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("installation_centers")
    .update(input)
    .eq("id", centerId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/operations/centers/${centerId}/edit?error=duplicate`);
  }

  if (error?.code === "23503") {
    redirect(`/operations/centers/${centerId}/edit?error=dealer`);
  }

  if (error) {
    redirect(`/operations/centers/${centerId}/edit?error=failed`);
  }

  if (!data) {
    redirect("/operations/centers");
  }

  revalidatePath("/operations/centers");
  revalidatePath(`/operations/centers/${centerId}/edit`);
  redirect("/operations/centers");
}
