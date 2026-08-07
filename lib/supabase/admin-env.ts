import "server-only";

export type SupabaseAdminEnv = Readonly<{
  url: string;
  secretKey: string;
}>;

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!url) {
    throw new Error("Supabase Admin is not configured. Set NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!secretKey) {
    throw new Error(
      "Supabase Admin is not configured. Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY for a legacy/local environment.",
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  return { url, secretKey };
}
