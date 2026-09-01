const ARABIC_PERSIAN_DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
const ASCII_DIGITS = "01234567890123456789";

export const INTERNATIONAL_PHONE_GUIDANCE_AR =
  "أدخل رقم العميل بصيغته الدولية متضمنًا كود الدولة، مثل: +20 10 1234 5678. لا تستخدم الرقم المحلي بدون كود الدولة.";

/**
 * INTL-01 display/input normalization only.
 *
 * The database remains authoritative. This helper deliberately mirrors the
 * frozen contract without inferring a country code from a local number.
 */
export function normalizeInternationalPhone(value: string): string | null {
  let normalized = value.trim();

  normalized = normalized.replace(/[٠-٩۰-۹]/g, (digit) => {
    const index = ARABIC_PERSIAN_DIGITS.indexOf(digit);
    return index >= 0 ? ASCII_DIGITS[index] : digit;
  });

  normalized = normalized.replace(/[\s()-]/g, "");

  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  }

  return /^\+[1-9][0-9]{4,14}$/.test(normalized) ? normalized : null;
}
