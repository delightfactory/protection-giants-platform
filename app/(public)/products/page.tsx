import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProductsPage() {
  return (
    <>
      <PageIntro
        eyebrow="المنتجات"
        title="أفلام حماية الطلاء"
        description="سيتم عرض المنتجات المعتمدة للجمهور هنا بعد اكتمال طبقة المحتوى والنشر العام، مع بيانات الضمان والمواصفات المناسبة للعميل."
      />
      <div className="container public-state-wrap">
        <EmptyState
          eyebrow="النشر العام"
          title="عرض المنتجات للجمهور قيد التجهيز"
          description="المنتجات التشغيلية تُدار داخل المنصة بالفعل، لكن لن ننشر محتوى عامًا قبل اكتمال مسار النشر المخصص له."
        />
      </div>
    </>
  );
}
