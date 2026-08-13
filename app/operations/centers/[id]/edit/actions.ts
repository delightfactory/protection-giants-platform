"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { parseCenterCoreInput } from "@/lib/centers/center-core-input";
import { parseCenterParentRef } from "@/lib/centers/center-parent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAuthUserByEmail } from "@/lib/users/auth-admin";
import { parseOperationalUserEmail } from "@/lib/users/operational-user-input";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const countryCodePattern = /^[A-Z]{2}$/;

type ScopedCenter = {
  id: string;
  code: string;
  name: string;
  status: string;
};

function centerEditPath(centerId: string, query?: string) {
  return `/operations/centers/${centerId}/edit${query ? `?${query}` : ""}`;
}

function requireCenterId(value: string) {
  if (!uuidPattern.test(value)) redirect("/operations/centers");
  return value;
}

function requireInvitationId(value: string, centerId: string) {
  if (!uuidPattern.test(value)) redirect(centerEditPath(centerId, "error=invite-invalid"));
  return value;
}

async function requireScopedCenter(centerId: string, { requireActive = false } = {}) {
  requireCenterId(centerId);

  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const supabase = await createSupabaseServerClient();
  const { data: center, error } = await supabase
    .from("installation_centers")
    .select("id, code, name, status")
    .eq("id", centerId)
    .maybeSingle();

  if (error) throw error;
  if (!center) redirect("/operations/centers");
  if (requireActive && center.status !== "active") {
    redirect(centerEditPath(centerId, "error=invite-center-inactive"));
  }

  return { profile, center };
}

async function readAnyCenterProfile(centerId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "center")
    .eq("installation_center_id", centerId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function issueCenterInvitation({
  center,
  inviterProfileId,
  email,
}: {
  center: ScopedCenter;
  inviterProfileId: string;
  email: string;
}) {
  if (await readAnyCenterProfile(center.id)) return "invite-onboarded";

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: openInvitation, error: openInvitationError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .select("id, status")
    .eq("installation_center_id", center.id)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openInvitationError) throw openInvitationError;
  if (openInvitation?.status === "pending") return "invite-pending";
  if (openInvitation?.status === "accepted") return "invite-locked";

  const existingAuthUser = await findAuthUserByEmail(email);
  if (existingAuthUser) return "invite-email-unavailable";

  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .insert({
      installation_center_id: center.id,
      invited_email: email,
      invited_by_profile_id: inviterProfileId,
    })
    .select("id")
    .single();

  if (invitationError?.code === "23505") return "invite-pending";
  if (invitationError || !invitation) return "invite-audit";

  const cancelAudit = async () => {
    await supabaseAdmin
      .from("center_onboarding_invitations")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("status", "pending");
  };

  const { data: invitedUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      center_name: center.name,
      center_code: center.code,
    },
  });

  const userId = invitedUser.user?.id;
  if (inviteError || !userId) {
    await cancelAudit();
    return "invite-auth";
  }

  // A global Admin can still create a Center user concurrently. Do not leave a
  // redundant onboarding Auth user if the Center acquired an account meanwhile.
  if (await readAnyCenterProfile(center.id)) {
    await cancelAudit();
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return "invite-onboarded";
  }

  const { data: boundInvitation, error: bindError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .update({ auth_user_id: userId })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .is("auth_user_id", null)
    .select("id")
    .maybeSingle();

  if (bindError || !boundInvitation) {
    await cancelAudit();
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return "invite-audit";
  }

  return null;
}

