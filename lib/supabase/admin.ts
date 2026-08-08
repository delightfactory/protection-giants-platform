import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const { url, secretKey } = getSupabaseAdminEnv();

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
