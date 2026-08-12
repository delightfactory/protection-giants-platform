export type AgentCoreInput = {
  code: string;
  name: string;
  country_code: string;
};

const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
const countryCodePattern = /^[A-Z]{2}$/;

export function parseAgentCoreInput(formData: FormData): AgentCoreInput | null {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const countryCode = String(formData.get("country_code") ?? "").trim().toUpperCase();

  const isValid =
    codePattern.test(code) &&
    name.length >= 2 &&
    name.length <= 160 &&
    countryCodePattern.test(countryCode);

  if (!isValid) {
    return null;
  }

  return {
    code,
    name,
    country_code: countryCode,
  };
}
