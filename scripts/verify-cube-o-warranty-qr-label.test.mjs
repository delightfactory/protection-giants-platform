import { describe, expect, it } from "vitest";

import { buildQrVectorGeometry } from "../lib/qr/qr-vector";
import {
  WARRANTY_PUBLIC_ORIGIN,
  buildPermanentWarrantyUrl,
  buildWarrantyQrLabelModel,
  materializeWarrantyQrLabelCopies,
} from "../lib/labels/warranty-qr-label-plan";
import { WARRANTY_QR_LABEL_TEMPLATE } from "../lib/labels/warranty-qr-label-template";

const codeA = "a".repeat(64);
const codeB = "b".repeat(64);

describe("Cube O Warranty QR label contract", () => {
  it("always builds the frozen production-domain Warranty URL", () => {
    expect(buildPermanentWarrantyUrl(codeA)).toBe(`${WARRANTY_PUBLIC_ORIGIN}/w/${codeA}`);
    expect(WARRANTY_PUBLIC_ORIGIN).toBe("https://protectiongiants.com");
    expect(buildPermanentWarrantyUrl(codeA)).not.toContain("vercel.app");
    expect(buildPermanentWarrantyUrl(codeA)).not.toContain("preview.protectiongiants.com");
  });

  it("rejects malformed, semantic or shortened public identities", () => {
    for (const value of [
      "",
      "A".repeat(64),
      "a".repeat(63),
      "a".repeat(65),
      "PG-R-20260825-00000001-01-0001",
      "PG-W-00000001",
      "g".repeat(64),
    ]) {
      expect(() => buildPermanentWarrantyUrl(value)).toThrow();
    }
  });

  it("materializes exactly three identical customer-facing copies", () => {
    const model = buildWarrantyQrLabelModel({
      publicCode: codeA,
      productNameSnapshot: "PG Shield Ceramic",
    });
    const copies = materializeWarrantyQrLabelCopies(model);

    expect(copies).toHaveLength(3);
    expect(copies.map((copy) => copy.copyNumber)).toEqual([1, 2, 3]);
    expect(copies.every((copy) => copy.model.qrPayload === model.qrPayload)).toBe(true);
    expect(copies.every((copy) => copy.model.productName === "PG Shield Ceramic")).toBe(true);
    expect(new Set(copies.map((copy) => JSON.stringify(copy.model))).size).toBe(1);
  });

  it("keeps different Rolls on different permanent Warranty URLs", () => {
    expect(buildPermanentWarrantyUrl(codeA)).not.toBe(buildPermanentWarrantyUrl(codeB));
  });

  it("preserves the shared QR vector reliability contract", () => {
    const payload = buildPermanentWarrantyUrl(codeA);
    const geometry = buildQrVectorGeometry(payload);

    expect(geometry.width).toBe(geometry.height);
    expect(geometry.quietZoneModules).toBe(4);
    expect(geometry.symbolModules).toBeGreaterThanOrEqual(21);
    expect(geometry.fills.length).toBeGreaterThan(0);
    expect(WARRANTY_QR_LABEL_TEMPLATE.qrQuietBox.widthMm).toBeGreaterThanOrEqual(30);
    expect(WARRANTY_QR_LABEL_TEMPLATE.qrQuietBox.widthMm).toBe(WARRANTY_QR_LABEL_TEMPLATE.qrQuietBox.heightMm);
  });

  it("uses production-time Product identity and rejects an empty snapshot", () => {
    const model = buildWarrantyQrLabelModel({
      publicCode: codeA,
      productNameSnapshot: "  PG Shield Matte  ",
    });
    expect(model.productName).toBe("PG Shield Matte");
    expect(() => buildWarrantyQrLabelModel({ publicCode: codeA, productNameSnapshot: "  " })).toThrow();
  });

  it("renders deterministic PDF for short, long, single-token, and 120-char product names", async () => {
    const { renderWarrantyQrLabelMasterPdf } = await import("../lib/labels/warranty-qr-label-pdf");
    const { PDFDocument } = await import("pdf-lib");

    const testNames = [
      "PG Shield Ceramic",
      "PROTECTION GIANTS ADVANCED DUAL LAYER ULTRA HIGH GLOSS CLEAR COAT AUTOMOTIVE PAINT PROTECTION FILM PROFESSIONAL SERIES 1",
      "ULTRA-PROTECT-SUPER-GLOSS-FILM-SERIES-ADVANCED-CERAMIC-PLUS-COATING-EXTENDED-WARRANTY-PROFESSIONAL-EDITION-2026-X-1524MM-75MIL".slice(0, 120),
      "فيلم حماية عمالقة الحماية نانو سيراميك شفاف",
      "فيلم حماية عمالقة الحماية نانو سيراميك شفاف ذاتي المعالجة مقاوم للخدوش عالي اللمعان سماكة 8.5 ميل ضمان عشر سنوات 1524 مم",
      "فيلم حماية PPF Super Clear 1524mm Pro",
      "فيلم حماية عمالقة الحماية PPF Ultra Clear Ceramic 1524mm Pro Edition High Gloss 8.5mil Self Healing Warranty 10 Years PG-2026".slice(0, 120),
    ];

    for (const name of testNames) {
      const model = buildWarrantyQrLabelModel({
        publicCode: codeA,
        productNameSnapshot: name,
      });

      const pdfBytes1 = await renderWarrantyQrLabelMasterPdf(model);
      const pdfBytes2 = await renderWarrantyQrLabelMasterPdf(model);

      expect(Buffer.from(pdfBytes1).subarray(0, 4).toString("ascii")).toBe("%PDF");
      expect(Buffer.from(pdfBytes1)).toEqual(Buffer.from(pdfBytes2));

      const doc = await PDFDocument.load(pdfBytes1);
      expect(doc.getPageCount()).toBe(1);
      const page = doc.getPage(0);
      const POINTS_PER_MM = 72 / 25.4;
      expect(page.getWidth()).toBeCloseTo(70 * POINTS_PER_MM, 2);
      expect(page.getHeight()).toBeCloseTo(45 * POINTS_PER_MM, 2);
    }
  });

  it("strictly enforces Product contract bounds (rejects >120 chars and <2 chars)", async () => {
    const { renderWarrantyQrLabelMasterPdf, WarrantyQrLabelPdfError } = await import(
      "../lib/labels/warranty-qr-label-pdf"
    );

    const overlongName = "A".repeat(121);
    const modelOverlong = buildWarrantyQrLabelModel({
      publicCode: codeA,
      productNameSnapshot: "Valid Temporary Name",
    });
    modelOverlong.productName = overlongName;
    await expect(renderWarrantyQrLabelMasterPdf(modelOverlong)).rejects.toThrow(
      WarrantyQrLabelPdfError
    );

    const tooShortModel = buildWarrantyQrLabelModel({
      publicCode: codeA,
      productNameSnapshot: "Valid Temporary Name",
    });
    tooShortModel.productName = "A";
    await expect(renderWarrantyQrLabelMasterPdf(tooShortModel)).rejects.toThrow(
      WarrantyQrLabelPdfError
    );
  });

  it("orders mixed Arabic/Latin phrases according to Unicode Bidirectional Algorithm (UAX #9)", async () => {
    const { getVisualRuns } = await import("../lib/labels/bidi");

    // RTL paragraph with embedded English: "فيلم حماية PPF Super Clear"
    const mixedRtl = "فيلم حماية PPF Super Clear";
    const runsRtl = getVisualRuns(mixedRtl);
    expect(runsRtl).toHaveLength(2);
    // In visual coordinate order (left to right):
    // The embedded LTR run appears on the left, Arabic run appears on the right
    // Reading right-to-left recovers the logical sentence order: "فيلم حماية" then "PPF Super Clear"
    expect(runsRtl[0].text).toBe("PPF Super Clear");
    expect(runsRtl[0].level).toBe(2);
    expect(runsRtl[1].text).toBe("فيلم حماية ");
    expect(runsRtl[1].level).toBe(1);

    // LTR paragraph with embedded Arabic: "Super Clear فيلم حماية"
    const mixedLtr = "Super Clear فيلم حماية";
    const runsLtr = getVisualRuns(mixedLtr);
    expect(runsLtr).toHaveLength(2);
    expect(runsLtr[0].text).toBe("Super Clear ");
    expect(runsLtr[0].level).toBe(0);
    expect(runsLtr[1].text).toBe("فيلم حماية");
    expect(runsLtr[1].level).toBe(1);
  });
});
