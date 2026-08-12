"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseOperationalUserCreateInput } from "@/lib/users/operational-user-input";

type OperationalUserCreateInput = NonNullable<ReturnType<typeof parseOperationalUserCreateInput>>;

function provisioningMetadata(input: OperationalUserCreateInput) {
  if (input.role === "agent") {
    return {
      version: "operational-v1",
      role: input.role,
      country_agent_id: input.country_agent_id,
    };
  }

  if (input.role === "dealer") {
    return {
      version: "operational-v1",
      role: input.role,
      dealer_id: input.dealer_id,
    };
  }

  if (input.role === "center") {
    return {
      version: "operational-v1",
      role: input.role,
      installation_center_id: input.installation_center_id,
    };
  }

  return { version: "operational-v1", role: input.role };
}

async function entityIsActive(input: OperationalUserCreateInput) {
  if (input.role === "admin") return true;

  const supabaseAdmin = createSupabaseAdminClient();

  if (input.role === "agent") {
    const { data, error } = await supabaseAdmin
      .from("country_agents")
      .select("id, status")
      .eq("id", input.country_agent_id)
      .maybeSingle();

    if (error) throw error;
    return data?.status === "active";
  }

  if (input.role === "dealer") {
    const { data, error } = await supabaseAdmin
      .from("dealers")
      .select("id, status")
      .eq("id", input.dealer_id)
      .maybeSingle();

    if (error) throw error;
    return data?.status === "active";
  }

  const { data, error } = await supabaseAdmin
    .from("installation_centers")
    .select("id, status")
    .eq("id", input.installation_center_id)
    .maybeSingle();

  if (error) throw error;
  return data?.status === "active";
}

function profileMatchesInput(
  profile: {
    role: string;
    country_agent_id: string | null;
    dealer_id: string | null;
    installation_center_id: string | null;
  },
  input: OperationalUserCreateInput,
) {
  if (profile.role !== input.role) return false;

  if (input.role === "admin") {
    return profile.country_agent_id === null && profile.dealer_id === null && profile.installation_center_id === null;
  }

  if (input.role === "agent") {
    return profile.country_agent_id === input.country_agent_id && profile.dealer_id === null && profile.installation_center_id === null;
  }

  if (input.role === "dealer") {
    return profile.country_agent_id === null && profile.dealer_id === input.dealer_id && profile.installation_center_id === null;
  }

  return profile.country_agent_id === null && profile.dealer_id === null && profile.installation_center_id === input.installation_center_id;
}

export async function createOperationalUser(formData: FormData) {
  await requireAdminProfile();

  const input = parseOperationalUserCreateInput(formData);

  if (!input) {
    redirect("/operations/users/new?error=invalid");
  }

  if (!(await entityIsActive(input))) {
    redirect("/operations/users/new?error=entity");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: {
      pg_provisioning: provisioningMetadata(input),
    },
    user_metadata: {
      display_name: input.display_name,
      ...(input.phone ? { phone: input.phone } : {}),
    },
  });

  if (error) {
    const message = error.message.toLowerCase();

    if (message.includes("already") || message.includes("exists") || message.includes("registered")) {
      redirect("/operations/users/new?error=duplicate");
    }

    if (message.includes("password")) {
      redirect("/operations/users/new?error=password");
    }

    redirect("/operations/users/new?error=auth");
  }

  const userId = data.user?.id;

  if (!userId) {
    redirect("/operations/users/new?error=auth");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, country_agent_id, dealer_id, installation_center_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || !profileMatchesInput(profile, input)) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    redirect("/operations/users/new?error=profile");
  }

  revalidatePath("/operations/users");
  redirect("/operations/users?success=created");
}
