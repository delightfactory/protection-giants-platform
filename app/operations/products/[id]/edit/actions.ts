"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseProductAssetUpload, PRODUCT_ASSET_BUCKET, productAssetKinds, productAssetVisibilities } from "@/lib/products/product-assets";
import { parseProductCoreInput } from "@/lib/products/product-core-input";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function productEditPath(productId: string) {
  return `/operations/products/${productId}/edit`;
}

async function requireEditableProduct(productId: string) {
  if (!uuidPattern.test(productId)) redirect("/operations/products");

  const supabase = await createSupabaseServerClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, slug")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  if (!product) redirect("/operations/products");

  return { supabase, product };
}

function revalidateProductPaths(productId: string, slug: string) {
  revalidatePath("/operations/products");
  revalidatePath(productEditPath(productId));
  revalidatePath("/products");
  revalidatePath(`/products/${slug}`);
}

export async function updateProduct(formData: FormData) {
  await requireAdminProfile();

  const productId = String(formData.get("product_id") ?? "").trim();
  if (!uuidPattern.test(productId)) redirect("/operations/products");

  const parsed = parseProductCoreInput(formData);
  if (!parsed.ok) {
    redirect(`${productEditPath(productId)}?error=${encodeURIComponent(parsed.error)}`);
  }

  const input = parsed.value;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      code: input.code,
      name: input.name,
      slug: input.slug,
      product_type: input.productType,
      category: input.category,
      version_name: input.versionName,
      reference_price: input.referencePrice,
      currency_code: input.currencyCode,
      width_mm: input.widthMm,
      length_m: input.lengthM,
      thickness_mil: input.thicknessMil,
      weight_kg: input.weightKg,
      origin_country: input.originCountry,
      default_warranty_months: input.defaultWarrantyMonths,
      marketing_description: input.marketingDescription,
      technical_description: input.technicalDescription,
      features: input.features,
      warranty_coverage: input.warrantyCoverage,
      care_instructions: input.careInstructions,
      publication_status: input.publicationStatus,
    })
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") redirect(`${productEditPath(productId)}?error=duplicate`);
  if (error) redirect(`${productEditPath(productId)}?error=failed`);
  if (!data) redirect("/operations/products");

  revalidateProductPaths(productId, input.slug);
  redirect("/operations/products");
}

export async function uploadProductAsset(formData: FormData) {
  await requireAdminProfile();

  const productId = String(formData.get("product_id") ?? "").trim();
  const { supabase, product } = await requireEditableProduct(productId);
  const parsed = parseProductAssetUpload(formData);

  if (!parsed.ok) {
    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent(parsed.error)}#product-assets`);
  }

  const { file, extension, kind, visibility, label, sortOrder } = parsed.value;
  const storagePath = `${productId}/${randomUUID()}.${extension}`;
  const admin = createSupabaseAdminClient();

  const { error: uploadError } = await admin.storage
    .from(PRODUCT_ASSET_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent("تعذر رفع الملف إلى التخزين.")}#product-assets`);
  }

  const { error: metadataError } = await supabase.from("product_assets").insert({
    product_id: productId,
    kind,
    label,
    storage_path: storagePath,
    original_name: file.name.slice(0, 255),
    mime_type: file.type,
    size_bytes: file.size,
    visibility,
    sort_order: sortOrder,
  });

  if (metadataError) {
    await admin.storage.from(PRODUCT_ASSET_BUCKET).remove([storagePath]);
    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent("تعذر حفظ بيانات الملف، وتم التراجع عن الرفع.")}#product-assets`);
  }

  revalidateProductPaths(productId, product.slug);
  redirect(`${productEditPath(productId)}?asset_saved=1#product-assets`);
}

export async function updateProductAsset(formData: FormData) {
  await requireAdminProfile();

  const productId = String(formData.get("product_id") ?? "").trim();
  const assetId = String(formData.get("asset_id") ?? "").trim();
  const { supabase, product } = await requireEditableProduct(productId);

  if (!uuidPattern.test(assetId)) redirect(productEditPath(productId));

  const kind = String(formData.get("asset_kind") ?? "").trim();
  const visibility = String(formData.get("asset_visibility") ?? "").trim();
  const labelValue = String(formData.get("asset_label") ?? "").trim();
  const sortOrder = Number(String(formData.get("asset_sort_order") ?? "0").trim());

  if (
    !productAssetKinds.includes(kind as (typeof productAssetKinds)[number])
    || !productAssetVisibilities.includes(visibility as (typeof productAssetVisibilities)[number])
    || labelValue.length > 120
    || !Number.isInteger(sortOrder)
    || sortOrder < 0
    || sortOrder > 32767
  ) {
    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent("راجع بيانات الملف قبل الحفظ.")}#product-assets`);
  }

  const { data, error } = await supabase
    .from("product_assets")
    .update({
      kind,
      visibility,
      label: labelValue || null,
      sort_order: sortOrder,
    })
    .eq("id", assetId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent("تعذر تحديث بيانات الملف.")}#product-assets`);
  }

  revalidateProductPaths(productId, product.slug);
  redirect(`${productEditPath(productId)}?asset_saved=1#product-assets`);
}

export async function deleteProductAsset(formData: FormData) {
  await requireAdminProfile();

  const productId = String(formData.get("product_id") ?? "").trim();
  const assetId = String(formData.get("asset_id") ?? "").trim();
  const { supabase, product } = await requireEditableProduct(productId);

  if (!uuidPattern.test(assetId)) redirect(productEditPath(productId));

  const { data: asset, error: assetError } = await supabase
    .from("product_assets")
    .select("id, product_id, kind, label, storage_path, original_name, mime_type, size_bytes, visibility, sort_order, created_at")
    .eq("id", assetId)
    .eq("product_id", productId)
    .maybeSingle();

  if (assetError) throw assetError;
  if (!asset) redirect(productEditPath(productId));

  const { data: deleted, error: deleteError } = await supabase
    .from("product_assets")
    .delete()
    .eq("id", assetId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();

  if (deleteError || !deleted) {
    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent("تعذر حذف بيانات الملف.")}#product-assets`);
  }

  const admin = createSupabaseAdminClient();
  const { error: storageError } = await admin.storage.from(PRODUCT_ASSET_BUCKET).remove([asset.storage_path]);

  if (storageError) {
    const { error: restoreError } = await supabase.from("product_assets").insert(asset);
    if (restoreError) {
      throw new Error("Product asset storage deletion failed and metadata compensation also failed.", { cause: restoreError });
    }

    redirect(`${productEditPath(productId)}?asset_error=${encodeURIComponent("تعذر حذف الملف من التخزين؛ تم استرجاع سجله دون فقد بيانات.")}#product-assets`);
  }

  revalidateProductPaths(productId, product.slug);
  redirect(`${productEditPath(productId)}?asset_deleted=1#product-assets`);
}
