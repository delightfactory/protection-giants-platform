"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { parseProductCoreInput } from "@/lib/products/product-core-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createProduct(formData: FormData) {
  await requireAdminProfile();

  const input = parseProductCoreInput(formData);

  if (!input) {
    redirect("/operations/products/new?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").insert(input);

  if (error?.code === "23505") {
    redirect("/operations/products/new?error=duplicate");
  }

  if (error) {
    redirect("/operations/products/new?error=failed");
  }

  revalidatePath("/operations/products");
  redirect("/operations/products");
}
