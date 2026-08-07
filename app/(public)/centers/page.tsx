import { PageIntro } from "@/components/page-intro";

export default function CentersPage() {
  return (
    <>
      <PageIntro
        eyebrow="الشبكة المعتمدة"
        title="مراكز التركيب المعتمدة"
        description="ستعرض هذه الصفحة المراكز التي تعتمدها الإدارة فقط، مع المعلومات العامة المناسبة للعميل بعد اكتمال طبقة النشر العام للمراكز."
      />
      <div className="container placeholder-panel">
        <strong>دليل المراكز العام قيد التجهيز.</strong>
        <p>بيانات مراكز التركيب تُدار تشغيليًا داخل المنصة، ولن تظهر للعامة قبل تحديد واعتماد البيانات المسموح بنشرها.</p>
      </div>
    </>
  );
}
