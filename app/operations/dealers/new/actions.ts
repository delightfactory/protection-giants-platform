"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { parseDealerCoreInput } from "@/lib/dealers/dealer-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOperationalUserId } from "@/lib/users/operational-user-input";

export async function createDealer(formData: FormData) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") {
    redirect("/access-denied");
  }

  const input = parseDealerCoreInput(formData);
  const submittedAgentId = String(formData.get("country_agent_id") ?? "").trim();
  const countryAgentId = profile.role === "agent" ? profile.country_agent_id : submittedAgentId;

  if (!input || !isOperationalUserId(countryAgentId)) {
    redirect("/operations/dealers/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data: agent, error: agentError } = await supabase
    .from("country_agents")
    .select("id, country_code, status")
    .eq("id", countryAgentId)
    .maybeSingle();

  if (agentError) throw agentError;
  if (!agent || agent.status !== "active") {
    redirect("/operations/dealers/new?error=agent");
  }

  const { error } = await supabase.from("dealers").insert({
    ...input,
    country_agent_id: agent.id,
    country_code: agent.country_code,
  });

  if (error?.code === "23505") {
    redirect("/operations/dealers/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/dealers/new?error=failed");
  }

  revalidatePath("/operations/dealers");
  redirect("/operations/dealers");
}
