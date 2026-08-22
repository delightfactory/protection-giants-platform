import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import {
  rollPreinstallIssueCategoryLabel,
  rollPreinstallIssueStatusLabel,
  rollPreinstallIssueStatusTone,
} from "@/lib/rolls/preinstall-issue-presenters";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;
const MAX_PAGE = 100000;

type IssuesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function issuesHref(page: number) {
  return page > 1 ? `/operations/rolls/issues?page=${page}` : "/operations/rolls/issues";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function RollPreinstallIssuesPage({ searchParams }: IssuesPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "center") redirect("/access-denied");

  const page = parsePage((await searchParams).page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_roll_preinstall_issues", {
    p_limit: PAGE_SIZE + 1,
    p_offset: offset,
  });
  if (error) throw error;

  const hasNext = data.length > PAGE_SIZE;
  const issues = hasNext ? data.slice(0, PAGE_SIZE) : data;
  const hasPrevious = page > 1;
  const isAdmin = profile.role === "admin";

  return (
    <>
      <PageHeader
        eyebrow={isAdmin ? "مراجعة الجودة" : "بلاغات المركز"}
        title={isAdmin ? "بلاغات ما قبل التركيب" : "بلاغاتي قبل التركيب"}
        description={isAdmin
          ? "البلاغات قيد المراجعة تظهر أولًا. قرار الشركة هنا جودة وتشغيل فقط ولا ينقل عهدة الرول تلقائيًا."
          : "تابع البلاغات التي أرسلها مركزك وقرار الشركة عليها. يمكنك قراءة البلاغ حتى لو انتقلت حيازة الرول لاحقًا."}
        meta={`صفحة ${page.toLocaleString("en-US")} · ${issues.length.toLocaleString("en-US")} بلاغ${hasNext ? " · يوجد المزيد" : ""}`}
        actions={(
          <>
            {profile.role === "center" ? (
              <Link href="/operations/rolls/issues/new" className="button button-primary">بلاغ جديد</Link>
            ) : null}
            <Link href="/operations/rolls" className="button button-ghost">العودة إلى اللفات</Link>
          </>
        )}
      />

      {issues.length === 0 ? (
        <EmptyState
          eyebrow="بلاغات ما قبل التركيب"
          title={hasPrevious ? "لا توجد بلاغات في هذه الصفحة" : isAdmin ? "لا توجد بلاغات للمراجعة أو الأرشيف" : "لم يرسل المركز أي بلاغ بعد"}
          description={hasPrevious
            ? "ارجع إلى الصفحة السابقة."
            : isAdmin
              ? "ستظهر البلاغات هنا فور إرسال مركز لبلاغ صالح."
              : "إذا ظهر عيب بعد فتح رول وقبل التركيب، أنشئ البلاغ من الرول الموجود فعليًا في عهدة المركز."}
          action={hasPrevious
            ? <Link href={issuesHref(page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : profile.role === "center"
              ? <Link href="/operations/rolls/issues/new" className="button button-primary">إنشاء أول بلاغ</Link>
              : undefined}
        />
      ) : (
        <>
          <RecordList label={isAdmin ? "قائمة بلاغات ما قبل التركيب" : "بلاغات المركز"}>
            {issues.map((issue) => (
              <RecordItem
                key={issue.issue_id}
                kicker={<span dir="ltr">{issue.product_code}</span>}
                title={<span dir="ltr">{issue.serial_number}</span>}
                subtitle={isAdmin ? `${issue.product_name} · ${issue.center_name}` : issue.product_name}
                facts={[
                  { label: "التصنيف", value: rollPreinstallIssueCategoryLabel(issue.category), dir: "rtl" as const },
                  { label: "Lot", value: issue.lot_number, dir: "ltr" as const },
                  { label: "وقت البلاغ", value: formatDate(issue.created_at), dir: "ltr" as const },
                  { label: "الصور", value: issue.evidence_count.toLocaleString("en-US"), dir: "ltr" as const },
                  ...(issue.resolved_at
                    ? [{ label: "وقت القرار", value: formatDate(issue.resolved_at), dir: "ltr" as const }]
                    : []),
                ]}
                status={<StatusBadge tone={rollPreinstallIssueStatusTone(issue.status)}>{rollPreinstallIssueStatusLabel(issue.status)}</StatusBadge>}
                actions={<Link href={`/operations/rolls/issues/${issue.issue_id}`} className="button button-ghost">فتح البلاغ</Link>}
              />
            ))}
          </RecordList>

          {(hasPrevious || hasNext) ? (
            <nav className="production-pagination" aria-label="صفحات بلاغات ما قبل التركيب">
              {hasPrevious ? <Link href={issuesHref(page - 1)} className="button button-ghost">السابق</Link> : <span />}
              <span>صفحة {page.toLocaleString("en-US")}</span>
              {hasNext ? <Link href={issuesHref(page + 1)} className="button button-ghost">التالي</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
