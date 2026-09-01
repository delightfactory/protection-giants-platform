import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getHomeDestinations } from "@/lib/navigation/operations-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OperationsPage() {
  const profile = await requireOperationalProfile();
  const modules = getHomeDestinations(profile.role);

  let centerApprovalStatus: string | null = null;
  if (profile.role === "center") {
    const supabase = await createSupabaseServerClient();
    const { data: center, error } = await supabase
      .from("installation_centers")
      .select("approval_status")
      .eq("id", profile.installation_center_id)
      .maybeSingle();

    if (error) throw error;
    centerApprovalStatus = center?.approval_status ?? null;
  }

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title={<>مرحبًا، <span className="ui-heading-accent">{profile.display_name}</span></>}
        description={profile.role === "admin"
          ? "الأعمال الإدارية والتشغيلية المتاحة حاليًا في المنصة، مرتبة من نفس خريطة الوصول المستخدمة في التنقل."
          : "الأعمال التشغيلية المتاحة لدورك ونطاقك الحالي، من نفس خريطة الوصول المستخدمة في التنقل."}
      />

      {profile.role === "center" && centerApprovalStatus === "approved" ? (
        <FeedbackBanner tone="success">
          مركزك معتمد ضمن شبكة Protection Giants. الاعتماد تصنيف ثقة للشبكة، وليس شرطًا لاستلام اللفات أو فتحها أو تفعيل الضمان.
        </FeedbackBanner>
      ) : null}
      {profile.role === "center" && centerApprovalStatus !== "approved" ? (
        <FeedbackBanner tone="info">
          مركزك مسجل داخل المنصة لكنه غير معتمد ضمن الشبكة حاليًا. عدم الاعتماد لا يمنع تلقائيًا استلام اللفات أو فتحها أو تفعيل الضمان؛ لكل عملية شروطها المستقلة.
        </FeedbackBanner>
      ) : null}

      <section className="ui-module-grid" aria-label="الأعمال التشغيلية المتاحة">
        {modules.map((module) => (
          <ModuleCard
            key={module.id}
            href={module.href}
            title={module.title}
            description={module.description}
            icon={module.icon}
          />
        ))}
      </section>
    </>
  );
}
