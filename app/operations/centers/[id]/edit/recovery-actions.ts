"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function centerEditPath(centerId: string, query?: string) {
  return `/operations/centers/${centerId}/edit${query ? `?${query}` : ""}`;
}

function requireId(value: string, fallback: string) {
  if (!uuidPattern.test(value)) redirect(fallback);
  return value;
}

export async function recoverCenterOnboardingInvitation(formData: FormData) {
  await requireAdminProfile();

  const centerId = requireId(
    String(formData.get("center_id") ?? "").trim(),
    "/operations/centers",
  );
  const invitationId = requireId(
    String(formData.get("invitation_id") ?? "").trim(),
    centerEditPath(centerId, "error=invite-review-invalid"),
  );

  // Keep the ordinary Admin/RLS path in the authorization chain even though the
  // repair itself needs the server-only Auth Admin client.
  const supabase = await createSupabaseServerClient();
  const { data: center, error: centerError } = await supabase
    .from("installation_centers")
    .select("id")
    .eq("id", centerId)
    .maybeSingle();

  if (centerError) throw centerError;
  if (!center) redirect("/operations/centers");

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .select("id, installation_center_id, invited_email, auth_user_id, status, review_required_at, failure_code")
    .eq("id", invitationId)
    .eq("installation_center_id", centerId)
    .eq("status", "accepted")
    .not("review_required_at", "is", null)
    .maybeSingle();

  if (invitationError) throw invitationError;
  if (!invitation || !invitation.review_required_at || !invitation.failure_code) {
    redirect(centerEditPath(centerId, "error=invite-review-missing"));
  }

  const userId = invitation.auth_user_id;
  if (!userId) {
    const { data: closed, error: closeError } = await supabaseAdmin
      .from("center_onboarding_invitations")
      .update({
        status: "superseded",
        accepted_at: null,
        superseded_at: new Date().toISOString(),
        review_required_at: null,
        failure_code: null,
      })
      .eq("id", invitation.id)
      .eq("status", "accepted")
      .not("review_required_at", "is", null)
      .select("id")
      .maybeSingle();

    if (closeError) throw closeError;
    if (!closed) redirect(centerEditPath(centerId, "error=invite-review-locked"));

    revalidatePath(centerEditPath(centerId));
    redirect(centerEditPath(centerId, "success=invite-review-superseded"));
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile) {
    redirect(centerEditPath(centerId, "error=invite-review-profile"));
  }

  const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const authUser = authResult.user;
  if (authError || !authUser) {
    redirect(centerEditPath(centerId, "error=invite-review-auth"));
  }

  const authEmail = authUser.email?.trim().toLowerCase();
  if (!authEmail || authEmail !== invitation.invited_email) {
    redirect(centerEditPath(centerId, "error=invite-review-identity"));
  }

  const { data: anotherCenterProfile, error: anotherCenterProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "center")
    .eq("installation_center_id", centerId)
    .limit(1)
    .maybeSingle();

  if (anotherCenterProfileError) throw anotherCenterProfileError;

  if (anotherCenterProfile) {
    const { data: closed, error: closeError } = await supabaseAdmin
      .from("center_onboarding_invitations")
      .update({
        status: "superseded",
        accepted_at: null,
        superseded_at: new Date().toISOString(),
        review_required_at: null,
        failure_code: null,
      })
      .eq("id", invitation.id)
      .eq("auth_user_id", userId)
      .eq("status", "accepted")
      .not("review_required_at", "is", null)
      .select("id")
      .maybeSingle();

    if (closeError) throw closeError;
    if (!closed) redirect(centerEditPath(centerId, "error=invite-review-locked"));

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      redirect(centerEditPath(centerId, "error=invite-review-cleanup"));
    }

    revalidatePath(centerEditPath(centerId));
    redirect(centerEditPath(centerId, "success=invite-review-superseded"));
  }

  const currentAppMetadata = authUser.app_metadata ?? {};
  const { pg_provisioning: _discardedProvisioning, ...safeAppMetadata } = currentAppMetadata;

  // Clean the authorization metadata while the audit row is still review-locked.
  // If this step fails, the invitation remains locked and cannot be retried.
  const { error: authRepairError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: safeAppMetadata,
    ban_duration: "none",
  });

  if (authRepairError) {
    redirect(centerEditPath(centerId, "error=invite-review-auth"));
  }

  // Re-prove absence after Auth metadata cleanup before reopening the invitation.
  const { data: profileAfterRepair, error: profileAfterRepairError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileAfterRepairError) throw profileAfterRepairError;
  if (profileAfterRepair) {
    await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    redirect(centerEditPath(centerId, "error=invite-review-profile"));
  }

  const { data: reopened, error: reopenError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .update({
      status: "pending",
      accepted_at: null,
      review_required_at: null,
      failure_code: null,
    })
    .eq("id", invitation.id)
    .eq("auth_user_id", userId)
    .eq("status", "accepted")
    .not("review_required_at", "is", null)
    .select("id")
    .maybeSingle();

  if (reopenError) throw reopenError;
  if (!reopened) {
    await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    redirect(centerEditPath(centerId, "error=invite-review-locked"));
  }

  revalidatePath(centerEditPath(centerId));
  redirect(centerEditPath(centerId, "success=invite-review-reopened"));
}
