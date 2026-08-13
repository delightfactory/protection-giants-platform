export type DealerCoreInput = {
  code: string;
  name: string;
};

const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function parseDealerCoreInput(formData: FormData): DealerCoreInput | null {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();

  const isValid =
    codePattern.test(code) &&
    name.length >= 2 &&
    name.length <= 160;

  if (!isValid) {
    return null;
  }

  return { code, name };
}
