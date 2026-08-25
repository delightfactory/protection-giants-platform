import { redirect } from "next/navigation";
import { WarrantyActivationFlow } from "@/components/warranties/warranty-activation-flow";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getPublicSiteOrigin } from "@/lib/public-site";
import { normalizeRollSerial } from "@/lib/rolls/roll-qr";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type WarrantyActivationPageProps = {
  searchParams: Promise<{ roll?: string }>;
};

export default async function WarrantyActivationPage({ searchParams }: WarrantyActivationPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "center") redirect("/access-denied");

  const supabase = await createSupabaseServerClient();
  const { data: center, error } = await supabase
    .from("installation_centers")
    .select("name")
    .eq("id", profile.installation_center_id)
    .maybeSingle();

  if (error) throw error;
  if (!center) redirect("/access-denied");

  const params = await searchParams;
  const initialSerial = normalizeRollSerial(params.roll ?? "") ?? "";

  return (
    <>
      <PageHeader
        eyebrow="عمليات المركز"
        title="تفعيل ضمان عميل"
        description="حدد الرول المفتوح الذي تم التركيب منه، ثم أدخل بيانات العميل والسيارة. يعيد النظام فحص العهدة والفتح والبلاغات وسياسة المنتج لحظة التأكيد النهائي."
        meta={`المركز: ${center.name}`}
        actions={<TaskBackLink href="/operations/warranties" label="العودة إلى الضمانات" />}
      />
      <WarrantyActivationFlow
        publicSiteOrigin={getPublicSiteOrigin()}
        centerName={center.name}
        initialSerial={initialSerial}
      />
    </>
  );
}
