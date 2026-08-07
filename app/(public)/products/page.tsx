import { PageIntro } from "@/components/page-intro";

export default function ProductsPage() {
  return (
    <>
      <PageIntro eyebrow="المنتجات" title="أفلام حماية الطلاء" description="ستعرض هذه الصفحة المنتجات المنشورة ومواصفاتها وملفاتها بعد اكتمال مكعب إدارة المنتجات." />
      <div className="container placeholder-panel">
        <strong>مكعب المنتجات لم يبدأ بعد.</strong>
        <p>تم تثبيت المسار والواجهة فقط، بدون بيانات تجريبية أو وظائف مؤقتة.</p>
      </div>
    </>
  );
}
