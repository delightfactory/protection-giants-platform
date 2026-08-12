"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agentStatuses = ["active", "suspended"] as const;

type AgentStatus = (typeof agentStatuses)[number];

function isAgentStatus(value: string): value is AgentStatus {
  return agentStatuses.some((status) => status === value);
}

export async function setAgentStatus(formData: FormData) {
  await requireAdminProfile();

  const agentId = String(formData.get("agent_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!uuidPattern.test(agentId) || !isAgentStatus(status)) {
    redirect("/operations/agents");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("country_agents")
    .update({ status })
    .eq("id", agentId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/operations/agents?error=lifecycle");
  }

  revalidatePath("/operations/agents");
  redirect("/operations/agents");
}
