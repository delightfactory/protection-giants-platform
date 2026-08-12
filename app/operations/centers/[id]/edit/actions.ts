"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { parseCenterCoreInput } from "@/lib/centers/center-core-input";
import { parseCenterParentRef } from "@/lib/centers/center-parent";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const countryCodePattern = /^[A-Z]{2}$/;

export async function updateCenter(formData: FormData) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const centerId = String(formData.get("center_id") ?? "").trim();
  if (!uuidPattern.test(centerId)) redirect("/operations/centers");

  const input = parseCenterCoreInput(formData);
  if (!input) redirect(`/operations/centers/${centerId}/edit?error=invalid`);

  const supabase = await createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("installation_centers")
    .select("id, dealer_id, country_agent_id, country_code")
    .eq("id", centerId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) redirect("/operations/centers");

  const currentParentRef = current.dealer_id
    ? `dealer:${current.dealer_id}`
    : current.country_agent_id
      ? `agent:${current.country_agent_id}`
      : "company";

  const submittedParentRef = String(formData.get("parent_ref") ?? "").trim();
  const parent = parseCenterParentRef(
    profile.role === "dealer" ? `dealer:${profile.dealer_id}` : submittedParentRef,
  );

  if (!parent) redirect(`/operations/centers/${centerId}/edit?error=invalid`);

  let countryAgentId: string | null = null;
  let dealerId: string | null = null;
  let countryCode: string;

  if (parent.type === "company") {
    if (profile.role !== "admin") redirect("/access-denied");
    countryCode = String(formData.get("company_country_code") ?? "").trim().toUpperCase();
    if (!countryCodePattern.test(countryCode)) {
      redirect(`/operations/centers/${centerId}/edit?error=invalid`);
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
    const unchanged = currentParentRef === `agent:${parent.id}`;
    if (!agent || (agent.status !== "active" && !unchanged)) {
      redirect(`/operations/centers/${centerId}/edit?error=parent`);
    }

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
    const unchanged = currentParentRef === `dealer:${parent.id}`;
    if (!dealer || (dealer.status !== "active" && !unchanged)) {
      redirect(`/operations/centers/${centerId}/edit?error=parent`);
    }

    dealerId = dealer.id;
    countryCode = dealer.country_code;
  }

  const { data, error } = await supabase
    .from("installation_centers")
    .update({
      ...input,
      country_agent_id: countryAgentId,
      dealer_id: dealerId,
      country_code: countryCode,
    })
    .eq("id", centerId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/operations/centers/${centerId}/edit?error=duplicate`);
  }

  if (error) {
    redirect(`/operations/centers/${centerId}/edit?error=failed`);
  }

  if (!data) redirect("/operations/centers");

  revalidatePath("/operations/centers");
  revalidatePath(`/operations/centers/${centerId}/edit`);
  redirect("/operations/centers");
}
