import { NextResponse } from "next/server";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicRollResolverContext = {
  params: Promise<{ serial: string }>;
};

function notFoundResponse() {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request: Request, { params }: PublicRollResolverContext) {
  const { serial: rawSerial } = await params;
  const serial = normalizeRollSerial(rawSerial);
  if (!serial) return notFoundResponse();

  // Deliberately use the narrow public RPC; direct Roll-table Data API reads stay denied.
  const supabase = await createSupabaseServerClient();
  const { data: productSlug, error } = await supabase.rpc(
    "resolve_public_roll_product_slug",
    { p_serial: serial },
  );

  if (error) throw error;
  if (!productSlug) return notFoundResponse();

  const target = new URL(`/products/${encodeURIComponent(productSlug)}`, request.url);
  return NextResponse.redirect(target, 307);
}
