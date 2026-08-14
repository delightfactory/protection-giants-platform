import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  OuterRollLabelLotSource,
  OuterRollLabelOrderSource,
  OuterRollLabelProductSource,
  OuterRollLabelRollSource,
} from "@/lib/labels/outer-roll-label-plan";

const ROLL_PAGE_SIZE = 1_000;

export type OuterRollLabelSource = {
  product: OuterRollLabelProductSource;
  order: OuterRollLabelOrderSource;
  lots: readonly OuterRollLabelLotSource[];
  rolls: readonly OuterRollLabelRollSource[];
};

export class OuterRollLabelSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OuterRollLabelSourceError";
  }
}

export async function loadOuterRollLabelSource(
  productionOrderId: string,
): Promise<OuterRollLabelSource | null> {
  const supabase = await createSupabaseServerClient();
  const { data: orderRow, error: orderError } = await supabase
    .from("production_orders")
    .select(
      "id, product_id, status, order_number, production_date, total_rolls, product_code_snapshot, product_name_snapshot, product_version_snapshot, width_mm_snapshot, length_m_snapshot, thickness_mil_snapshot",
    )
    .eq("id", productionOrderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!orderRow) return null;

  const [productResult, lotsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, gtin")
      .eq("id", orderRow.product_id)
      .maybeSingle(),
    supabase
      .from("production_lots")
      .select("id, production_order_id, lot_number, lot_sequence, roll_count")
      .eq("production_order_id", orderRow.id)
      .order("lot_sequence", { ascending: true }),
  ]);

  if (productResult.error) throw productResult.error;
  if (lotsResult.error) throw lotsResult.error;
  if (!productResult.data) {
    throw new OuterRollLabelSourceError("Production Order Product identity is missing.");
  }

  const rolls: OuterRollLabelRollSource[] = [];
  for (let offset = 0; offset < orderRow.total_rolls; offset += ROLL_PAGE_SIZE) {
    const upperBound = Math.min(offset + ROLL_PAGE_SIZE, orderRow.total_rolls) - 1;
    const { data: page, error: rollsError } = await supabase
      .from("rolls")
      .select("id, production_order_id, production_lot_id, serial_number, roll_index")
      .eq("production_order_id", orderRow.id)
      .order("serial_number", { ascending: true })
      .range(offset, upperBound);

    if (rollsError) throw rollsError;
    rolls.push(...page.map((roll) => ({
      id: roll.id,
      productionOrderId: roll.production_order_id,
      productionLotId: roll.production_lot_id,
      serialNumber: roll.serial_number,
      rollIndex: roll.roll_index,
    })));

    if (page.length < upperBound - offset + 1) break;
  }

  return {
    product: {
      id: productResult.data.id,
      gtin: productResult.data.gtin,
    },
    order: {
      id: orderRow.id,
      productId: orderRow.product_id,
      status: orderRow.status,
      orderNumber: orderRow.order_number,
      productionDate: orderRow.production_date,
      totalRolls: orderRow.total_rolls,
      productCodeSnapshot: orderRow.product_code_snapshot,
      productNameSnapshot: orderRow.product_name_snapshot,
      productVersionSnapshot: orderRow.product_version_snapshot,
      widthMmSnapshot: orderRow.width_mm_snapshot,
      lengthMSnapshot: orderRow.length_m_snapshot,
      thicknessMilSnapshot: orderRow.thickness_mil_snapshot,
    },
    lots: lotsResult.data.map((lot) => ({
      id: lot.id,
      productionOrderId: lot.production_order_id,
      lotNumber: lot.lot_number,
      lotSequence: lot.lot_sequence,
      rollCount: lot.roll_count,
    })),
    rolls,
  };
}
