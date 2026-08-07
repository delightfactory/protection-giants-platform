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

  const input = parseProductCoreInput(formData);

  if (!input) {
    redirect(`/operations/products/${productId}/edit?error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update(input)
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
  redirect("/operations/products");
}
