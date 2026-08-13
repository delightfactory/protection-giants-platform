import { CenterDirectoryBrowser, type PublicCenterDirectoryItem } from "@/components/center-directory-browser";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";
import "../../center-directory.css";

export const dynamic = "force-dynamic";

export default async function CentersPage() {
  const centers: PublicCenterDirectoryItem[] = [];
  const approvedCount = centers.filter((center) => center.classification === "approved").length;
  const registeredCount = centers.length - approvedCount;

  return (
    <>
      <PageIntro
        eyebrow="شبكة Protection Giants"
        title="مراكز التركيب"
        description="اكتشف مراكز التركيب النشطة والمسجلة داخل الشبكة، وتعرّف بوضوح على المراكز التي تحمل اعتماد Protection Giants حاليًا."
      />
      <section className="section">
        <div className="container center-directory-shell">
          {centers.length === 0 ? (
            <EmptyState
              eyebrow="مراكز التركيب"
              title="لا توجد مراكز منشورة حاليًا"
              description="تظهر هنا المراكز النشطة بعد تسجيل موقعها الجغرافي."
            />
          ) : (
            <>
              <div className="center-directory-summary" aria-label="ملخص مراكز الشبكة">
                <div className="center-directory-summary-item"><strong>{centers.length}</strong><span>مركز ظاهر للعامة</span></div>
                <div className="center-directory-summary-item"><strong>{approvedCount}</strong><span>مركز معتمد</span></div>
                <div className="center-directory-summary-item"><strong>{registeredCount}</strong><span>مركز مسجل</span></div>
              </div>
              <CenterDirectoryBrowser centers={centers} />
              <aside className="center-directory-legend">
                <strong>ما الفرق؟</strong> المركز «المسجل» مركز نشط ومحدد الموقع داخل المنصة. المركز «المعتمد» يحمل بالإضافة إلى ذلك اعتماد Protection Giants الحالي. حالة الاعتماد تعريف ثقة داخل الشبكة وليست شرطًا لعمليات الضمان.
              </aside>
            </>
          )}
        </div>
      </section>
    </>
  );
}
