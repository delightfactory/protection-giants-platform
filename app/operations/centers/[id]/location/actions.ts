"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFiniteNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function correctCenterLocation(formData: FormData) {
  await requireAdminProfile();

  const centerId = String(formData.get("center_id") ?? "").trim();
  const latitude = parseFiniteNumber(formData.get("latitude"));
  const longitude = parseFiniteNumber(formData.get("longitude"));

  if (
    !uuidPattern.test(centerId) ||
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    redirect(`/operations/centers/${encodeURIComponent(centerId)}/location?error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_update_center_location", {
    p_center_id: centerId,
    p_latitude: latitude,
    p_longitude: longitude,
  });

  if (error || !data?.[0]) {
    redirect(`/operations/centers/${centerId}/location?error=failed`);
  }

  revalidatePath("/operations/centers");
  revalidatePath(`/operations/centers/${centerId}/location`);
  redirect(`/operations/centers/${centerId}/location?success=corrected`);
}