async function closePendingInvitation({
  centerId,
  invitationId,
  targetStatus,
}: {
  centerId: string;
  invitationId: string;
  targetStatus: "cancelled" | "superseded";
}) {
  await requireScopedCenter(centerId);
  const supabaseAdmin = createSupabaseAdminClient();

  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .select("id, invited_email, auth_user_id, status")
    .eq("id", invitationId)
    .eq("installation_center_id", centerId)
    .eq("status", "pending")
    .maybeSingle();

  if (invitationError) throw invitationError;
  if (!invitation) return { error: "invite-missing" as const };

  if (invitation.auth_user_id) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, installation_center_id")
      .eq("id", invitation.auth_user_id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile?.role === "center" && profile.installation_center_id === centerId) {
      const { error: reconcileError } = await supabaseAdmin
        .from("center_onboarding_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("status", "pending");
      if (reconcileError) throw reconcileError;
      return { error: "invite-onboarded" as const };
    }

    if (profile) {
      const timestamp = new Date().toISOString();
      const { error: conflictCloseError } = await supabaseAdmin
        .from("center_onboarding_invitations")
        .update(targetStatus === "cancelled"
          ? { status: "cancelled", cancelled_at: timestamp }
          : { status: "superseded", superseded_at: timestamp })
        .eq("id", invitation.id)
        .eq("status", "pending");
      if (conflictCloseError) throw conflictCloseError;
      return { error: "invite-email-unavailable" as const };
    }
  }

  const timestamp = new Date().toISOString();
  const { data: closed, error: closeError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .update(targetStatus === "cancelled"
      ? { status: "cancelled", cancelled_at: timestamp }
      : { status: "superseded", superseded_at: timestamp })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  // If the invitee claimed the invitation first (pending -> accepted), never
  // delete that Auth user. The accepted claim owns finalization from this point.
  if (closeError) throw closeError;
  if (!closed) return { error: "invite-locked" as const };

  if (invitation.auth_user_id) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(invitation.auth_user_id);
    if (deleteError) return { error: "invite-cleanup" as const };
  }

  return { error: null, email: invitation.invited_email };
}

export async function updateCenter(formData: FormData) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const centerId = requireCenterId(String(formData.get("center_id") ?? "").trim());
  const input = parseCenterCoreInput(formData);
  if (!input) redirect(centerEditPath(centerId, "error=invalid"));

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

  if (!parent) redirect(centerEditPath(centerId, "error=invalid"));

  let countryAgentId: string | null = null;
  let dealerId: string | null = null;
  let countryCode: string;

  if (parent.type === "company") {
    if (profile.role !== "admin") redirect("/access-denied");
    countryCode = String(formData.get("company_country_code") ?? "").trim().toUpperCase();
    if (!countryCodePattern.test(countryCode)) {
      redirect(centerEditPath(centerId, "error=invalid"));
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
      redirect(centerEditPath(centerId, "error=parent"));
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
      redirect(centerEditPath(centerId, "error=parent"));
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

  if (error?.code === "23505") redirect(centerEditPath(centerId, "error=duplicate"));
  if (error) redirect(centerEditPath(centerId, "error=failed"));
  if (!data) redirect("/operations/centers");

  revalidatePath("/operations/centers");
  revalidatePath(centerEditPath(centerId));
  redirect("/operations/centers");
}

export async function sendCenterInvitation(formData: FormData) {
  const centerId = requireCenterId(String(formData.get("center_id") ?? "").trim());
  const email = parseOperationalUserEmail(formData);
  if (!email) redirect(centerEditPath(centerId, "error=invite-invalid"));

  const { profile, center } = await requireScopedCenter(centerId, { requireActive: true });
  const error = await issueCenterInvitation({ center, inviterProfileId: profile.id, email });

  if (error) redirect(centerEditPath(centerId, `error=${error}`));

  revalidatePath(centerEditPath(centerId));
  redirect(centerEditPath(centerId, "success=invite-sent"));
}

export async function cancelCenterInvitation(formData: FormData) {
  const centerId = requireCenterId(String(formData.get("center_id") ?? "").trim());
  const invitationId = requireInvitationId(String(formData.get("invitation_id") ?? "").trim(), centerId);

  const result = await closePendingInvitation({
    centerId,
    invitationId,
    targetStatus: "cancelled",
  });

  if (result.error) redirect(centerEditPath(centerId, `error=${result.error}`));

  revalidatePath(centerEditPath(centerId));
  redirect(centerEditPath(centerId, "success=invite-cancelled"));
}

export async function reissueCenterInvitation(formData: FormData) {
  const centerId = requireCenterId(String(formData.get("center_id") ?? "").trim());
  const invitationId = requireInvitationId(String(formData.get("invitation_id") ?? "").trim(), centerId);
  const { profile, center } = await requireScopedCenter(centerId, { requireActive: true });

  const closed = await closePendingInvitation({
    centerId,
    invitationId,
    targetStatus: "superseded",
  });

  if (closed.error) redirect(centerEditPath(centerId, `error=${closed.error}`));
  if (!closed.email) redirect(centerEditPath(centerId, "error=invite-missing"));

  const issueError = await issueCenterInvitation({
    center,
    inviterProfileId: profile.id,
    email: closed.email,
  });

  if (issueError) redirect(centerEditPath(centerId, `error=${issueError}`));

  revalidatePath(centerEditPath(centerId));
  redirect(centerEditPath(centerId, "success=invite-reissued"));
}
