export const supportedGtinLengths = [8, 12, 13, 14] as const;

export function isValidGtin(value: string): boolean {
  if (!/^\d+$/.test(value) || !supportedGtinLengths.includes(value.length as (typeof supportedGtinLengths)[number])) {
    return false;
  }

  const digits = Array.from(value, Number);
  const checkDigit = digits.pop();
  if (checkDigit === undefined) return false;

  let sum = 0;
  let weight = 3;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }

  return ((10 - (sum % 10)) % 10) === checkDigit;
}

export function normalizeOptionalGtin(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
