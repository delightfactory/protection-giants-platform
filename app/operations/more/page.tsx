import { ModuleCard } from "@/components/ui/module-card";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getMoreDestinations } from "@/lib/navigation/operations-navigation";

export default async function MoreOperationsPage() {
  const profile = await requireOperationalProfile();
  const destinations = getMoreDestinations(profile.role);

  return (
    <>
      <PageHeader
        eyebrow="بوابة التشغيل"
        title="العمليات"
        description="الوظائف الأقل تكرارًا أو المرجعية المتاحة لدورك. أبقينا شريط الهاتف للأعمال الأساسية فقط بدل ضغط كل الوحدات في مساحة صغيرة."
        actions={<TaskBackLink href="/operations" label="العودة للرئيسية" />}
      />

      <section className="ui-module-grid" aria-label="العمليات والوظائف المرجعية">
        {destinations.map((destination) => (
          <ModuleCard
            key={destination.id}
            href={destination.href}
            title={destination.title}
            description={destination.description}
            icon={destination.icon}
          />
        ))}
      </section>
    </>
  );
}
