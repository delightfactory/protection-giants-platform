import { normalizePublicSiteOrigin } from "@/lib/rolls/roll-qr";

export function getPublicSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    throw new Error("Public site URL is not configured. Set NEXT_PUBLIC_SITE_URL.");
  }

  const origin = normalizePublicSiteOrigin(configured);
  if (!origin) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid HTTPS origin (HTTP is accepted only for localhost development).");
  }

  return origin;
}
