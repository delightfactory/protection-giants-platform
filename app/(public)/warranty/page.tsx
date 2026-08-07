import { PageIntro } from "@/components/page-intro";

export default function WarrantyPage() {
  return (
    <>
      <PageIntro
        eyebrow="الضمان"
        title="تحقق من ضمانك"
        description="سيتم ربط هذه الصفحة برمز الضمان الآمن بعد اكتمال دورة الرول وتفعيل ضمان العميل."
      />
      <div className="container placeholder-panel">
        <strong>التحقق من الضمان لم يُفعّل للعامة بعد.</strong>
        <p>لن يظهر نموذج تحقق شكلي قبل وجود مسار ضمان حقيقي وآمن يمكن الاعتماد عليه.</p>
      </div>
    </>
  );
}
