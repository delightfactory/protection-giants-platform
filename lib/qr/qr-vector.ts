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

type DrawingContext = Parameters<typeof bwipjs.render<QrVectorGeometry>>[1];

function finiteCoordinate(value: number): string {
  if (!Number.isFinite(value)) throw new Error("QR renderer produced a non-finite coordinate.");
  return Number(value.toFixed(4)).toString();
}

function polygonSubpath(points: readonly [number, number][], offset: number): string {
  if (points.length < 3) throw new Error("QR renderer produced an invalid polygon.");

  const [first, ...rest] = points;
  return [
    `M ${finiteCoordinate(first[0] + offset)} ${finiteCoordinate(first[1] + offset)}`,
    ...rest.map(([x, y]) => `L ${finiteCoordinate(x + offset)} ${finiteCoordinate(y + offset)}`),
    "Z",
  ].join(" ");
}

function normalizeColor(value: unknown): string {
  const normalized = String(value ?? "000000").replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : "000000";
}

export function buildQrVectorGeometry(payload: string): QrVectorGeometry {
  const text = payload.trim();
  if (!text) throw new Error("QR payload is required.");

  const quietZone = QR_RENDER_SCALE * QR_QUIET_ZONE_MODULES;
  let width = 0;
  let height = 0;
  let symbolModules = 0;
  let pendingSubpaths: string[] = [];
  const fills: QrVectorFill[] = [];

  const drawing: DrawingContext = {
    setopts() {},
    scale() {
      return null;
    },
    measure() {
      return { width: 0, ascent: 0, descent: 0 };
    },
    init(symbolWidth, symbolHeight) {
      if (!(symbolWidth > 0) || symbolWidth !== symbolHeight) {
        throw new Error("QR renderer returned invalid symbol dimensions.");
      }

      const modules = symbolWidth / QR_RENDER_SCALE;
      if (!Number.isInteger(modules) || modules < 21 || (modules - 21) % 4 !== 0) {
        throw new Error("QR renderer returned dimensions that do not match a standard QR version.");
      }

      symbolModules = modules;
      width = symbolWidth + quietZone * 2;
      height = symbolHeight + quietZone * 2;
    },
    line() {
      throw new Error("Unexpected line primitive in QR renderer.");
    },
    polygon(points) {
      pendingSubpaths.push(polygonSubpath(points, quietZone));
    },
    hexagon(points) {
      pendingSubpaths.push(polygonSubpath(points, quietZone));
    },
    ellipse() {
      throw new Error("Unexpected ellipse primitive in QR renderer.");
    },
    fill(rgb) {
      if (pendingSubpaths.length === 0) return;
      fills.push({
        path: pendingSubpaths.join(" "),
        color: normalizeColor(rgb),
      });
      pendingSubpaths = [];
    },
    text() {
      throw new Error("QR rendering must not rely on text primitives.");
    },
    end() {
      if (pendingSubpaths.length > 0) {
        throw new Error("QR renderer returned an unflushed compound path.");
      }
      if (!(width > 0) || !(height > 0) || fills.length === 0 || symbolModules === 0) {
        throw new Error("QR renderer returned invalid vector geometry.");
      }

      return {
        width,
        height,
        symbolModules,
        moduleSize: QR_RENDER_SCALE,
        quietZoneModules: QR_QUIET_ZONE_MODULES,
        quietZone,
        fills,
      };
    },
  };

  return bwipjs.render<QrVectorGeometry>({
    bcid: "qrcode",
    text,
    scale: QR_RENDER_SCALE,
    eclevel: QR_ERROR_CORRECTION_LEVEL,
    barcolor: "000000",
  }, drawing);
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
