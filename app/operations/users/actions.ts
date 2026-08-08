"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseOperationalTargetId } from "@/lib/users/operational-user-input";

function returnPath(userId: string, returnTo: string, query: string) {
  if (returnTo === "edit") {
    return `/operations/users/${userId}/edit?${query}`;
  }

  return `/operations/users?${query}`;
}

export async function setOperationalUserStatus(formData: FormData) {
  const adminProfile = await requireAdminProfile();
  const userId = parseOperationalTargetId(formData);
  const targetStatus = formData.get("target_status");
  const returnTo = formData.get("return_to") === "edit" ? "edit" : "list";

  if (!userId || (targetStatus !== "active" && targetStatus !== "suspended")) {
    redirect("/operations/users?error=invalid");
  }

  if (userId === adminProfile.id && targetStatus === "suspended") {
    redirect(returnPath(userId, returnTo, "error=self-status"));
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: profile, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();

  if (readError) throw readError;
  if (!profile) {
    redirect("/operations/users?error=missing");
  }

  if (profile.status === targetStatus) {
    redirect(returnPath(userId, returnTo, "success=status"));
  }

  const targetBan = targetStatus === "suspended" ? "876000h" : "none";
  const rollbackBan = profile.status === "suspended" ? "876000h" : "none";

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: targetBan,
  });

  if (authError) {
    redirect(returnPath(userId, returnTo, "error=status-auth"));
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ status: targetStatus })
    .eq("id", userId);

  if (profileError) {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: rollbackBan,
    });
    redirect(returnPath(userId, returnTo, "error=status-profile"));
  }

  revalidatePath("/operations/users");
  revalidatePath(`/operations/users/${userId}/edit`);
  redirect(returnPath(userId, returnTo, "success=status"));
}
