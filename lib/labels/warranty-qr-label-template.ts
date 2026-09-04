export const WARRANTY_QR_LABEL_TEMPLATE_ID = "warranty-qr-label-v1" as const;

// Software proof geometry only. Final physical dimensions are frozen after the
// real printer/media/cutter workflow is confirmed and physically validated.
export const WARRANTY_QR_LABEL_TEMPLATE = {
  id: WARRANTY_QR_LABEL_TEMPLATE_ID,
  widthMm: 70,
  heightMm: 45,
  safeInsetMm: 3,
  cornerRadiusMm: 2,
  brand: {
    xMm: 4,
    yMm: 37,
    widthMm: 30,
  },
  title: {
    xMm: 4,
    yMm: 26.5,
    widthMm: 30,
  },
  instruction: {
    xMm: 4,
    yMm: 19.5,
    widthMm: 30,
  },
  productName: {
    xMm: 4,
    yMm: 9.5,
    widthMm: 31,
  },
  qrQuietBox: {
    xMm: 36,
    yMm: 7.5,
    widthMm: 30,
    heightMm: 30,
  },
  qrCaption: {
    xMm: 36.5,
    yMm: 3.5,
    widthMm: 29,
  },
} as const;
