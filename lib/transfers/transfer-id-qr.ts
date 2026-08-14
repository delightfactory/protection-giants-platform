import bwipjs from "bwip-js/browser";
import { normalizeTransferId } from "./transfer-id";

export type TransferQrPolygon = {
  points: readonly [number, number][];
};

export type TransferQrGeometry = {
  width: number;
  height: number;
  polygons: readonly TransferQrPolygon[];
};

type DrawingContext = Parameters<typeof bwipjs.render<TransferQrGeometry>>[1];

export function buildTransferIdQrGeometry(transferCode: string): TransferQrGeometry {
  const normalized = normalizeTransferId(transferCode);
  if (!normalized) throw new Error("A valid Transfer ID is required for QR rendering.");

  let width = 0;
  let height = 0;
  const polygons: TransferQrPolygon[] = [];
  let pendingPolygons: Array<readonly [number, number][]> = [];

  const drawing: DrawingContext = {
    setopts() {},
    scale() { return null; },
    measure() { return { width: 0, ascent: 0, descent: 0 }; },
    init(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
    },
    line() {
      throw new Error("Unexpected line primitive in Transfer ID QR renderer.");
    },
    polygon(points) {
      pendingPolygons.push(points.map(([x, y]) => [x, y] as [number, number]));
    },
    hexagon(points) {
      pendingPolygons.push(points.map(([x, y]) => [x, y] as [number, number]));
    },
    ellipse() {
      throw new Error("Unexpected ellipse primitive in Transfer ID QR renderer.");
    },
    fill() {
      polygons.push(...pendingPolygons.map((points) => ({ points })));
      pendingPolygons = [];
    },
    text() {
      throw new Error("Transfer ID QR must not rely on text rendering.");
    },
    end() {
      if (pendingPolygons.length > 0 || width <= 0 || height <= 0 || polygons.length === 0) {
        throw new Error("Transfer ID QR renderer returned invalid geometry.");
      }
      return { width, height, polygons };
    },
  };

  return bwipjs.render<TransferQrGeometry>({
    bcid: "qrcode",
    text: normalized,
    scale: 4,
    paddingwidth: 0,
    paddingheight: 0,
  }, drawing);
}
