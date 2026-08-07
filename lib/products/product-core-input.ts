export type ProductCoreInput = {
  code: string;
  name: string;
  slug: string;
  default_warranty_months: number;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseProductCoreInput(formData: FormData): ProductCoreInput | null {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const warrantyValue = String(formData.get("default_warranty_months") ?? "").trim();
  const defaultWarrantyMonths = Number(warrantyValue);

  const isValid =
    code.length >= 2 &&
    code.length <= 40 &&
    name.length >= 2 &&
    name.length <= 120 &&
    slug.length > 0 &&
    slug === slug.toLowerCase() &&
    slugPattern.test(slug) &&
    Number.isInteger(defaultWarrantyMonths) &&
    defaultWarrantyMonths >= 1 &&
    defaultWarrantyMonths <= 240;

  if (!isValid) {
    return null;
  }

  return {
    code,
    name,
    slug,
    default_warranty_months: defaultWarrantyMonths,
  };
}
