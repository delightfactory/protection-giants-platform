import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCoreFields } from "@/components/product-core-fields";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { PRODUCT_ASSET_BUCKET } from "@/lib/products/product-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteProductAsset, updateProduct, updateProductAsset, uploadProductAsset } from "./actions";

type ProductEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; asset_error?: string; asset_saved?: string; asset_deleted?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  duplicate: "يوجد منتج آخر بنفس الـSKU أو رابط المنتج.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
};

const assetKindLabels: Record<string, string> = {
  image: "صورة",
  datasheet: "Data Sheet",
  catalogue: "كتالوج",
  document: "مستند",
};

export default async function ProductEditPage({ params, searchParams }: ProductEditPageProps) {
  await requireAdminProfile();
  const { id } = await params;
  const { error, asset_error: assetErrorMessage, asset_saved: assetSaved, asset_deleted: assetDeleted } = await searchParams;

  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: product, error: productError }, { data: assets, error: assetsError }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, code, name, slug, product_type, category, version_name, reference_price, currency_code, width_mm, length_m, thickness_mil, weight_kg, origin_country, default_warranty_months, marketing_description, technical_description, features, warranty_coverage, care_instructions, publication_status",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("product_assets")
      .select("id, kind, label, storage_path, original_name, mime_type, size_bytes, visibility, sort_order")
      .eq("product_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (productError) throw productError;
  if (assetsError) throw assetsError;
  if (!product) notFound();

  const admin = createSupabaseAdminClient();
  const assetsWithUrls = await Promise.all(
    (assets ?? []).map(async (asset) => {
      const { data } = await admin.storage.from(PRODUCT_ASSET_BUCKET).createSignedUrl(asset.storage_path, 900);
      return { ...asset, signedUrl: data?.signedUrl ?? null };
    }),
  );

  const errorMessage = error ? errorMessages[error] ?? error : undefined;

  return (
    <>
      <PageHeader
        eyebrow="المنتجات"
        title={product.name}
        description="تعديل تعريف المنتج ومواصفاته ومحتواه وسياسة الضمان وإدارة أصوله دون خلط ذلك بسجلات الإنتاج."
        actions={<TaskBackLink href="/operations/products" label="العودة للمنتجات" />}
      />

      <FormPanel>
        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
        <form action={updateProduct} className="operations-form">
          <input type="hidden" name="product_id" value={product.id} />
          <ProductCoreFields
            values={{
              code: product.code,
              name: product.name,
              slug: product.slug,
              productType: product.product_type,
              category: product.category,
              versionName: product.version_name,
              referencePrice: product.reference_price,
              currencyCode: product.currency_code,
              widthMm: product.width_mm,
              lengthM: product.length_m,
              thicknessMil: product.thickness_mil,
              weightKg: product.weight_kg,
              originCountry: product.origin_country,
              defaultWarrantyMonths: product.default_warranty_months,
              marketingDescription: product.marketing_description,
              technicalDescription: product.technical_description,
              features: product.features,
              warrantyCoverage: product.warranty_coverage,
              careInstructions: product.care_instructions,
              publicationStatus: product.publication_status,
            }}
          />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">حفظ التعديلات</button>
            <Link href="/operations/products" className="button button-ghost">إلغاء</Link>
          </div>
        </form>
      </FormPanel>

      <section id="product-assets">
        <FormPanel>
          <FormSection title="ملفات وصور المنتج" description="تُحفظ الملفات في Storage خاص. الملفات العامة فقط تُستخدم في صفحة المنتج عبر روابط موقعة قصيرة العمر.">
            {assetErrorMessage ? <FeedbackBanner tone="error">{assetErrorMessage}</FeedbackBanner> : null}
            {assetSaved === "1" ? <FeedbackBanner tone="success">تم حفظ ملف المنتج.</FeedbackBanner> : null}
            {assetDeleted === "1" ? <FeedbackBanner tone="success">تم حذف ملف المنتج.</FeedbackBanner> : null}

            <form action={uploadProductAsset} className="operations-form">
              <input type="hidden" name="product_id" value={product.id} />
              <FormGrid>
                <FormField label="الملف" hint="JPG / PNG / WEBP / AVIF للصور أو PDF للمستندات. الحد الأقصى 20MB." full>
                  <input name="asset_file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" required />
                </FormField>
                <FormField label="نوع الأصل">
                  <select name="asset_kind" defaultValue="image" required>
                    <option value="image">صورة</option>
                    <option value="datasheet">Data Sheet</option>
                    <option value="catalogue">كتالوج</option>
                    <option value="document">مستند</option>
                  </select>
                </FormField>
                <FormField label="الظهور">
                  <select name="asset_visibility" defaultValue="internal" required>
                    <option value="internal">داخلي</option>
                    <option value="public">عام</option>
                  </select>
                </FormField>
                <FormField label="اسم العرض" optional>
                  <input name="asset_label" type="text" maxLength={120} />
                </FormField>
                <FormField label="الترتيب">
                  <input name="asset_sort_order" type="number" min={0} max={32767} step={1} defaultValue={0} required />
                </FormField>
              </FormGrid>
              <div className="operations-form-actions">
                <button type="submit" className="button button-primary">رفع الملف</button>
              </div>
            </form>
          </FormSection>

          {assetsWithUrls.map((asset) => (
            <FormSection
              key={asset.id}
              title={asset.label || asset.original_name}
              description={`${assetKindLabels[asset.kind] ?? asset.kind} · ${asset.visibility === "public" ? "عام" : "داخلي"} · ${(asset.size_bytes / 1024 / 1024).toFixed(2)} MB`}
            >
              <form action={updateProductAsset} className="operations-form">
                <input type="hidden" name="product_id" value={product.id} />
                <input type="hidden" name="asset_id" value={asset.id} />
                <FormGrid>
                  <FormField label="نوع الأصل">
                    <select name="asset_kind" defaultValue={asset.kind} required>
                      <option value="image">صورة</option>
                      <option value="datasheet">Data Sheet</option>
                      <option value="catalogue">كتالوج</option>
                      <option value="document">مستند</option>
                    </select>
                  </FormField>
                  <FormField label="الظهور">
                    <select name="asset_visibility" defaultValue={asset.visibility} required>
                      <option value="internal">داخلي</option>
                      <option value="public">عام</option>
                    </select>
                  </FormField>
                  <FormField label="اسم العرض" optional>
                    <input name="asset_label" type="text" maxLength={120} defaultValue={asset.label ?? ""} />
                  </FormField>
                  <FormField label="الترتيب">
                    <input name="asset_sort_order" type="number" min={0} max={32767} step={1} defaultValue={asset.sort_order} required />
                  </FormField>
                </FormGrid>
                <div className="operations-form-actions">
                  <button type="submit" className="button button-primary">حفظ بيانات الملف</button>
                  {asset.signedUrl ? <a href={asset.signedUrl} target="_blank" rel="noreferrer" className="button button-ghost">فتح الملف</a> : null}
                </div>
              </form>

              <form action={deleteProductAsset} className="operations-form is-inline">
                <input type="hidden" name="product_id" value={product.id} />
                <input type="hidden" name="asset_id" value={asset.id} />
                <ConfirmSubmitButton
                  title="حذف الملف؟"
                  description="سيُحذف سجل الملف والأصل المخزن. هذا الإجراء مخصص فقط للملفات التي لم تعد مطلوبة."
                  confirmLabel="تأكيد الحذف"
                >
                  حذف الملف
                </ConfirmSubmitButton>
              </form>
            </FormSection>
          ))}
        </FormPanel>
      </section>
    </>
  );
}
