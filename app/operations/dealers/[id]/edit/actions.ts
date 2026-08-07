"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseDealerCoreInput } from "@/lib/dealers/dealer-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateDealer(formData: FormData) {
  await requireAdminProfile();

  const dealerId = String(formData.get("dealer_id") ?? "").trim();

  if (!uuidPattern.test(dealerId)) {
    redirect("/operations/dealers");
  }

  const input = parseDealerCoreInput(formData);

  if (!input) {
    redirect(`/operations/dealers/${dealerId}/edit?error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dealers")
    .update(input)
    .eq("id", dealerId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/operations/dealers/${dealerId}/edit?error=duplicate`);
  }

  if (error) {
    redirect(`/operations/dealers/${dealerId}/edit?error=failed`);
  }

  if (!data) {
    redirect("/operations/dealers");
  }

  revalidatePath("/operations/dealers");
  revalidatePath(`/operations/dealers/${dealerId}/edit`);
  redirect("/operations/dealers");
}
