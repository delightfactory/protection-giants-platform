import { redirect } from "next/navigation";
import type { Tables } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const operationalRoles = ["admin", "dealer", "center"] as const;

export type OperationalRole = (typeof operationalRoles)[number];

type OperationalProfileRow = Pick<
  Tables<"profiles">,
  | "id"
  | "display_name"
  | "role"
  | "status"
  | "dealer_id"
  | "installation_center_id"
>;

type ActiveProfileBase = Pick<OperationalProfileRow, "id" | "display_name"> & {
  status: "active";
};

export type AdminProfile = ActiveProfileBase & {
  role: "admin";
  dealer_id: null;
  installation_center_id: null;
};

export type DealerProfile = ActiveProfileBase & {
  role: "dealer";
  dealer_id: string;
  installation_center_id: null;
};

export type CenterProfile = ActiveProfileBase & {
  role: "center";
  dealer_id: null;
  installation_center_id: string;
};

export type OperationalProfile = AdminProfile | DealerProfile | CenterProfile;

function isOperationalRole(role: string): role is OperationalRole {
  return operationalRoles.some((allowedRole) => allowedRole === role);
}

function toOperationalProfile(
  profile: OperationalProfileRow,
): OperationalProfile | null {
  if (profile.status !== "active" || !isOperationalRole(profile.role)) {
    return null;
  }

  if (
    profile.role === "admin" &&
    profile.dealer_id === null &&
    profile.installation_center_id === null
  ) {
    return profile as AdminProfile;
  }

  if (
    profile.role === "dealer" &&
    profile.dealer_id !== null &&
    profile.installation_center_id === null
  ) {
    return profile as DealerProfile;
  }

  if (
    profile.role === "center" &&
    profile.dealer_id === null &&
    profile.installation_center_id !== null
  ) {
    return profile as CenterProfile;
  }

  return null;
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
    .select(
      "id, display_name, role, status, dealer_id, installation_center_id",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile) {
    redirect("/access-denied");
  }

  const operationalProfile = toOperationalProfile(profile);

  if (!operationalProfile) {
    redirect("/access-denied");
  }

  if (operationalProfile.role === "dealer") {
    const { data: dealer, error: dealerError } = await supabase
      .from("dealers")
      .select("id, status")
      .eq("id", operationalProfile.dealer_id)
      .maybeSingle();

    if (dealerError) {
      throw dealerError;
    }

    if (!dealer || dealer.status !== "active") {
      redirect("/access-denied");
    }
  }

  if (operationalProfile.role === "center") {
    const { data: center, error: centerError } = await supabase
      .from("installation_centers")
      .select("id, status")
      .eq("id", operationalProfile.installation_center_id)
      .maybeSingle();

    if (centerError) {
      throw centerError;
    }

    if (!center || center.status !== "active") {
      redirect("/access-denied");
    }
  }

  return operationalProfile;
}

export async function requireAdminProfile(): Promise<AdminProfile> {
  const profile = await requireOperationalProfile();

  if (profile.role !== "admin") {
    redirect("/access-denied");
  }

  return profile;
}
