"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseOperationalProfileInput,
  parseOperationalTargetId,
  parseOperationalUserEmail,
  parseOperationalUserPassword,
} from "@/lib/users/operational-user-input";

function editPath(userId: string, query: string) {
  return `/operations/users/${userId}/edit?${query}`;
}

async function getOperationalProfile(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, role, status, country_agent_id, dealer_id, installation_center_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function bindingIsAvailable(
  input: NonNullable<ReturnType<typeof parseOperationalProfileInput>>,
  current: NonNullable<Awaited<ReturnType<typeof getOperationalProfile>>>,
) {
  if (input.role === "admin") return true;

  const supabaseAdmin = createSupabaseAdminClient();

  if (input.role === "agent") {
    const { data, error } = await supabaseAdmin
      .from("country_agents")
      .select("id, status")
      .eq("id", input.country_agent_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return false;

    const unchanged = current.role === "agent" && current.country_agent_id === input.country_agent_id;
    return data.status === "active" || unchanged;
  }

  if (input.role === "dealer") {
    const { data, error } = await supabaseAdmin
      .from("dealers")
      .select("id, status")
      .eq("id", input.dealer_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return false;

    const unchanged = current.role === "dealer" && current.dealer_id === input.dealer_id;
    return data.status === "active" || unchanged;
  }

  const { data, error } = await supabaseAdmin
    .from("installation_centers")
    .select("id, status")
    .eq("id", input.installation_center_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  const unchanged =
    current.role === "center" &&
    current.installation_center_id === input.installation_center_id;
  return data.status === "active" || unchanged;
}

export async function updateOperationalUserProfile(formData: FormData) {
  const adminProfile = await requireAdminProfile();
  const userId = parseOperationalTargetId(formData);
  const input = parseOperationalProfileInput(formData);

  if (!userId || !input) {
    redirect("/operations/users?error=invalid");
  }

  const current = await getOperationalProfile(userId);

  if (!current) {
    redirect("/operations/users?error=missing");
  }

  if (userId === adminProfile.id && input.role !== "admin") {
    redirect(editPath(userId, "error=self-role"));
  }

  if (!(await bindingIsAvailable(input, current))) {
    redirect(editPath(userId, "error=entity"));
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update(input)
    .eq("id", userId);

  if (error) {
    redirect(editPath(userId, "error=profile"));
  }

  revalidatePath("/operations/users");
  revalidatePath(`/operations/users/${userId}/edit`);
  redirect(editPath(userId, "success=profile"));
}

export async function updateOperationalUserEmail(formData: FormData) {
  await requireAdminProfile();
  const userId = parseOperationalTargetId(formData);
  const email = parseOperationalUserEmail(formData);

  if (!userId || !email) {
    redirect("/operations/users?error=invalid");
  }

  if (!(await getOperationalProfile(userId))) {
    redirect("/operations/users?error=missing");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });

  if (error) {
    const message = error.message.toLowerCase();
    const code = message.includes("already") || message.includes("exists")
      ? "duplicate-email"
      : "email";
    redirect(editPath(userId, `error=${code}`));
  }

  revalidatePath("/operations/users");
  revalidatePath(`/operations/users/${userId}/edit`);
  redirect(editPath(userId, "success=email"));
}

export async function resetOperationalUserPassword(formData: FormData) {
  await requireAdminProfile();
  const userId = parseOperationalTargetId(formData);
  const password = parseOperationalUserPassword(formData);

  if (!userId || !password) {
    redirect("/operations/users?error=invalid");
  }

  if (!(await getOperationalProfile(userId))) {
    redirect("/operations/users?error=missing");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    redirect(editPath(userId, "error=password"));
  }

  redirect(editPath(userId, "success=password"));
}
