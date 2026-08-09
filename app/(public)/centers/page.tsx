import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

export default function CentersPage() {
  return (
    <>
      <PageIntro
        eyebrow="الشبكة المعتمدة"
        title="مراكز التركيب المعتمدة"
        description="ستعرض هذه الصفحة المراكز التي تعتمدها الإدارة فقط، مع المعلومات العامة المناسبة للعميل بعد اكتمال طبقة النشر العام للمراكز."
      />
      <div className="container public-state-wrap">
        <EmptyState
          eyebrow="النشر العام"
          title="دليل المراكز العام قيد التجهيز"
          description="بيانات مراكز التركيب تُدار تشغيليًا داخل المنصة، ولن تظهر للعامة قبل تحديد واعتماد البيانات المسموح بنشرها."
        />
      </div>
    </>
  );
}
