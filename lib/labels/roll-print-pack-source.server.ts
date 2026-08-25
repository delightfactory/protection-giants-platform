import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadOuterRollLabelSource,
  type OuterRollLabelSource,
} from "@/lib/labels/outer-roll-label-source.server";

export type RollWarrantyPrintIdentity = {
  rollId: string;
  publicCode: string;
};

export type RollPrintPackSource = OuterRollLabelSource & {
  warrantyIdentities: ReadonlyMap<string, RollWarrantyPrintIdentity>;
};

export class RollPrintPackSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollPrintPackSourceError";
  }
}

const publicCodePattern = /^[0-9a-f]{64}$/;

export async function loadRollWarrantyPrintIdentities(
  productionOrderId: string,
  expectedRollIds: readonly string[],
): Promise<ReadonlyMap<string, RollWarrantyPrintIdentity>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_roll_warranty_print_identities", {
    p_production_order_id: productionOrderId,
  });

  if (error) throw error;

  const warrantyIdentities = new Map<string, RollWarrantyPrintIdentity>();
  for (const row of data ?? []) {
    if (!row.roll_id || !publicCodePattern.test(row.public_code)) {
      throw new RollPrintPackSourceError("Warranty print identity source returned an invalid mapping.");
    }
    if (warrantyIdentities.has(row.roll_id)) {
      throw new RollPrintPackSourceError("Warranty print identity source returned a duplicate Roll mapping.");
    }
    warrantyIdentities.set(row.roll_id, {
      rollId: row.roll_id,
      publicCode: row.public_code,
    });
  }

  if (warrantyIdentities.size !== expectedRollIds.length) {
    throw new RollPrintPackSourceError("Warranty print identity source is incomplete for this Production Order.");
  }

  for (const rollId of expectedRollIds) {
    if (!warrantyIdentities.has(rollId)) {
      throw new RollPrintPackSourceError("A Production Order Roll is missing its Warranty print identity.");
    }
  }

  return warrantyIdentities;
}

export async function loadRollPrintPackSource(
  productionOrderId: string,
): Promise<RollPrintPackSource | null> {
  const outerSource = await loadOuterRollLabelSource(productionOrderId);
  if (!outerSource) return null;

  const warrantyIdentities = await loadRollWarrantyPrintIdentities(
    productionOrderId,
    outerSource.rolls.map((roll) => roll.id),
  );

  return {
    ...outerSource,
    warrantyIdentities,
  };
}
