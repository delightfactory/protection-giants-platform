"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseAgentCoreInput } from "@/lib/agents/agent-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateAgent(formData: FormData) {
  await requireAdminProfile();

  const agentId = String(formData.get("agent_id") ?? "").trim();

  if (!uuidPattern.test(agentId)) {
    redirect("/operations/agents");
  }

  const input = parseAgentCoreInput(formData);

  if (!input) {
    redirect(`/operations/agents/${agentId}/edit?error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("country_agents")
    .update(input)
    .eq("id", agentId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/operations/agents/${agentId}/edit?error=duplicate`);
  }

  if (error?.code === "23503") {
    redirect(`/operations/agents/${agentId}/edit?error=country-bound`);
  }

  if (error) {
    redirect(`/operations/agents/${agentId}/edit?error=failed`);
  }

  if (!data) {
    redirect("/operations/agents");
  }

  revalidatePath("/operations/agents");
  revalidatePath(`/operations/agents/${agentId}/edit`);
  redirect("/operations/agents");
}
