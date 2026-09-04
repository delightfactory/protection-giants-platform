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
      "PROTECTION GIANTS ULTIMATE PLUS CERAMIC PPF 1524MM",
      "SUPERLONGPRODUCTTOKENWITHOUTANYSPACESATALL1234567890",
      "PROTECTION GIANTS ADVANCED DUAL LAYER ULTRA HIGH GLOSS CLEAR COAT AUTOMOTIVE PAINT PROTECTION FILM PROFESSIONAL SERIES 1524MM",
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
});
