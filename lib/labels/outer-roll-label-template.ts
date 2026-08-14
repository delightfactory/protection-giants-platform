import { OUTER_ROLL_LABEL_HEIGHT_MM, OUTER_ROLL_LABEL_WIDTH_MM } from "./outer-roll-print-layout";

export const OUTER_ROLL_LABEL_TEMPLATE = {
  id: "outer-roll-label-v1",
  widthMm: OUTER_ROLL_LABEL_WIDTH_MM,
  heightMm: OUTER_ROLL_LABEL_HEIGHT_MM,
  safeInsetMm: 5,
  headerDividerYMm: 76,
  footerDividerYMm: 27,
  barcodeBox: {
    xMm: 7,
    yMm: 5,
    widthMm: 88,
    heightMm: 18,
  },
  qrQuietBox: {
    xMm: 108,
    yMm: 9,
    widthMm: 35,
    heightMm: 35,
  },
  qrInsetMm: 3,
} as const;
