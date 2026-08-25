import { describe, expect, it } from "vitest";

import { buildOuterRollLabelPlan } from "../lib/labels/outer-roll-label-plan";
import {
  buildRollPrintPackPlan,
  ROLL_PRINT_PACK_LABEL_PIECES,
} from "../lib/labels/roll-print-pack-plan";
import { WARRANTY_PUBLIC_ORIGIN } from "../lib/labels/warranty-qr-label-plan";

const orderId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const lot1Id = "33333333-3333-4333-8333-333333333331";
const lot2Id = "33333333-3333-4333-8333-333333333332";

function serial(lotSequence, rollIndex) {
  return `PG-R-20260825-00000001-${String(lotSequence).padStart(2, "0")}-${String(rollIndex).padStart(4, "0")}`;
}

function roll(idSuffix, lotId, lotSequence, rollIndex) {
  return {
    id: `44444444-4444-4444-8444-${String(idSuffix).padStart(12, "0")}`,
    productionOrderId: orderId,
    productionLotId: lotId,
    serialNumber: serial(lotSequence, rollIndex),
    rollIndex,
  };
}

function buildFixture() {
  return buildOuterRollLabelPlan({
    publicSiteOrigin: "https://preview.protectiongiants.com",
    product: { id: productId, gtin: "4006381333931" },
    order: {
      id: orderId,
      productId,
      status: "generated",
      orderNumber: "PG-PO-20260825-00000001",
      productionDate: "2026-08-25",
      totalRolls: 3,
      productCodeSnapshot: "PG-N-TEST-002",
      productNameSnapshot: "PG Shield Ceramic",
      productVersionSnapshot: null,
      widthMmSnapshot: 1524,
      lengthMSnapshot: 15,
      thicknessMilSnapshot: 7.5,
    },
    lots: [
      { id: lot2Id, productionOrderId: orderId, lotNumber: "PG-L-20260825-00000001-02", lotSequence: 2, rollCount: 1 },
      { id: lot1Id, productionOrderId: orderId, lotNumber: "PG-L-20260825-00000001-01", lotSequence: 1, rollCount: 2 },
    ],
    rolls: [
      roll(3, lot2Id, 2, 1),
      roll(2, lot1Id, 1, 2),
      roll(1, lot1Id, 1, 1),
    ],
    selection: { mode: "order" },
    rollChunkSize: 2,
  });
}

function identitiesFor(plan) {
  const map = new Map();
  let index = 1;
  for (const item of plan.chunks.flatMap((chunk) => chunk.items)) {
    const hex = index.toString(16).padStart(64, "0");
    map.set(item.rollId, { rollId: item.rollId, publicCode: hex });
    index += 1;
  }
  return map;
}

describe("Cube O Roll Print Pack planner", () => {
  it("keeps one complete five-piece Pack per Roll and preserves chunk boundaries", () => {
    const outerPlan = buildFixture();
    const packPlan = buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identitiesFor(outerPlan) });

    expect(packPlan.rollCount).toBe(3);
    expect(packPlan.packCount).toBe(3);
    expect(packPlan.outerLabelCount).toBe(6);
    expect(packPlan.warrantyLabelCount).toBe(9);
    expect(packPlan.physicalLabelCount).toBe(3 * ROLL_PRINT_PACK_LABEL_PIECES);
    expect(packPlan.chunks.map((chunk) => chunk.packCount)).toEqual([2, 1]);
    expect(packPlan.chunks.map((chunk) => chunk.physicalLabelCount)).toEqual([10, 5]);

    for (const pack of packPlan.chunks.flatMap((chunk) => chunk.packs)) {
      expect(pack.outerCopies).toHaveLength(2);
      expect(pack.warrantyCopies).toHaveLength(3);
      expect(pack.outerCopies.every((copy) => copy.model.rollId === pack.rollId)).toBe(true);
      expect(pack.outerCopies.every((copy) => copy.model.rollSerial === pack.rollSerial)).toBe(true);
      expect(new Set(pack.warrantyCopies.map((copy) => copy.model.qrPayload)).size).toBe(1);
      expect(pack.warrantyCopies[0].model.qrPayload.startsWith(`${WARRANTY_PUBLIC_ORIGIN}/w/`)).toBe(true);
      expect(pack.warrantyCopies[0].model.qrPayload).not.toContain("preview.protectiongiants.com");
    }
  });

  it("keeps canonical Lot/Roll ordering from the existing Outer plan", () => {
    const outerPlan = buildFixture();
    const packPlan = buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identitiesFor(outerPlan) });
    expect(packPlan.chunks.flatMap((chunk) => chunk.packs.map((pack) => pack.rollSerial))).toEqual([
      serial(1, 1),
      serial(1, 2),
      serial(2, 1),
    ]);
  });

  it("fails closed when a selected Roll is missing its Warranty identity", () => {
    const outerPlan = buildFixture();
    const identities = identitiesFor(outerPlan);
    const first = outerPlan.chunks[0].items[0];
    identities.delete(first.rollId);
    expect(() => buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identities })).toThrow(/missing/i);
  });

  it("fails closed on mismatched Roll identity mapping", () => {
    const outerPlan = buildFixture();
    const identities = identitiesFor(outerPlan);
    const first = outerPlan.chunks[0].items[0];
    const existing = identities.get(first.rollId);
    identities.set(first.rollId, { ...existing, rollId: "55555555-5555-4555-8555-555555555555" });
    expect(() => buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identities })).toThrow(/missing/i);
  });

  it("is deterministic for unchanged source and identities", () => {
    const outerPlan = buildFixture();
    const identities = identitiesFor(outerPlan);
    expect(buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identities }))
      .toEqual(buildRollPrintPackPlan({ outerPlan, warrantyIdentities: identities }));
  });
});
