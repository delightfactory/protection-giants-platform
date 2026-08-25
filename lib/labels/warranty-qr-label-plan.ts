import { WARRANTY_QR_LABEL_TEMPLATE_ID } from "./warranty-qr-label-template";

export const WARRANTY_PUBLIC_ORIGIN = "https://protectiongiants.com" as const;
export const WARRANTY_QR_LABEL_COPIES_PER_ROLL = 3 as const;

const publicCodePattern = /^[0-9a-f]{64}$/;

export type WarrantyQrLabelViewModel = {
  templateId: typeof WARRANTY_QR_LABEL_TEMPLATE_ID;
  productName: string;
  qrPayload: string;
};

export type WarrantyQrLabelCopy = {
  copyNumber: 1 | 2 | 3;
  model: WarrantyQrLabelViewModel;
};

export class WarrantyQrLabelPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarrantyQrLabelPlanError";
  }
}

export function buildPermanentWarrantyUrl(publicCode: string): string {
  const normalized = publicCode.trim();
  if (!publicCodePattern.test(normalized)) {
    throw new WarrantyQrLabelPlanError("Warranty Public Code does not match the permanent Cube N identity contract.");
  }
  return `${WARRANTY_PUBLIC_ORIGIN}/w/${normalized}`;
}

export function buildWarrantyQrLabelModel(input: {
  publicCode: string;
  productNameSnapshot: string;
}): WarrantyQrLabelViewModel {
  const productName = input.productNameSnapshot.trim();
  if (!productName) {
    throw new WarrantyQrLabelPlanError("Warranty QR label requires the Production-time Product name snapshot.");
  }

  return {
    templateId: WARRANTY_QR_LABEL_TEMPLATE_ID,
    productName,
    qrPayload: buildPermanentWarrantyUrl(input.publicCode),
  };
}

export function materializeWarrantyQrLabelCopies(
  model: WarrantyQrLabelViewModel,
): readonly [WarrantyQrLabelCopy, WarrantyQrLabelCopy, WarrantyQrLabelCopy] {
  return [
    { copyNumber: 1, model: { ...model } },
    { copyNumber: 2, model: { ...model } },
    { copyNumber: 3, model: { ...model } },
  ];
}
