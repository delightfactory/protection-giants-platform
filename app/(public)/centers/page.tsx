import { PageIntro } from "@/components/page-intro";

export default function CentersPage() {
  return (
    <>
      <PageIntro eyebrow="الشبكة المعتمدة" title="مراكز التركيب المعتمدة" description="ستعرض هذه الصفحة المراكز التي تعتمدها الإدارة فقط، مع بيانات الموقع والتواصل عند اكتمال مكعب المراكز." />
      <div className="container placeholder-panel">
        <strong>مكعب المراكز لم يبدأ بعد.</strong>
        <p>لا يتم عرض مراكز وهمية أو بيانات تجريبية باعتبارها حقيقية.</p>
      </div>
    </>
  );
}
