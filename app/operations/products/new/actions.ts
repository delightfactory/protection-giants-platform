"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createProduct(formData: FormData) {
  await requireAdminProfile();

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
    redirect("/operations/products/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").insert({
    code,
    name,
    slug,
    default_warranty_months: defaultWarrantyMonths,
  });

  if (error?.code === "23505") {
    redirect("/operations/products/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/products/new?error=failed");
  }

  revalidatePath("/operations/products");
  redirect("/operations/products");
}
