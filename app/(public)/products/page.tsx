import { PageIntro } from "@/components/page-intro";

export default function ProductsPage() {
  return (
    <>
      <PageIntro
        eyebrow="المنتجات"
        title="أفلام حماية الطلاء"
        description="سيتم عرض المنتجات المعتمدة للجمهور هنا بعد اكتمال طبقة المحتوى والنشر العام، مع بيانات الضمان والمواصفات المناسبة للعميل."
      />
      <div className="container placeholder-panel">
        <strong>عرض المنتجات للجمهور قيد التجهيز.</strong>
        <p>المنتجات التشغيلية تُدار داخل المنصة بالفعل، لكننا لن ننشر محتوى عامًا قبل اكتمال مسار النشر المخصص له.</p>
      </div>
    </>
  );
}
