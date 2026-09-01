"use server";

import { redirect } from "next/navigation";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseOperationalUserPassword } from "@/lib/users/operational-user-input";

export async function changeOwnPassword(formData: FormData) {
  await requireOperationalProfile();

  const password = parseOperationalUserPassword(formData, "new_password");
  const confirmation = parseOperationalUserPassword(formData, "confirm_password");

  if (!password || !confirmation) {
    redirect("/operations/account?error=password");
  }

  if (password !== confirmation) {
    redirect("/operations/account?error=mismatch");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/operations/account?error=auth");
  }

  redirect("/operations/account?success=password");
}
