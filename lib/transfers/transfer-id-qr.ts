import { buildQrVectorGeometry, type QrVectorGeometry } from "../qr/qr-vector";
import { normalizeTransferId } from "./transfer-id";

export type TransferQrGeometry = QrVectorGeometry;

export function buildTransferIdQrGeometry(transferCode: string): TransferQrGeometry {
  const normalized = normalizeTransferId(transferCode);
  if (!normalized) throw new Error("A valid Transfer ID is required for QR rendering.");

  return buildQrVectorGeometry(normalized);
}
