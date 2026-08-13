"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function approvalPath(centerId: string) {
  return `/operations/centers/${encodeURIComponent(centerId)}/approval`;
}

async function requireApprovalOperator() {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") {
    redirect("/access-denied");
  }
}

export async function approveCenterNetwork(formData: FormData) {
  await requireApprovalOperator();

  const centerId = String(formData.get("center_id") ?? "").trim();
  const locationCapturedAt = String(formData.get("location_captured_at") ?? "").trim();
  if (!uuidPattern.test(centerId)) redirect("/operations/centers");
  if (!locationCapturedAt || !Number.isFinite(Date.parse(locationCapturedAt))) {
    redirect(`${approvalPath(centerId)}?error=approve`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("approve_center_network", {
    p_center_id: centerId,
    p_expected_location_captured_at: locationCapturedAt,
  });
  if (error || !data?.[0]) redirect(`${approvalPath(centerId)}?error=approve`);

  revalidatePath("/operations");
  revalidatePath("/operations/centers");
  revalidatePath(approvalPath(centerId));
  redirect(`${approvalPath(centerId)}?success=approved`);
}

export async function revokeCenterNetworkApproval(formData: FormData) {
  await requireApprovalOperator();
  const centerId = String(formData.get("center_id") ?? "").trim();
  if (!uuidPattern.test(centerId)) redirect("/operations/centers");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("revoke_center_network_approval", { p_center_id: centerId });
  if (error || !data?.[0]) redirect(`${approvalPath(centerId)}?error=revoke`);

  revalidatePath("/operations");
  revalidatePath("/operations/centers");
  revalidatePath(approvalPath(centerId));
  redirect(`${approvalPath(centerId)}?success=revoked`);
}
