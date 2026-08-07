"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseDealerCoreInput } from "@/lib/dealers/dealer-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createDealer(formData: FormData) {
  await requireAdminProfile();

  const input = parseDealerCoreInput(formData);

  if (!input) {
    redirect("/operations/dealers/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("dealers").insert(input);

  if (error?.code === "23505") {
    redirect("/operations/dealers/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/dealers/new?error=failed");
  }

  revalidatePath("/operations/dealers");
  redirect("/operations/dealers");
}
