import { isValidProductBarcode, normalizeOptionalProductBarcode } from "@/lib/products/barcode";

export type ProductCoreInput = {
  code: string;
  gtin: string | null;
  name: string;
  slug: string;
  productType: "PPF";
  category: string | null;
  versionName: string | null;
  referencePrice: number | null;
  currencyCode: string | null;
  widthMm: number;
  lengthM: number;
  thicknessMil: number;
  weightKg: number;
  originCountry: string;
  defaultWarrantyMonths: number;
  marketingDescription: string | null;
  technicalDescription: string | null;
  features: string[];
  warrantyCoverage: string;
  careInstructions: string;
  publicationStatus: "draft" | "published";
};

export type ProductCoreInputResult =
  | { ok: true; value: ProductCoreInput }
  | { ok: false; error: string };

function optionalText(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function requiredPositiveNumber(value: FormDataEntryValue | null): number | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFeatureLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((feature) => feature.trim())
    .filter(Boolean);
}

export function parseProductCoreInput(formData: FormData): ProductCoreInputResult {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const gtin = normalizeOptionalProductBarcode(formData.get("gtin"));
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const productType = String(formData.get("product_type") ?? "PPF").trim().toUpperCase();
  const category = optionalText(formData.get("category"));
  const versionName = optionalText(formData.get("version_name"));
  const widthMm = requiredPositiveNumber(formData.get("width_mm"));
  const lengthM = requiredPositiveNumber(formData.get("length_m"));
  const thicknessMil = requiredPositiveNumber(formData.get("thickness_mil"));
  const weightKg = requiredPositiveNumber(formData.get("weight_kg"));
  const originCountry = String(formData.get("origin_country") ?? "").trim();
  const warrantyValue = Number(formData.get("default_warranty_months"));
  const marketingDescription = optionalText(formData.get("marketing_description"));
  const technicalDescription = optionalText(formData.get("technical_description"));
  const warrantyCoverage = String(formData.get("warranty_coverage") ?? "").trim();
  const careInstructions = String(formData.get("care_instructions") ?? "").trim();
  const features = parseFeatureLines(formData.get("features"));
  const publicationStatusValue = String(formData.get("publication_status") ?? "draft").trim();

  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code) || code.length < 2 || code.length > 40) {
    return { ok: false, error: "كود المنتج يجب أن يكون من 2 إلى 40 حرفًا ويحتوي على حروف إنجليزية أو أرقام أو . _ - فقط." };
  }

  if (gtin && !isValidProductBarcode(gtin)) {
    return { ok: false, error: "الباركود يجب أن يتكون من أرقام فقط وبحد أقصى 32 رقمًا." };
  }

  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: "اسم المنتج يجب أن يكون من 2 إلى 120 حرفًا." };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, error: "رابط المنتج يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط." };
  }

  if (productType !== "PPF") {
    return { ok: false, error: "الإصدار الحالي يدعم منتجات PPF فقط." };
  }

  if (category && (category.length < 2 || category.length > 80)) {
    return { ok: false, error: "التصنيف يجب أن يكون من 2 إلى 80 حرفًا عند إدخاله." };
  }

  if (versionName && versionName.length > 80) {
    return { ok: false, error: "الإصدار أو الموديل يجب ألا يتجاوز 80 حرفًا." };
  }

  if (widthMm === null || lengthM === null || thicknessMil === null || weightKg === null) {
    return { ok: false, error: "العرض والطول والسمك والوزن يجب أن تكون أرقامًا موجبة." };
  }

  if (originCountry.length < 2 || originCountry.length > 80) {
    return { ok: false, error: "بلد المنشأ يجب أن يكون من 2 إلى 80 حرفًا." };
  }

  if (!Number.isInteger(warrantyValue) || warrantyValue < 1 || warrantyValue > 240) {
    return { ok: false, error: "مدة الضمان يجب أن تكون عددًا صحيحًا من 1 إلى 240 شهرًا." };
  }

  if (warrantyCoverage.length < 2 || warrantyCoverage.length > 12000) {
    return { ok: false, error: "اكتب نطاق تغطية ضمان واضحًا ولا يتجاوز 12000 حرف." };
  }

  if (careInstructions.length < 2 || careInstructions.length > 12000) {
    return { ok: false, error: "اكتب تعليمات عناية واضحة ولا تتجاوز 12000 حرف." };
  }

  if (marketingDescription && marketingDescription.length > 5000) {
    return { ok: false, error: "الوصف التسويقي يجب ألا يتجاوز 5000 حرف." };
  }

  if (technicalDescription && technicalDescription.length > 10000) {
    return { ok: false, error: "الوصف الفني يجب ألا يتجاوز 10000 حرف." };
  }

  if (features.length > 30 || features.some((feature) => feature.length > 240)) {
    return { ok: false, error: "المميزات بحد أقصى 30 بندًا، وكل بند بحد أقصى 240 حرفًا." };
  }

  if (publicationStatusValue !== "draft" && publicationStatusValue !== "published") {
    return { ok: false, error: "حالة النشر غير صالحة." };
  }

  if (publicationStatusValue === "published" && (!marketingDescription || marketingDescription.length < 2)) {
    return { ok: false, error: "أضف وصفًا تسويقيًا قبل نشر المنتج للعامة." };
  }

  const referencePriceText = String(formData.get("reference_price") ?? "").trim();
  const currencyCodeText = String(formData.get("currency_code") ?? "").trim().toUpperCase();
  let referencePrice: number | null = null;
  let currencyCode: string | null = null;

  if (referencePriceText || currencyCodeText) {
    const parsedPrice = Number(referencePriceText);
    if (!referencePriceText || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return { ok: false, error: "السعر المرجعي يجب أن يكون رقمًا غير سالب عند إدخال العملة." };
    }

    if (!/^[A-Z]{3}$/.test(currencyCodeText)) {
      return { ok: false, error: "كود العملة يجب أن يتكون من 3 حروف إنجليزية مثل EGP أو USD." };
    }

    referencePrice = parsedPrice;
    currencyCode = currencyCodeText;
  }

  return {
    ok: true,
    value: {
      code,
      gtin,
      name,
      slug,
      productType: "PPF",
      category,
      versionName,
      referencePrice,
      currencyCode,
      widthMm,
      lengthM,
      thicknessMil,
      weightKg,
      originCountry,
      defaultWarrantyMonths: warrantyValue,
      marketingDescription,
      technicalDescription,
      features,
      warrantyCoverage,
      careInstructions,
      publicationStatus: publicationStatusValue,
    },
  };
}
