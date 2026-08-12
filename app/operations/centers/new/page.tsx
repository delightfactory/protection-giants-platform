import Link from "next/link";
import { redirect } from "next/navigation";
import { CenterCoreFields, type CenterParentOption } from "@/components/center-core-fields";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCenter } from "./actions";

type CenterCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة وحدد تبعية تشغيلية صحيحة.",
  parent: "الطرف الأب المحدد غير متاح أو خارج نطاقك أو موقوف.",
  duplicate: "يوجد مركز تركيب آخر بنفس الكود.",
  failed: "تعذر حفظ مركز التركيب. حاول مرة أخرى.",
};

export default async function CenterCreatePage({ searchParams }: CenterCreatePageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [agentsResult, dealersResult] = await Promise.all([
    profile.role === "dealer"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("country_agents").select("id, code, name, country_code, status").eq("status", "active").order("name"),
    supabase.from("dealers").select("id, code, name, country_code, country_agent_id, status").eq("status", "active").order("name"),
  ]);

  if (agentsResult.error) throw agentsResult.error;
  if (dealersResult.error) throw dealersResult.error;

  const parentOptions: CenterParentOption[] = [];

  if (profile.role === "admin") {
    parentOptions.push({ value: "company", label: "مباشر لشركة Protection Giants", countryCode: "" });
  }

  if (profile.role === "admin" || profile.role === "agent") {
    for (const agent of agentsResult.data) {
      parentOptions.push({
        value: `agent:${agent.id}`,
        label: `مباشر لوكيل الدولة: ${agent.name} (${agent.code})`,
        countryCode: agent.country_code,
      });
    }
  }

  for (const dealer of dealersResult.data) {
    parentOptions.push({
      value: `dealer:${dealer.id}`,
      label: `تحت الموزع: ${dealer.name} (${dealer.code})`,
      countryCode: dealer.country_code,
    });
  }

  const lockedParentRef = profile.role === "dealer" ? `dealer:${profile.dealer_id}` : null;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="مراكز التركيب"
        title="إضافة مركز تركيب"
        description="سجّل المركز وحدد الطرف الإداري المسؤول عنه؛ الدولة تُشتق تلقائيًا من التبعية."
        actions={<TaskBackLink href="/operations/centers" label="العودة للمراكز" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={createCenter} className="operations-form">
          <FormSection title="بيانات مركز التركيب" description="هوية المركز وموقعه والتبعية التشغيلية المعتمدة.">
            <CenterCoreFields
              parentOptions={parentOptions}
              lockParent={profile.role === "dealer"}
              values={lockedParentRef ? { code: "", name: "", parentRef: lockedParentRef, city: "" } : undefined}
            />
          </FormSection>

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ المركز</button>
            <Link href="/operations/centers" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>
    </>
  );
}
