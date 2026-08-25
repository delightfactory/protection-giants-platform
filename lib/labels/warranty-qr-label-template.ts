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
    yMm: 26,
    widthMm: 28,
  },
  instruction: {
    xMm: 4,
    yMm: 18,
    widthMm: 28,
  },
  productName: {
    xMm: 4,
    yMm: 9,
    widthMm: 28,
  },
  qrQuietBox: {
    xMm: 36,
    yMm: 7.5,
    widthMm: 30,
    heightMm: 30,
  },
  qrCaption: {
    xMm: 37,
    yMm: 3.5,
    widthMm: 28,
  },
} as const;
