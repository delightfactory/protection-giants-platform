import bwipjs from "bwip-js/browser";

export const QR_RENDER_SCALE = 4;
export const QR_QUIET_ZONE_MODULES = 4;
export const QR_ERROR_CORRECTION_LEVEL = "M" as const;

export type QrVectorFill = {
  path: string;
  color: string;
};

export type QrVectorGeometry = {
  width: number;
  height: number;
  symbolModules: number;
  moduleSize: number;
  quietZoneModules: number;
  quietZone: number;
  fills: readonly QrVectorFill[];
};

type QrRawOptions = {
  bcid: "qrcode";
  text: string;
  eclevel: typeof QR_ERROR_CORRECTION_LEVEL;
};

type QrRawMatrix = {
  pixs: number[];
  pixx: number;
  pixy: number;
  width: number;
  height: number;
};

const encodeRawQr = bwipjs.raw as unknown as (options: QrRawOptions) => QrRawMatrix[];

function finiteCoordinate(value: number): string {
  if (!Number.isFinite(value)) throw new Error("QR renderer produced a non-finite coordinate.");
  return Number(value.toFixed(4)).toString();
}

function rectangleSubpath(x: number, y: number, width: number, height: number): string {
  const x2 = x + width;
  const y2 = y + height;
  return [
    `M ${finiteCoordinate(x)} ${finiteCoordinate(y)}`,
    `L ${finiteCoordinate(x2)} ${finiteCoordinate(y)}`,
    `L ${finiteCoordinate(x2)} ${finiteCoordinate(y2)}`,
    `L ${finiteCoordinate(x)} ${finiteCoordinate(y2)}`,
    "Z",
  ].join(" ");
}

function normalizeColor(value: unknown): string {
  const normalized = String(value ?? "000000").replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : "000000";
}

function readQrMatrix(text: string): QrRawMatrix {
  const raw = encodeRawQr({
    bcid: "qrcode",
    text,
    eclevel: QR_ERROR_CORRECTION_LEVEL,
  });

  if (!Array.isArray(raw) || raw.length !== 1) {
    throw new Error("QR encoder returned an unexpected raw symbol stack.");
  }

  const matrix = raw[0];
  if (
    !matrix
    || !Number.isInteger(matrix.pixx)
    || !Number.isInteger(matrix.pixy)
    || matrix.pixx !== matrix.pixy
    || matrix.pixx < 21
    || (matrix.pixx - 21) % 4 !== 0
    || matrix.pixs.length !== matrix.pixx * matrix.pixy
    || matrix.pixs.some((value) => value !== 0 && value !== 1)
  ) {
    throw new Error("QR encoder returned an invalid module matrix.");
  }

  return matrix;
}

export function buildQrVectorGeometry(payload: string): QrVectorGeometry {
  const text = payload.trim();
  if (!text) throw new Error("QR payload is required.");

  const matrix = readQrMatrix(text);
  const moduleSize = QR_RENDER_SCALE;
  const quietZone = moduleSize * QR_QUIET_ZONE_MODULES;
  const totalModules = matrix.pixx + QR_QUIET_ZONE_MODULES * 2;
  const subpaths: string[] = [];

  for (let row = 0; row < matrix.pixy; row += 1) {
    let column = 0;
    while (column < matrix.pixx) {
      const index = row * matrix.pixx + column;
      if (matrix.pixs[index] !== 1) {
        column += 1;
        continue;
      }

      const start = column;
      while (
        column < matrix.pixx
        && matrix.pixs[row * matrix.pixx + column] === 1
      ) {
        column += 1;
      }

      subpaths.push(rectangleSubpath(
        quietZone + start * moduleSize,
        quietZone + row * moduleSize,
        (column - start) * moduleSize,
        moduleSize,
      ));
    }
  }

  if (subpaths.length === 0) {
    throw new Error("QR encoder returned a module matrix with no dark modules.");
  }

  return {
    width: totalModules * moduleSize,
    height: totalModules * moduleSize,
    symbolModules: matrix.pixx,
    moduleSize,
    quietZoneModules: QR_QUIET_ZONE_MODULES,
    quietZone,
    fills: [{
      path: subpaths.join(" "),
      color: "000000",
    }],
  };
}

export function qrVectorGeometryToSvg(geometry: QrVectorGeometry): string {
  if (!(geometry.width > 0) || !(geometry.height > 0) || geometry.fills.length === 0) {
    throw new Error("A valid QR vector geometry is required.");
  }

  const paths = geometry.fills
    .map((fill) => `<path d="${fill.path}" fill="#${normalizeColor(fill.color)}" fill-rule="nonzero"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geometry.width} ${geometry.height}" shape-rendering="crispEdges"><rect width="${geometry.width}" height="${geometry.height}" fill="#fff"/>${paths}</svg>`;
}
