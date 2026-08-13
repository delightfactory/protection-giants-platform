"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { parseCenterCoreInput } from "@/lib/centers/center-core-input";
import { parseCenterParentRef } from "@/lib/centers/center-parent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const countryCodePattern = /^[A-Z]{2}$/;

export async function createCenter(formData: FormData) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const input = parseCenterCoreInput(formData);
  const submittedParentRef = String(formData.get("parent_ref") ?? "").trim();
  const parent = parseCenterParentRef(
    profile.role === "dealer" ? `dealer:${profile.dealer_id}` : submittedParentRef,
  );

  if (!input || !parent) {
    redirect("/operations/centers/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  let countryAgentId: string | null = null;
  let dealerId: string | null = null;
  let countryCode: string;

  if (parent.type === "company") {
    if (profile.role !== "admin") redirect("/access-denied");
    countryCode = String(formData.get("company_country_code") ?? "").trim().toUpperCase();
    if (!countryCodePattern.test(countryCode)) {
      redirect("/operations/centers/new?error=invalid");
    }
  } else if (parent.type === "agent") {
    if (profile.role === "dealer") redirect("/access-denied");
    if (profile.role === "agent" && parent.id !== profile.country_agent_id) redirect("/access-denied");

    const { data: agent, error: agentError } = await supabase
      .from("country_agents")
      .select("id, country_code, status")
      .eq("id", parent.id)
      .maybeSingle();

    if (agentError) throw agentError;
    if (!agent || agent.status !== "active") redirect("/operations/centers/new?error=parent");

    countryAgentId = agent.id;
    countryCode = agent.country_code;
  } else {
    if (profile.role === "dealer" && parent.id !== profile.dealer_id) redirect("/access-denied");

    const { data: dealer, error: dealerError } = await supabase
      .from("dealers")
      .select("id, country_code, status")
      .eq("id", parent.id)
      .maybeSingle();

    if (dealerError) throw dealerError;
    if (!dealer || dealer.status !== "active") redirect("/operations/centers/new?error=parent");

    dealerId = dealer.id;
    countryCode = dealer.country_code;
  }

  const { error } = await supabase.from("installation_centers").insert({
    ...input,
    country_agent_id: countryAgentId,
    dealer_id: dealerId,
    country_code: countryCode,
  });

  if (error?.code === "23505") {
    redirect("/operations/centers/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/centers/new?error=failed");
  }

  revalidatePath("/operations/centers");
  redirect("/operations/centers");
}
