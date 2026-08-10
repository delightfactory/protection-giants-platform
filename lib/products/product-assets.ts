export const PRODUCT_ASSET_BUCKET = "product-assets";
export const PRODUCT_ASSET_MAX_BYTES = 20 * 1024 * 1024;

export const productAssetKinds = ["image", "datasheet", "catalogue", "document"] as const;
export const productAssetVisibilities = ["internal", "public"] as const;

export type ProductAssetKind = (typeof productAssetKinds)[number];
export type ProductAssetVisibility = (typeof productAssetVisibilities)[number];

const allowedMimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

export type ProductAssetUploadInput = {
  kind: ProductAssetKind;
  visibility: ProductAssetVisibility;
  label: string | null;
  sortOrder: number;
  file: File;
  extension: string;
};

export type ProductAssetUploadResult =
  | { ok: true; value: ProductAssetUploadInput }
  | { ok: false; error: string };

export function parseProductAssetUpload(formData: FormData): ProductAssetUploadResult {
  const kind = String(formData.get("asset_kind") ?? "").trim() as ProductAssetKind;
  const visibility = String(formData.get("asset_visibility") ?? "internal").trim() as ProductAssetVisibility;
  const labelValue = String(formData.get("asset_label") ?? "").trim();
  const label = labelValue || null;
  const sortOrderValue = Number(String(formData.get("asset_sort_order") ?? "0").trim());
  const file = formData.get("asset_file");

  if (!productAssetKinds.includes(kind)) {
    return { ok: false, error: "نوع الملف غير صالح." };
  }

  if (!productAssetVisibilities.includes(visibility)) {
    return { ok: false, error: "درجة ظهور الملف غير صالحة." };
  }

  if (label && label.length > 120) {
    return { ok: false, error: "اسم العرض يجب ألا يتجاوز 120 حرفًا." };
  }

  if (!Number.isInteger(sortOrderValue) || sortOrderValue < 0 || sortOrderValue > 32767) {
    return { ok: false, error: "ترتيب الملف يجب أن يكون عددًا صحيحًا بين 0 و32767." };
  }

  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: "اختر ملفًا صالحًا للرفع." };
  }

  if (file.size > PRODUCT_ASSET_MAX_BYTES) {
    return { ok: false, error: "حجم الملف يتجاوز الحد الأقصى 20MB." };
  }

  const extension = allowedMimeExtensions[file.type];
  if (!extension) {
    return { ok: false, error: "الملفات المسموحة: JPG وPNG وWEBP وAVIF وPDF فقط." };
  }

  if (kind === "image" && !file.type.startsWith("image/")) {
    return { ok: false, error: "نوع الأصل صورة، لذلك يجب اختيار ملف صورة." };
  }

  if (kind !== "image" && file.type !== "application/pdf") {
    return { ok: false, error: "الداتا شيت والكتالوج والمستندات تُرفع بصيغة PDF في الإصدار الحالي." };
  }

  return {
    ok: true,
    value: {
      kind,
      visibility,
      label,
      sortOrder: sortOrderValue,
      file,
      extension,
    },
  };
}
