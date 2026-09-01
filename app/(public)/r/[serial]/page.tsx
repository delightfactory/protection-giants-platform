import { notFound, redirect } from "next/navigation";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicRollResolverPageProps = {
  params: Promise<{ serial: string }>;
};

export default async function PublicRollResolverPage({ params }: PublicRollResolverPageProps) {
  const { serial: rawSerial } = await params;
  const serial = normalizeRollSerial(rawSerial);
  if (!serial) notFound();

  // Deliberately use the narrow public RPC; direct Roll-table Data API reads stay denied.
  const supabase = await createSupabaseServerClient();
  const { data: productSlug, error } = await supabase.rpc(
    "resolve_public_roll_product_slug",
    { p_serial: serial },
  );

  if (error) throw error;
  if (!productSlug) notFound();

  redirect(`/products/${encodeURIComponent(productSlug)}`);
}
