import "server-only";

import { createSupabasePublicClient } from "@/lib/supabase/public";

export const PUBLIC_WARRANTY_CODE_PATTERN = /^[0-9a-f]{64}$/;

export type PublicWarrantyView =
  | { kind: "not_found" }
  | { kind: "temporarily_unavailable" }
  | { kind: "not_activated"; productName: string }
  | { kind: "no_current_warranty_after_void"; productName: string }
  | { kind: "unavailable_for_warranty"; productName: string }
  | {
      kind: "active" | "expired";
      productName: string;
      warrantyNumber: string;
      activatedAt: string;
      coverageExpiresAt: string;
      activatingCenterName: string;
      vehicleMake: string;
      vehicleModel: string;
      vehicleYear: number | null;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: UnknownRecord, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalYear(row: UnknownRecord): number | null | undefined {
  const value = row.vehicle_year;
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1886 && value <= 2200) {
    return value;
  }
  return undefined;
}

function requiredTimestamp(row: UnknownRecord, key: string): string | null {
  const value = requiredString(row, key);
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function mapResolverRow(value: unknown): PublicWarrantyView {
  if (!isRecord(value)) return { kind: "temporarily_unavailable" };

  const publicState = requiredString(value, "public_state");
  if (!publicState) return { kind: "temporarily_unavailable" };

  if (publicState === "temporarily_unavailable") {
    return { kind: "temporarily_unavailable" };
  }

  const productName = requiredString(value, "product_name");
  if (!productName) return { kind: "temporarily_unavailable" };

  if (
    publicState === "not_activated"
    || publicState === "no_current_warranty_after_void"
    || publicState === "unavailable_for_warranty"
  ) {
    return { kind: publicState, productName };
  }

  if (publicState !== "active" && publicState !== "expired") {
    return { kind: "temporarily_unavailable" };
  }

  const warrantyNumber = requiredString(value, "warranty_number");
  const activatedAt = requiredTimestamp(value, "activated_at");
  const coverageExpiresAt = requiredTimestamp(value, "coverage_expires_at");
  const activatingCenterName = requiredString(value, "activating_center_name");
  const vehicleMake = requiredString(value, "vehicle_make");
  const vehicleModel = requiredString(value, "vehicle_model");
  const vehicleYear = optionalYear(value);

  if (
    !warrantyNumber
    || !activatedAt
    || !coverageExpiresAt
    || !activatingCenterName
    || !vehicleMake
    || !vehicleModel
    || vehicleYear === undefined
  ) {
    return { kind: "temporarily_unavailable" };
  }

  return {
    kind: publicState,
    productName,
    warrantyNumber,
    activatedAt,
    coverageExpiresAt,
    activatingCenterName,
    vehicleMake,
    vehicleModel,
    vehicleYear,
  };
}

export async function resolvePublicWarranty(publicCode: string): Promise<PublicWarrantyView> {
  if (!PUBLIC_WARRANTY_CODE_PATTERN.test(publicCode)) {
    return { kind: "not_found" };
  }

  try {
    // Always use the anonymous public client. A signed-in platform session must
    // not change what a customer bearer URL can see.
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("resolve_public_warranty", {
      p_public_code: publicCode,
    });

    if (error) return { kind: "temporarily_unavailable" };
    if (!Array.isArray(data) || data.length === 0) return { kind: "not_found" };
    if (data.length !== 1) return { kind: "temporarily_unavailable" };

    // Supabase-generated RETURNS TABLE types do not preserve per-field SQL
    // nullability. Normalize the actual runtime row before it reaches the UI.
    return mapResolverRow(data[0] as unknown);
  } catch {
    // Deliberately avoid logging the bearer code or embedding it in diagnostics.
    return { kind: "temporarily_unavailable" };
  }
}
