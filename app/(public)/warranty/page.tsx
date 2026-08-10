import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

export default function WarrantyPage() {
  return (
    <>
      <PageIntro
        eyebrow="الضمان"
        title="تحقق من ضمانك"
        description="سيتم ربط هذه الصفحة برمز الضمان الآمن بعد اكتمال دورة الرول وتفعيل ضمان العميل."
      />
      <div className="container section">
        <EmptyState
          eyebrow="التحقق العام"
          title="التحقق من الضمان لم يُفعّل للعامة بعد"
          description="لن يظهر نموذج تحقق شكلي قبل وجود مسار ضمان حقيقي وآمن يمكن الاعتماد عليه."
        />
      </div>
    </>
  );
}
