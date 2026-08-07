import { redirect } from "next/navigation";
import type { Tables } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const operationalRoles = ["admin", "dealer", "center"] as const;

export type OperationalRole = (typeof operationalRoles)[number];
export type OperationalProfile = Pick<
  Tables<"profiles">,
  "id" | "display_name" | "role" | "status"
> & { role: OperationalRole };

function isOperationalRole(role: string): role is OperationalRole {
  return operationalRoles.some((allowedRole) => allowedRole === role);
}

export async function requireOperationalProfile(): Promise<OperationalProfile> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile || profile.status !== "active" || !isOperationalRole(profile.role)) {
    redirect("/access-denied");
  }

  return profile as OperationalProfile;
}
