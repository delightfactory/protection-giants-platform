import bwipjs from "bwip-js/browser";

import { isValidProductBarcode } from "../products/barcode";
import { buildQrVectorGeometry, type QrVectorGeometry } from "../qr/qr-vector";

export const OUTER_ROLL_MACHINE_CODE_RENDER_SCALE = 4;

export type OuterRollProductBarcodeSymbology = "code128";

export type BwipVectorLine = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lineWidth: number;
};

export type BwipVectorPolygon = {
  points: readonly [number, number][];
};

export type BwipVectorGeometry = {
  width: number;
  height: number;
  lines: readonly BwipVectorLine[];
  polygons: readonly BwipVectorPolygon[];
};

export type OuterRollProductBarcodeVector = {
  payload: string;
  symbology: OuterRollProductBarcodeSymbology;
  geometry: BwipVectorGeometry;
};

export type OuterRollQrVector = {
  payload: string;
  geometry: QrVectorGeometry;
};

export class OuterRollMachineCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OuterRollMachineCodeError";
  }
}

type RenderOptions = Parameters<typeof bwipjs.render>[0];
type DrawingContext = Parameters<typeof bwipjs.render<BwipVectorGeometry>>[1];

function renderVector(options: RenderOptions): BwipVectorGeometry {
  let width = 0;
  let height = 0;
  const lines: BwipVectorLine[] = [];
  const polygons: BwipVectorPolygon[] = [];
  let pendingPolygons: Array<readonly [number, number][]> = [];

  const drawing: DrawingContext = {
    setopts() {},
    scale() {
      return null;
    },
    measure() {
      return { width: 0, ascent: 0, descent: 0 };
    },
    init(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
    },
    line(x0, y0, x1, y1, lineWidth) {
      lines.push({ x0, y0, x1, y1, lineWidth });
    },
    polygon(points) {
      pendingPolygons.push(points.map(([x, y]) => [x, y] as [number, number]));
    },
    hexagon(points) {
      pendingPolygons.push(points.map(([x, y]) => [x, y] as [number, number]));
    },
    ellipse() {
      throw new OuterRollMachineCodeError("Unexpected ellipse primitive in Cube E machine-code renderer.");
    },
    fill() {
      polygons.push(...pendingPolygons.map((points) => ({ points })));
      pendingPolygons = [];
    },
    text() {
      throw new OuterRollMachineCodeError("Machine-readable geometry must not rely on bwip-js text rendering.");
    },
    end() {
      if (pendingPolygons.length > 0) {
        throw new OuterRollMachineCodeError("Unflushed machine-code vector geometry was produced.");
      }
      if (!(width > 0) || !(height > 0)) {
        throw new OuterRollMachineCodeError("Machine-code renderer returned invalid dimensions.");
      }
      return { width, height, lines, polygons };
    },
  };

  return bwipjs.render<BwipVectorGeometry>(options, drawing);
}

export function buildOuterRollProductBarcodeGeometry(
  barcode: string,
  targetWidthMm = 80,
  targetHeightMm = 18,
): OuterRollProductBarcodeVector {
  if (!isValidProductBarcode(barcode)) {
    throw new OuterRollMachineCodeError("A valid V1 Product Barcode of 1-32 digits is required for the Product linear barcode.");
  }

  const symbology: OuterRollProductBarcodeSymbology = "code128";
  const geometry = renderVector({
    bcid: symbology,
    text: barcode,
    scale: OUTER_ROLL_MACHINE_CODE_RENDER_SCALE,
    width: targetWidthMm,
    height: targetHeightMm,
    includetext: false,
  });

  if (geometry.lines.length === 0 && geometry.polygons.length === 0) {
    throw new OuterRollMachineCodeError("Product Barcode produced no vector marks.");
  }

  return { payload: barcode, symbology, geometry };
}

export function buildOuterRollQrVector(qrPayload: string): OuterRollQrVector {
  let url: URL;
  try {
    url = new URL(qrPayload);
  } catch {
    throw new OuterRollMachineCodeError("Roll QR payload must be an absolute URL.");
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new OuterRollMachineCodeError("Roll QR payload must use the approved HTTPS public-site contract.");
  }

  const geometry = buildQrVectorGeometry(qrPayload);
  if (geometry.fills.length === 0) {
    throw new OuterRollMachineCodeError("Roll QR produced no vector modules.");
  }

  return { payload: qrPayload, geometry };
}

export function buildOuterRollQrGeometry(qrPayload: string): QrVectorGeometry {
  return buildOuterRollQrVector(qrPayload).geometry;
}
