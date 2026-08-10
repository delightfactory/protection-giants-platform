"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseProductCoreInput } from "@/lib/products/product-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updateProduct(formData: FormData) {
  await requireAdminProfile();

  const productId = String(formData.get("product_id") ?? "").trim();

  if (!uuidPattern.test(productId)) {
    redirect("/operations/products");
  }

  const parsed = parseProductCoreInput(formData);

  if (!parsed.ok) {
    redirect(`/operations/products/${productId}/edit?error=${encodeURIComponent(parsed.error)}`);
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

  if (error?.code === "23505") {
    redirect(`/operations/products/${productId}/edit?error=duplicate`);
  }

  if (error) {
    redirect(`/operations/products/${productId}/edit?error=failed`);
  }

  if (!data) {
    redirect("/operations/products");
  }

  revalidatePath("/operations/products");
  revalidatePath(`/operations/products/${productId}/edit`);
  revalidatePath("/products");
  revalidatePath(`/products/${input.slug}`);
  redirect("/operations/products");
}
