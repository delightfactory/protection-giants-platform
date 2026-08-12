"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOperationalUserId, parseOperationalUserPassword } from "@/lib/users/operational-user-input";

function onboardingPath(query: string) {
  return `/onboarding/center?${query}`;
}

export async function completeCenterOnboarding(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = parseOperationalUserPassword(formData, "password");
  const passwordConfirmation = String(formData.get("password_confirmation") ?? "");

  if (
    displayName.length < 2 ||
    displayName.length > 120 ||
    (phone && (phone.length < 5 || phone.length > 32)) ||
    !password ||
    password !== passwordConfirmation
  ) {
    redirect(onboardingPath("error=invalid"));
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !isOperationalUserId(userId)) {
    redirect(onboardingPath("error=session"));
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: existingProfile, error: profileReadError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, country_agent_id, dealer_id, installation_center_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileReadError) throw profileReadError;
  if (existingProfile) {
    if (
      existingProfile.role === "center" &&
      existingProfile.installation_center_id &&
      existingProfile.country_agent_id === null &&
      existingProfile.dealer_id === null
    ) {
      const { error: reconcileError } = await supabaseAdmin
        .from("center_onboarding_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("auth_user_id", userId)
        .eq("installation_center_id", existingProfile.installation_center_id)
        .eq("status", "pending");
      if (reconcileError) throw reconcileError;
      redirect("/operations");
    }

    redirect("/access-denied");
  }

  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .select("id, installation_center_id, invited_email, auth_user_id, status, accepted_at")
    .eq("auth_user_id", userId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invitationError) throw invitationError;
  if (!invitation || invitation.auth_user_id !== userId) {
    redirect(onboardingPath("error=invite-state"));
  }

  const { data: authResult, error: authReadError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const authUser = authResult.user;
  const authEmail = authUser?.email?.trim().toLowerCase();

  if (authReadError || !authUser || !authEmail || authEmail !== invitation.invited_email) {
    redirect(onboardingPath("error=invite-identity"));
  }

  const { data: center, error: centerError } = await supabaseAdmin
    .from("installation_centers")
    .select("id, code, name, status")
    .eq("id", invitation.installation_center_id)
    .maybeSingle();

  if (centerError) throw centerError;
  if (!center) redirect(onboardingPath("error=invite-state"));
  if (center.status !== "active") redirect(onboardingPath("error=center-inactive"));

  const { data: otherCenterProfile, error: otherCenterProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "center")
    .eq("installation_center_id", center.id)
    .neq("id", userId)
    .limit(1)
    .maybeSingle();

  if (otherCenterProfileError) throw otherCenterProfileError;
  if (otherCenterProfile) redirect(onboardingPath("error=center-onboarded"));

  // Stage recipient-controlled personal data first. The provisioning trigger is
  // intentionally activated only by the subsequent protected app_metadata update.
  const { data: stagedUserResult, error: stageError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: {
      center_name: center.name,
      center_code: center.code,
      display_name: displayName,
      phone: phone || null,
    },
  });

  if (stageError || !stagedUserResult.user) {
    redirect(onboardingPath("error=auth-update"));
  }

  let claimedFromPending = false;
  if (invitation.status === "pending") {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("center_onboarding_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("auth_user_id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimed) {
      redirect(onboardingPath("error=invite-state"));
    }

    claimedFromPending = true;
  }

  const rollbackClaim = async () => {
    if (!claimedFromPending) return;
    await supabaseAdmin
      .from("center_onboarding_invitations")
      .update({ status: "pending", accepted_at: null })
      .eq("id", invitation.id)
      .eq("auth_user_id", userId)
      .eq("status", "accepted");
  };

  // Recheck the mutable operational conditions after the invitation claim and
  // immediately before protected provisioning. This closes the practical race
  // where a Center is suspended or receives its first account during form work.
  const [latestCenterResult, concurrentProfileResult] = await Promise.all([
    supabaseAdmin
      .from("installation_centers")
      .select("id, status")
      .eq("id", center.id)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "center")
      .eq("installation_center_id", center.id)
      .neq("id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestCenterResult.error || concurrentProfileResult.error) {
    await rollbackClaim();
    throw latestCenterResult.error ?? concurrentProfileResult.error;
  }

  if (!latestCenterResult.data || latestCenterResult.data.status !== "active") {
    await rollbackClaim();
    redirect(onboardingPath("error=center-inactive"));
  }

  if (concurrentProfileResult.data) {
    await rollbackClaim();
    redirect(onboardingPath("error=center-onboarded"));
  }

  const previousAppMetadata = stagedUserResult.user.app_metadata ?? {};
  const { error: provisioningError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...previousAppMetadata,
      pg_provisioning: {
        version: "operational-v1",
        role: "center",
        installation_center_id: center.id,
      },
    },
  });

  if (provisioningError) {
    await rollbackClaim();
    redirect(onboardingPath("error=provisioning"));
  }

  const { data: createdProfile, error: createdProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, role, status, country_agent_id, dealer_id, installation_center_id")
    .eq("id", userId)
    .maybeSingle();

  const exactProfile =
    createdProfile?.id === userId &&
    createdProfile.role === "center" &&
    createdProfile.status === "active" &&
    createdProfile.installation_center_id === center.id &&
    createdProfile.country_agent_id === null &&
    createdProfile.dealer_id === null &&
    createdProfile.display_name === displayName &&
    createdProfile.phone === (phone || null);

  if (createdProfileError || !exactProfile) {
    // A mismatch after pg_provisioning is a security boundary, not a normal
    // validation error. If a Profile exists, fail closed by suspending both
    // Auth and the Profile and keep the invitation claimed for admin review.
    // If no Profile was created, restore app metadata and reopen the invitation
    // so the same trusted recipient can retry safely.
    if (createdProfile) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: previousAppMetadata,
        ban_duration: "876000h",
      });
      await supabaseAdmin
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", userId);
    } else if (!createdProfileError) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: previousAppMetadata,
      });
      await rollbackClaim();
    } else {
      // We cannot prove whether Profile creation happened while the read path
      // is failing. Ban Auth and leave the claimed invitation locked for a
      // deliberate admin review rather than risking a second provisioning path.
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
    }

    redirect(onboardingPath("error=profile"));
  }

  revalidatePath("/operations");
  redirect("/operations");
}
