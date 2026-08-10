"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseProductCoreInput } from "@/lib/products/product-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createProduct(formData: FormData) {
  await requireAdminProfile();

  const parsed = parseProductCoreInput(formData);

  if (!parsed.ok) {
    redirect(`/operations/products/new?error=${encodeURIComponent(parsed.error)}`);
  }

  const input = parsed.value;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").insert({
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
  });

  if (error?.code === "23505") {
    redirect("/operations/products/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/products/new?error=failed");
  }

  revalidatePath("/operations/products");
  revalidatePath("/products");
  redirect("/operations/products");
}
