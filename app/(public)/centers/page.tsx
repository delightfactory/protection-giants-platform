import { CenterDirectoryBrowser, type PublicCenterDirectoryItem } from "@/components/center-directory-browser";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";
import { createPublicCenterDirectoryClient } from "@/lib/supabase/public-center-directory";
import "../../center-directory.css";

export const dynamic = "force-dynamic";

function normalizeDirectoryRow(row: {
  center_name: string | null;
  city: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  classification: string | null;
}): PublicCenterDirectoryItem {
  if (
    !row.center_name
    || !row.city
    || !row.country_code
    || row.latitude === null
    || row.longitude === null
    || !Number.isFinite(row.latitude)
    || !Number.isFinite(row.longitude)
    || (row.classification !== "registered" && row.classification !== "approved")
  ) {
    throw new Error("Public Center Directory returned an unexpected row shape.");
  }

  return {
    center_name: row.center_name,
    city: row.city,
    country_code: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    classification: row.classification,
  };
}

async function loadPublicCenters(): Promise<PublicCenterDirectoryItem[]> {
  const supabase = createPublicCenterDirectoryClient();
  const { data, error } = await supabase
    .from("public_center_directory")
    .select("center_name, city, country_code, latitude, longitude, classification")
    .order("center_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeDirectoryRow);
}

export default async function CentersPage() {
  const centers = await loadPublicCenters();
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
