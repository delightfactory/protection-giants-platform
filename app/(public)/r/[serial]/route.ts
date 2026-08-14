import { NextResponse } from "next/server";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

  const admin = createSupabaseAdminClient();
  const { data: roll, error: rollError } = await admin
    .from("rolls")
    .select("product_id, production_order_id")
    .eq("serial_number", serial)
    .maybeSingle();

  if (rollError) throw rollError;
  if (!roll) return notFoundResponse();

  const [{ data: productionOrder, error: orderError }, { data: product, error: productError }] = await Promise.all([
    admin
      .from("production_orders")
      .select("status")
      .eq("id", roll.production_order_id)
      .maybeSingle(),
    admin
      .from("products")
      .select("slug, status, publication_status")
      .eq("id", roll.product_id)
      .maybeSingle(),
  ]);

  if (orderError) throw orderError;
  if (productError) throw productError;

  if (
    !productionOrder
    || productionOrder.status !== "generated"
    || !product
    || product.status !== "active"
    || product.publication_status !== "published"
  ) {
    return notFoundResponse();
  }

  const target = new URL(`/products/${encodeURIComponent(product.slug)}`, request.url);
  return NextResponse.redirect(target, 307);
}
