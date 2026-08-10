import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setProductStatus } from "./actions";

const statusLabels: Record<string, string> = {
  active: "نشط",
  archived: "مؤرشف",
};

const publicationLabels: Record<string, string> = {
  draft: "مسودة",
  published: "منشور",
};

type OperationsProductsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsProductsPage({ searchParams }: OperationsProductsPageProps) {
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, code, name, slug, product_type, version_name, width_mm, length_m, thickness_mil, default_warranty_months, publication_status, status")
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    <>
      <PageHeader
        eyebrow="البيانات المرجعية"
        title="المنتجات"
        description="إدارة تعريف المنتج ومواصفاته الاسمية وسياسة الضمان وحالتي التشغيل والنشر."
        meta={`${products.length} منتج مسجل`}
        actions={<Link href="/operations/products/new" className="button button-primary">إضافة منتج</Link>}
      />

      {pageError === "lifecycle" ? (
        <FeedbackBanner tone="error">تعذر تغيير حالة المنتج. حاول مرة أخرى.</FeedbackBanner>
      ) : null}

      {products.length === 0 ? (
        <EmptyState
          eyebrow="المنتجات"
          title="لا توجد منتجات مسجلة بعد"
          description="أنشئ أول تعريف منتج مكتمل ليصبح أساسًا لدورة الإنتاج والطباعة والضمان."
          action={<Link href="/operations/products/new" className="button button-primary">إضافة منتج</Link>}
        />
      ) : (
        <RecordList label="قائمة المنتجات">
          {products.map((product) => {
            const isArchived = product.status === "archived";
            const dimensions = product.width_mm && product.length_m
              ? `${product.width_mm} mm × ${product.length_m} m`
              : "غير مكتملة";

            return (
              <RecordItem
                key={product.id}
                kicker={<span dir="ltr">{product.code}</span>}
                title={product.name}
                subtitle={[
                  product.product_type,
                  product.version_name,
                  `/${product.slug}`,
                ].filter(Boolean).join(" · ")}
                facts={[
                  { label: "المقاس الاسمي", value: dimensions },
                  { label: "السمك", value: product.thickness_mil ? `${product.thickness_mil} mil` : "غير مكتمل" },
                  { label: "الضمان", value: `${product.default_warranty_months} شهر` },
                  { label: "النشر", value: publicationLabels[product.publication_status] ?? product.publication_status },
                ]}
                status={
                  <StatusBadge tone={isArchived ? "neutral" : "success"}>
                    {statusLabels[product.status] ?? product.status}
                  </StatusBadge>
                }
                actions={
                  <>
                    <Link href={`/operations/products/${product.id}/edit`} className="button button-ghost">تعديل</Link>
                    <form action={setProductStatus}>
                      <input type="hidden" name="product_id" value={product.id} />
                      <input type="hidden" name="status" value={isArchived ? "active" : "archived"} />
                      {isArchived ? (
                        <button type="submit" className="button button-primary">إعادة تفعيل</button>
                      ) : (
                        <ConfirmSubmitButton
                          title="أرشفة المنتج؟"
                          description="سيظل المنتج محفوظًا داخل النظام، لكنه لن يكون متاحًا للاستخدام التشغيلي الجديد حتى إعادة تفعيله."
                          confirmLabel="تأكيد الأرشفة"
                        >
                          أرشفة
                        </ConfirmSubmitButton>
                      )}
                    </form>
                  </>
                }
              />
            );
          })}
        </RecordList>
      )}
    </>
  );
}
