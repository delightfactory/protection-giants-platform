"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const productStatuses = ["active", "archived"] as const;

type ProductStatus = (typeof productStatuses)[number];

function isProductStatus(value: string): value is ProductStatus {
  return productStatuses.some((status) => status === value);
}

export async function setProductStatus(formData: FormData) {
  await requireAdminProfile();

  const productId = String(formData.get("product_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!uuidPattern.test(productId) || !isProductStatus(status)) {
    redirect("/operations/products");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status })
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/operations/products?error=lifecycle");
  }

  revalidatePath("/operations/products");
  redirect("/operations/products");
}
