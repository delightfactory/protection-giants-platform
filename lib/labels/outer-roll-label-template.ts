import { OUTER_ROLL_LABEL_HEIGHT_MM, OUTER_ROLL_LABEL_WIDTH_MM } from "./outer-roll-print-layout";

export const OUTER_ROLL_LABEL_TEMPLATE = {
  id: "outer-roll-label-v1",
  widthMm: OUTER_ROLL_LABEL_WIDTH_MM,
  heightMm: OUTER_ROLL_LABEL_HEIGHT_MM,
  safeInsetMm: 5,
  headerDividerYMm: 76,
  footerDividerYMm: 27,
  brandLabel: {
    xMm: 7,
    yMm: 92,
    widthMm: 96,
  },
  productName: {
    xMm: 7,
    yMm: 82,
    widthMm: 96,
  },
  sideLabel: {
    xMm: 108,
    yMm: 92,
    widthMm: 35,
  },
  productVersion: {
    xMm: 108,
    yMm: 83,
    widthMm: 35,
  },
  fields: {
    sku: { xMm: 7, yMm: 64, widthMm: 52 },
    size: { xMm: 62, yMm: 64, widthMm: 39 },
    thickness: { xMm: 7, yMm: 51, widthMm: 32 },
    lot: { xMm: 42, yMm: 51, widthMm: 59 },
    roll: { xMm: 7, yMm: 37, widthMm: 94 },
  },
  barcodeBox: {
    xMm: 7,
    yMm: 5,
    widthMm: 88,
    heightMm: 18,
  },
  gtinLabel: {
    xMm: 7,
    yMm: 24,
    widthMm: 88,
  },
  qrQuietBox: {
    xMm: 108,
    yMm: 34,
    widthMm: 35,
    heightMm: 35,
  },
  qrLabel: {
    xMm: 108,
    yMm: 71,
    widthMm: 35,
  },
  scanLabel: {
    xMm: 114,
    yMm: 29.5,
    widthMm: 29,
  },
  qrInsetMm: 3,
} as const;
