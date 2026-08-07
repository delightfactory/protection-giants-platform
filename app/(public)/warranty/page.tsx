import { PageIntro } from "@/components/page-intro";

export default function WarrantyPage() {
  return (
    <>
      <PageIntro eyebrow="الضمان" title="تحقق من ضمانك" description="سيتم ربط هذه الصفحة برمز الضمان الآمن بعد اكتمال مكعب الرولات ثم مكعب تفعيل الضمان." />
      <div className="container placeholder-panel">
        <strong>التحقق من الضمان غير مفعّل في مكعب الأساس.</strong>
        <p>لن نضيف نموذجًا شكليًا قبل وجود منطق ضمان حقيقي وآمن خلفه.</p>
      </div>
    </>
  );
}
