export const PRODUCT_BARCODE_MAX_LENGTH = 32;

export function normalizeOptionalProductBarcode(value: FormDataEntryValue | string | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function isValidProductBarcode(value: string): boolean {
  return /^\d{1,32}$/.test(value);
}
