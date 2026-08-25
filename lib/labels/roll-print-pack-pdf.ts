import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { renderOuterRollLabelMasterPdf } from "./outer-roll-label-pdf";
import type { RollPrintPack } from "./roll-print-pack-plan";
import type { RollPrintPackMasterLayout, RollPrintPackPlacement } from "./roll-print-pack-layout";
import { renderWarrantyQrLabelMasterPdf } from "./warranty-qr-label-pdf";

const POINTS_PER_MM = 72 / 25.4;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GUIDE_FILL = rgb(0.95, 0.95, 0.95);
const GUIDE_MUTED = rgb(0.35, 0.35, 0.35);
const FIXED_METADATA_DATE = new Date("2000-01-01T00:00:00.000Z");

export class RollPrintPackPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollPrintPackPdfError";
  }
}

function mm(value: number): number {
  return value * POINTS_PER_MM;
}

function assertPackCopyConsistency(pack: RollPrintPack) {
  const [outer1, outer2] = pack.outerCopies;
  if (
    outer1.copyNumber !== 1
    || outer2.copyNumber !== 2
    || outer1.model.rollId !== pack.rollId
    || outer2.model.rollId !== pack.rollId
    || outer1.model.rollSerial !== pack.rollSerial
    || outer2.model.rollSerial !== pack.rollSerial
    || JSON.stringify(outer1.model) !== JSON.stringify(outer2.model)
  ) {
    throw new RollPrintPackPdfError("Roll Pack Outer copies are not the same exact Roll label model.");
  }

  if (
    pack.warrantyCopies.length !== 3
    || pack.warrantyCopies.some((copy, index) => copy.copyNumber !== index + 1)
    || new Set(pack.warrantyCopies.map((copy) => JSON.stringify(copy.model))).size !== 1
  ) {
    throw new RollPrintPackPdfError("Roll Pack Warranty copies are not three identical customer-facing models.");
  }
}

function placementFor(
  placements: readonly RollPrintPackPlacement[],
  kind: RollPrintPackPlacement["kind"],
  copyNumber: number,
): RollPrintPackPlacement {
  const placement = placements.find(
    (candidate) => candidate.kind === kind && candidate.copyNumber === copyNumber,
  );
  if (!placement) {
    throw new RollPrintPackPdfError(`Master Pack placement is missing ${kind} copy ${copyNumber}.`);
  }
  return placement;
}

export async function renderRollPrintPackPdf(
  layout: RollPrintPackMasterLayout,
): Promise<Uint8Array> {
  if (layout.pageCount !== layout.pages.length || layout.pageCount < 1) {
    throw new RollPrintPackPdfError("Master Pack layout page count is inconsistent.");
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Protection Giants Roll Label Packs / ${layout.profile.id}`);
  pdfDoc.setSubject("Protection Giants grouped Roll label print master");
  pdfDoc.setCreator("Protection Giants Platform");
  pdfDoc.setProducer("Protection Giants Platform / pdf-lib");
  pdfDoc.setCreationDate(FIXED_METADATA_DATE);
  pdfDoc.setModificationDate(FIXED_METADATA_DATE);

  const [regular, bold] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
  ]);

  for (const pagePlan of layout.pages) {
    const { pack } = pagePlan;
    assertPackCopyConsistency(pack);

    const outerMasterBytes = await renderOuterRollLabelMasterPdf(pack.outerCopies[0].model);
    const warrantyMasterBytes = await renderWarrantyQrLabelMasterPdf(pack.warrantyCopies[0].model);
    const [outerEmbedded] = await pdfDoc.embedPdf(outerMasterBytes);
    const [warrantyEmbedded] = await pdfDoc.embedPdf(warrantyMasterBytes);
    if (!outerEmbedded || !warrantyEmbedded) {
      throw new RollPrintPackPdfError("Could not embed the fixed label masters into the Roll Pack PDF.");
    }

    const page = pdfDoc.addPage([
      mm(layout.profile.widthMm),
      mm(layout.profile.heightMm),
    ]);

    page.drawRectangle({
      x: mm(pagePlan.header.xMm),
      y: mm(pagePlan.header.yMm),
      width: mm(pagePlan.header.widthMm),
      height: mm(pagePlan.header.heightMm),
      color: GUIDE_FILL,
      borderColor: BLACK,
      borderWidth: 0.5,
    });
    page.drawText(`ROLL PACK  ${pagePlan.packOrdinal} / ${pagePlan.totalPackCount}`, {
      x: mm(pagePlan.header.xMm + 3),
      y: mm(pagePlan.header.yMm + 7),
      size: 8,
      font: bold,
      color: BLACK,
    });
    page.drawText(pack.rollSerial, {
      x: mm(pagePlan.header.xMm + 3),
      y: mm(pagePlan.header.yMm + 2.5),
      size: 7,
      font: regular,
      color: BLACK,
    });
    page.drawText("OUTER x2  /  WARRANTY x3", {
      x: mm(pagePlan.header.xMm + pagePlan.header.widthMm - 52),
      y: mm(pagePlan.header.yMm + 4.5),
      size: 7,
      font: bold,
      color: GUIDE_MUTED,
    });

    for (const copyNumber of [1, 2] as const) {
      const placement = placementFor(pagePlan.placements, "outer", copyNumber);
      page.drawPage(outerEmbedded, {
        x: mm(placement.xMm),
        y: mm(placement.yMm),
        width: mm(placement.widthMm),
        height: mm(placement.heightMm),
      });
    }

    for (const copyNumber of [1, 2, 3] as const) {
      const placement = placementFor(pagePlan.placements, "warranty", copyNumber);
      page.drawPage(warrantyEmbedded, {
        x: mm(placement.xMm),
        y: mm(placement.yMm),
        width: mm(placement.widthMm),
        height: mm(placement.heightMm),
      });
    }

    page.drawText("MASTER PACK GUIDE - remove guide area after cutting labels", {
      x: mm(layout.profile.marginMm),
      y: mm(1.8),
      size: 4.5,
      font: regular,
      color: GUIDE_MUTED,
    });
  }

  return pdfDoc.save();
}
