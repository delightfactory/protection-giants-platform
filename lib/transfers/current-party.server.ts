import type { OperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TransferPartyType } from "./transfer-id";

export type CurrentTransferParty = {
  id: string;
  partyType: TransferPartyType;
  transferCode: string;
};

export async function getCurrentTransferParty(profile: OperationalProfile): Promise<CurrentTransferParty> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("operational_parties")
    .select("id, party_type, transfer_code");

  if (profile.role === "admin") {
    query = query.eq("party_type", "company");
  } else if (profile.role === "agent") {
    query = query.eq("country_agent_id", profile.country_agent_id);
  } else if (profile.role === "dealer") {
    query = query.eq("dealer_id", profile.dealer_id);
  } else {
    query = query.eq("installation_center_id", profile.installation_center_id);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Operational Party is missing for the current Profile.");

  if (!["company", "agent", "dealer", "center"].includes(data.party_type)) {
    throw new Error("Operational Party has an unsupported type.");
  }

  return {
    id: data.id,
    partyType: data.party_type as TransferPartyType,
    transferCode: data.transfer_code,
  };
}
