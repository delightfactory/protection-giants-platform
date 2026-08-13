"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { parseDealerCoreInput } from "@/lib/dealers/dealer-core-input";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isOperationalUserId,
  parseOperationalUserEmail,
  parseOperationalUserPassword,
} from "@/lib/users/operational-user-input";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dealerEditPath(dealerId: string, query?: string) {
  return `/operations/dealers/${dealerId}/edit${query ? `?${query}` : ""}`;
}

function requireDealerId(value: string) {
  if (!uuidPattern.test(value)) {
    redirect("/operations/dealers");
  }

  return value;
}

async function requireScopedDealer(dealerId: string, { requireActive = false } = {}) {
  requireDealerId(dealerId);

  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") {
    redirect("/access-denied");
  }

  const supabase = await createSupabaseServerClient();
  const { data: dealer, error } = await supabase
    .from("dealers")
    .select("id, country_agent_id, country_code, status")
    .eq("id", dealerId)
    .maybeSingle();

  if (error) throw error;
  if (!dealer) redirect("/operations/dealers");
  if (requireActive && dealer.status !== "active") {
    redirect(dealerEditPath(dealerId, "error=account-dealer-inactive"));
  }

  return { profile, dealer };
}

async function requireScopedDealerAccount(dealerId: string, userId: string) {
  await requireScopedDealer(dealerId);

  if (!isOperationalUserId(userId)) {
    redirect(dealerEditPath(dealerId, "error=account-invalid"));
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: account, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, status, country_agent_id, dealer_id, installation_center_id")
    .eq("id", userId)
    .eq("role", "dealer")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (error) throw error;
  if (
    !account ||
    account.role !== "dealer" ||
    account.dealer_id !== dealerId ||
    account.country_agent_id !== null ||
    account.installation_center_id !== null
  ) {
    redirect(dealerEditPath(dealerId, "error=account-missing"));
  }

  return { account, supabaseAdmin };
}

export async function updateDealer(formData: FormData) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") {
    redirect("/access-denied");
  }

  const dealerId = requireDealerId(String(formData.get("dealer_id") ?? "").trim());
  const input = parseDealerCoreInput(formData);
  const submittedAgentId = String(formData.get("country_agent_id") ?? "").trim();
  const requestedAgentId = profile.role === "agent" ? profile.country_agent_id : submittedAgentId;

  if (!input || !isOperationalUserId(requestedAgentId)) {
    redirect(dealerEditPath(dealerId, "error=invalid"));
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
    redirect(dealerEditPath(dealerId, "error=agent"));
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
    redirect(dealerEditPath(dealerId, "error=duplicate"));
  }

  if (error) {
    redirect(dealerEditPath(dealerId, "error=failed"));
  }

  if (!data) redirect("/operations/dealers");

  revalidatePath("/operations/dealers");
  revalidatePath(dealerEditPath(dealerId));
  redirect("/operations/dealers");
}

export async function createDealerAccount(formData: FormData) {
  const dealerId = requireDealerId(String(formData.get("dealer_id") ?? "").trim());
  await requireScopedDealer(dealerId, { requireActive: true });

  const displayName = String(formData.get("display_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = parseOperationalUserEmail(formData);
  const password = parseOperationalUserPassword(formData, "password");

  if (
    displayName.length < 2 ||
    displayName.length > 120 ||
    (phone && (phone.length < 5 || phone.length > 32)) ||
    !email ||
    !password
  ) {
    redirect(dealerEditPath(dealerId, "error=account-invalid"));
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      pg_provisioning: {
        version: "operational-v1",
        role: "dealer",
        dealer_id: dealerId,
      },
    },
    user_metadata: {
      display_name: displayName,
      ...(phone ? { phone } : {}),
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already") || message.includes("exists") || message.includes("registered")) {
      redirect(dealerEditPath(dealerId, "error=account-duplicate"));
    }
    if (message.includes("password")) {
      redirect(dealerEditPath(dealerId, "error=account-password"));
    }
    redirect(dealerEditPath(dealerId, "error=account-auth"));
  }

  const userId = data.user?.id;
  if (!userId) {
    redirect(dealerEditPath(dealerId, "error=account-auth"));
  }

  const { data: createdProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, country_agent_id, dealer_id, installation_center_id")
    .eq("id", userId)
    .maybeSingle();

  const exactBinding =
    createdProfile?.role === "dealer" &&
    createdProfile.dealer_id === dealerId &&
    createdProfile.country_agent_id === null &&
    createdProfile.installation_center_id === null;

  if (profileError || !exactBinding) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    redirect(dealerEditPath(dealerId, "error=account-profile"));
  }

  revalidatePath(dealerEditPath(dealerId));
  redirect(dealerEditPath(dealerId, "success=account-created"));
}

export async function setDealerAccountStatus(formData: FormData) {
  const dealerId = requireDealerId(String(formData.get("dealer_id") ?? "").trim());
  const userId = String(formData.get("user_id") ?? "").trim();
  const targetStatus = String(formData.get("target_status") ?? "").trim();

  if (targetStatus !== "active" && targetStatus !== "suspended") {
    redirect(dealerEditPath(dealerId, "error=account-invalid"));
  }

  const { account, supabaseAdmin } = await requireScopedDealerAccount(dealerId, userId);

  if (account.status === targetStatus) {
    redirect(dealerEditPath(dealerId, "success=account-status"));
  }

  const targetBan = targetStatus === "suspended" ? "876000h" : "none";
  const rollbackBan = account.status === "suspended" ? "876000h" : "none";

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: targetBan,
  });

  if (authError) {
    redirect(dealerEditPath(dealerId, "error=account-status-auth"));
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ status: targetStatus })
    .eq("id", userId)
    .eq("role", "dealer")
    .eq("dealer_id", dealerId);

  if (profileError) {
    await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: rollbackBan });
    redirect(dealerEditPath(dealerId, "error=account-status-profile"));
  }

  revalidatePath(dealerEditPath(dealerId));
  redirect(dealerEditPath(dealerId, "success=account-status"));
}

export async function resetDealerAccountPassword(formData: FormData) {
  const dealerId = requireDealerId(String(formData.get("dealer_id") ?? "").trim());
  const userId = String(formData.get("user_id") ?? "").trim();
  const password = parseOperationalUserPassword(formData, "new_password");

  if (!password) {
    redirect(dealerEditPath(dealerId, "error=account-password"));
  }

  const { supabaseAdmin } = await requireScopedDealerAccount(dealerId, userId);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });

  if (error) {
    redirect(dealerEditPath(dealerId, "error=account-password"));
  }

  redirect(dealerEditPath(dealerId, "success=account-password"));
}
