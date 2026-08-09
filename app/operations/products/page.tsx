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

type OperationsProductsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function OperationsProductsPage({ searchParams }: OperationsProductsPageProps) {
  await requireAdminProfile();
  const { error: pageError } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, code, name, slug, default_warranty_months, status")
    .order("name", { ascending: true });

  if (error) throw error;

  return (
    <>
      <PageHeader
        eyebrow="البيانات المرجعية"
        title="المنتجات"
        description="إدارة الهوية التشغيلية للمنتج ومدة الضمان وحالة الإتاحة."
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
          description="أنشئ أول منتج تشغيلي ليصبح متاحًا لبقية دورة الإنتاج والضمان لاحقًا."
          action={<Link href="/operations/products/new" className="button button-primary">إضافة منتج</Link>}
        />
      ) : (
        <RecordList label="قائمة المنتجات">
          {products.map((product) => {
            const isArchived = product.status === "archived";
            return (
              <RecordItem
                key={product.id}
                kicker={<span dir="ltr">{product.code}</span>}
                title={product.name}
                subtitle={<span dir="ltr">/{product.slug}</span>}
                facts={[{ label: "الضمان الافتراضي", value: `${product.default_warranty_months} شهر` }]}
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
