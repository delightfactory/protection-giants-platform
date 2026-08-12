"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseAgentCoreInput } from "@/lib/agents/agent-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createAgent(formData: FormData) {
  await requireAdminProfile();

  const input = parseAgentCoreInput(formData);

  if (!input) {
    redirect("/operations/agents/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("country_agents")
    .insert(input)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect("/operations/agents/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/agents/new?error=failed");
  }

  if (!data) {
    redirect("/operations/agents/new?error=failed");
  }

  revalidatePath("/operations/agents");
  redirect("/operations/agents");
}
