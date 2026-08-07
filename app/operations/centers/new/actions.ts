"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseCenterCoreInput } from "@/lib/centers/center-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createCenter(formData: FormData) {
  await requireAdminProfile();

  const input = parseCenterCoreInput(formData);

  if (!input) {
    redirect("/operations/centers/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("installation_centers").insert(input);

  if (error?.code === "23505") {
    redirect("/operations/centers/new?error=duplicate");
  }

  if (error?.code === "23503") {
    redirect("/operations/centers/new?error=dealer");
  }

  if (error) {
    redirect("/operations/centers/new?error=failed");
  }

  revalidatePath("/operations/centers");
  redirect("/operations/centers");
}
