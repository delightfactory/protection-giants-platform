"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { parseDealerCoreInput } from "@/lib/dealers/dealer-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOperationalUserId } from "@/lib/users/operational-user-input";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateDealer(formData: FormData) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") {
    redirect("/access-denied");
  }

  const dealerId = String(formData.get("dealer_id") ?? "").trim();
  if (!uuidPattern.test(dealerId)) redirect("/operations/dealers");

  const input = parseDealerCoreInput(formData);
  const submittedAgentId = String(formData.get("country_agent_id") ?? "").trim();
  const requestedAgentId = profile.role === "agent" ? profile.country_agent_id : submittedAgentId;

  if (!input || !isOperationalUserId(requestedAgentId)) {
    redirect(`/operations/dealers/${dealerId}/edit?error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("dealers")
    .select("id, country_agent_id")
    .eq("id", dealerId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) redirect("/operations/dealers");

  const { data: agent, error: agentError } = await supabase
    .from("country_agents")
    .select("id, country_code, status")
    .eq("id", requestedAgentId)
    .maybeSingle();

  if (agentError) throw agentError;
  const unchangedAgent = current.country_agent_id === requestedAgentId;
  if (!agent || (agent.status !== "active" && !unchangedAgent)) {
    redirect(`/operations/dealers/${dealerId}/edit?error=agent`);
  }

  const { data, error } = await supabase
    .from("dealers")
    .update({
      ...input,
      country_agent_id: agent.id,
      country_code: agent.country_code,
    })
    .eq("id", dealerId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/operations/dealers/${dealerId}/edit?error=duplicate`);
  }

  if (error) {
    redirect(`/operations/dealers/${dealerId}/edit?error=failed`);
  }

  if (!data) redirect("/operations/dealers");

  revalidatePath("/operations/dealers");
  revalidatePath(`/operations/dealers/${dealerId}/edit`);
  redirect("/operations/dealers");
}
