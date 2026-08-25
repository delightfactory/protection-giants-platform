import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { buildOuterRollLabelPlan } from "../lib/labels/outer-roll-label-plan";
import { buildRollPrintPackPlan } from "../lib/labels/roll-print-pack-plan";
import {
  ROLL_PRINT_PACK_MASTER_PROFILE,
  planRollPrintPackMasterLayout,
} from "../lib/labels/roll-print-pack-layout";
import { renderRollPrintPackPdf } from "../lib/labels/roll-print-pack-pdf";

const POINTS_PER_MM = 72 / 25.4;
const orderId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const lotId = "33333333-3333-4333-8333-333333333331";

function serial(index) {
  return `PG-R-20260825-00000001-01-${String(index).padStart(4, "0")}`;
}

function outerPlan() {
  return buildOuterRollLabelPlan({
    publicSiteOrigin: "https://preview.protectiongiants.com",
    product: { id: productId, gtin: "4006381333931" },
    order: {
      id: orderId,
      productId,
      status: "generated",
      orderNumber: "PG-PO-20260825-00000001",
      productionDate: "2026-08-25",
      totalRolls: 2,
      productCodeSnapshot: "PG-N-TEST-002",
      productNameSnapshot: "PG Shield Ceramic",
      productVersionSnapshot: "Ceramic",
      widthMmSnapshot: 1524,
      lengthMSnapshot: 15,
      thicknessMilSnapshot: 7.5,
    },
    lots: [
      { id: lotId, productionOrderId: orderId, lotNumber: "PG-L-20260825-00000001-01", lotSequence: 1, rollCount: 2 },
    ],
    rolls: [1, 2].map((index) => ({
      id: `44444444-4444-4444-8444-${String(index).padStart(12, "0")}`,
      productionOrderId: orderId,
      productionLotId: lotId,
      serialNumber: serial(index),
      rollIndex: index,
    })),
    selection: { mode: "order" },
    rollChunkSize: 2,
  });
}

function packPlan() {
  const outer = outerPlan();
  const identities = new Map(
    outer.chunks.flatMap((chunk) => chunk.items).map((item, index) => [
      item.rollId,
      { rollId: item.rollId, publicCode: (index + 1).toString(16).padStart(64, "0") },
    ]),
  );
  return buildRollPrintPackPlan({ outerPlan: outer, warrantyIdentities: identities });
}

describe("Cube O Master Roll Print Pack PDF", () => {
  it("places exactly two Outer and three Warranty cut regions on one page per Roll", () => {
    const plan = packPlan();
    const chunk = plan.chunks[0];
    const layout = planRollPrintPackMasterLayout({
      chunk,
      firstPackOrdinal: 1,
      totalPackCount: plan.packCount,
    });

    expect(layout.pageCount).toBe(2);
    for (const page of layout.pages) {
      expect(page.placements).toHaveLength(5);
      expect(page.placements.filter((placement) => placement.kind === "outer")).toHaveLength(2);
      expect(page.placements.filter((placement) => placement.kind === "warranty")).toHaveLength(3);
      expect(page.header.yMm).toBeGreaterThan(
        Math.max(...page.placements.map((placement) => placement.yMm + placement.heightMm)),
      );
    }
  });

  it("uses the explicit one-Roll proof canvas and visible gutters", () => {
    const plan = packPlan();
    const layout = planRollPrintPackMasterLayout({
      chunk: plan.chunks[0],
      firstPackOrdinal: 1,
      totalPackCount: plan.packCount,
    });
    const [page] = layout.pages;
    const outers = page.placements.filter((placement) => placement.kind === "outer");
    const warranties = page.placements.filter((placement) => placement.kind === "warranty");

    expect(ROLL_PRINT_PACK_MASTER_PROFILE.widthMm).toBe(318);
    expect(ROLL_PRINT_PACK_MASTER_PROFILE.heightMm).toBe(181);
    expect(outers[1].xMm - (outers[0].xMm + outers[0].widthMm)).toBe(ROLL_PRINT_PACK_MASTER_PROFILE.horizontalGapMm);
    expect(warranties[1].xMm - (warranties[0].xMm + warranties[0].widthMm)).toBe(ROLL_PRINT_PACK_MASTER_PROFILE.horizontalGapMm);
  });

  it("renders a PDF with one page per complete Pack and exact master dimensions", async () => {
    const plan = packPlan();
    const layout = planRollPrintPackMasterLayout({
      chunk: plan.chunks[0],
      firstPackOrdinal: 1,
      totalPackCount: plan.packCount,
    });
    const bytes = await renderRollPrintPackPdf(layout);
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(plan.packCount);
    for (const page of document.getPages()) {
      expect(page.getWidth()).toBeCloseTo(ROLL_PRINT_PACK_MASTER_PROFILE.widthMm * POINTS_PER_MM, 4);
      expect(page.getHeight()).toBeCloseTo(ROLL_PRINT_PACK_MASTER_PROFILE.heightMm * POINTS_PER_MM, 4);
    }
    expect(Buffer.from(bytes).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("does not serialize the raw Public Code as readable PDF guide text", async () => {
    const plan = packPlan();
    const layout = planRollPrintPackMasterLayout({
      chunk: plan.chunks[0],
      firstPackOrdinal: 1,
      totalPackCount: plan.packCount,
    });
    const rawCode = plan.chunks[0].packs[0].warrantyCopies[0].model.qrPayload.split("/").at(-1);
    const bytes = await renderRollPrintPackPdf(layout);
    expect(Buffer.from(bytes).toString("latin1")).not.toContain(rawCode);
  });

  it("preserves global Pack ordinal across later chunks", () => {
    const plan = packPlan();
    const layout = planRollPrintPackMasterLayout({
      chunk: plan.chunks[0],
      firstPackOrdinal: 4,
      totalPackCount: 5,
    });
    expect(layout.pages.map((page) => page.packOrdinal)).toEqual([4, 5]);
    expect(layout.pages.every((page) => page.totalPackCount === 5)).toBe(true);
  });
});
