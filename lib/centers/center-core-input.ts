export type CenterCoreInput = {
  code: string;
  name: string;
  city: string;
};

const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function parseCenterCoreInput(formData: FormData): CenterCoreInput | null {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  const isValid =
    codePattern.test(code) &&
    name.length >= 2 &&
    name.length <= 160 &&
    city.length >= 2 &&
    city.length <= 120;

  if (!isValid) return null;

  return { code, name, city };
}
