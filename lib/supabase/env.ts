export type SupabasePublicEnv = Readonly<{
  url: string;
  publishableKey: string;
}>;

export type SupabaseAdminEnv = Readonly<{
  url: string;
  secretKey: string;
}>;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (!url) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL.");
  }

  try {
    new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  return url;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const url = getSupabaseUrl();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, publishableKey };
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  const url = getSupabaseUrl();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secretKey) {
    throw new Error(
      "Supabase Auth Admin is not configured. Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY for local/legacy environments.",
    );
  }

  return { url, secretKey };
}
