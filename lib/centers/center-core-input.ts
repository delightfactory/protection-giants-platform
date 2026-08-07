export type CenterCoreInput = {
  code: string;
  name: string;
  dealer_id: string | null;
  country_code: string;
  city: string;
};

const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
const countryCodePattern = /^[A-Z]{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCenterCoreInput(formData: FormData): CenterCoreInput | null {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const dealerValue = String(formData.get("dealer_id") ?? "").trim();
  const countryCode = String(formData.get("country_code") ?? "").trim().toUpperCase();
  const city = String(formData.get("city") ?? "").trim();
  const dealerId = dealerValue.length === 0 ? null : dealerValue;

  const isValid =
    codePattern.test(code) &&
    name.length >= 2 &&
    name.length <= 160 &&
    (dealerId === null || uuidPattern.test(dealerId)) &&
    countryCodePattern.test(countryCode) &&
    city.length >= 2 &&
    city.length <= 120;

  if (!isValid) {
    return null;
  }

  return {
    code,
    name,
    dealer_id: dealerId,
    country_code: countryCode,
    city,
  };
}
