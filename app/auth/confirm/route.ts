import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const redirectTo = request.nextUrl.clone();

  redirectTo.pathname = "/onboarding/center";
  redirectTo.search = "";

  if (!tokenHash || type !== "invite") {
    redirectTo.searchParams.set("error", "invite-link");
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    redirectTo.searchParams.set("error", "invite-link");
  }

  return NextResponse.redirect(redirectTo);
}
