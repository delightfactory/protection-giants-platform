import bwipjs from "bwip-js";

export const OUTER_ROLL_MACHINE_CODE_RENDER_SCALE = 4;

export type OuterRollGtinSymbology = "ean8" | "upca" | "ean13" | "itf14";

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

export type OuterRollGtinBarcodeVector = {
  payload: string;
  symbology: OuterRollGtinSymbology;
  geometry: BwipVectorGeometry;
};

export type OuterRollQrVector = {
  payload: string;
  geometry: BwipVectorGeometry;
};

export class OuterRollMachineCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OuterRollMachineCodeError";
  }
}

function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return false;

  const digits = Array.from(value, Number);
  const checkDigit = digits.pop();
  if (checkDigit === undefined) return false;

  let sum = 0;
  let weight = 3;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }

  return ((10 - (sum % 10)) % 10) === checkDigit;
}

export function selectOuterRollGtinSymbology(gtin: string): OuterRollGtinSymbology {
  if (!isValidGtin(gtin)) {
    throw new OuterRollMachineCodeError("A valid GTIN-8/12/13/14 is required for the Product linear barcode.");
  }

  switch (gtin.length) {
    case 8:
      return "ean8";
    case 12:
      return "upca";
    case 13:
      return "ean13";
    case 14:
      return "itf14";
    default:
      throw new OuterRollMachineCodeError("Unsupported GTIN length for outer Roll barcode.");
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

export function buildOuterRollGtinBarcodeGeometry(
  gtin: string,
  targetWidthMm = 80,
  targetHeightMm = 18,
): OuterRollGtinBarcodeVector {
  const symbology = selectOuterRollGtinSymbology(gtin);
  const geometry = renderVector({
    bcid: symbology,
    text: gtin,
    scale: OUTER_ROLL_MACHINE_CODE_RENDER_SCALE,
    width: targetWidthMm,
    height: targetHeightMm,
    includetext: false,
  });

  if (geometry.lines.length === 0 && geometry.polygons.length === 0) {
    throw new OuterRollMachineCodeError("Product GTIN barcode produced no vector marks.");
  }

  return { payload: gtin, symbology, geometry };
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

  const geometry = renderVector({
    bcid: "qrcode",
    text: qrPayload,
    scale: OUTER_ROLL_MACHINE_CODE_RENDER_SCALE,
    paddingwidth: 0,
    paddingheight: 0,
  });

  if (geometry.polygons.length === 0) {
    throw new OuterRollMachineCodeError("Roll QR produced no vector modules.");
  }

  return { payload: qrPayload, geometry };
}

export function buildOuterRollQrGeometry(qrPayload: string): BwipVectorGeometry {
  return buildOuterRollQrVector(qrPayload).geometry;
}
