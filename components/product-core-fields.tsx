import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormSection } from "@/components/ui/form-layout";

type ProductCoreFieldValues = {
  code: string;
  gtin: string | null;
  name: string;
  slug: string;
  productType: string;
  category: string | null;
  versionName: string | null;
  referencePrice: number | null;
  currencyCode: string | null;
  widthMm: number | null;
  lengthM: number | null;
  thicknessMil: number | null;
  weightKg: number | null;
  originCountry: string | null;
  defaultWarrantyMonths: number;
  marketingDescription: string | null;
  technicalDescription: string | null;
  features: string[];
  warrantyCoverage: string | null;
  careInstructions: string | null;
  publicationStatus: string;
};

type ProductCoreFieldsProps = {
  values?: ProductCoreFieldValues;
};

export function ProductCoreFields({ values }: ProductCoreFieldsProps) {
  return (
    <>
      <FormSection title="هوية المنتج" description="الهوية التشغيلية الثابتة التي ستُستخدم في الإنتاج والطباعة والضمان.">
        <FormGrid>
          <FormField label="SKU / كود المنتج" hint="يُحفظ بحروف إنجليزية كبيرة، وهو الكود التشغيلي الرسمي للمنتج.">
            <input
              name="code"
              type="text"
              minLength={2}
              maxLength={40}
              autoCapitalize="characters"
              spellCheck={false}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              defaultValue={values?.code}
              required
            />
          </FormField>

          <FormField label="الباركود" hint="اختياري. أدخل باركود المنتج كما هو؛ لا يشترط أن يكون GTIN/GS1 في الإصدار الأول." optional>
            <input
              name="gtin"
              type="text"
              inputMode="numeric"
              maxLength={32}
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              defaultValue={values?.gtin ?? ""}
              placeholder="1234567890"
            />
          </FormField>

          <FormField label="اسم المنتج">
            <input name="name" type="text" minLength={2} maxLength={120} defaultValue={values?.name} required />
          </FormField>

          <FormField label="نوع المنتج" hint="الإصدار الحالي يدعم أفلام PPF فقط؛ أي عائلة مختلفة ستُضاف عند تنفيذ منطقها الخاص.">
            <select name="product_type" defaultValue={values?.productType ?? "PPF"} required>
              <option value="PPF">PPF</option>
            </select>
          </FormField>

          <FormField label="التصنيف" optional>
            <input name="category" type="text" minLength={2} maxLength={80} defaultValue={values?.category ?? ""} />
          </FormField>

          <FormField label="الإصدار / الموديل" optional>
            <input name="version_name" type="text" maxLength={80} defaultValue={values?.versionName ?? ""} />
          </FormField>

          <FormField label="رابط المنتج" hint="حروف إنجليزية صغيرة وأرقام وشرطات فقط. سيُستخدم في صفحة المنتج العامة والـQR التعريفي.">
            <input
              name="slug"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="protection-film-x"
              dir="ltr"
              defaultValue={values?.slug}
              required
            />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="المواصفات الاسمية" description="مواصفات تعريف المنتج نفسه وليست قياسات Lot أو Roll فعلية.">
        <FormGrid>
          <FormField label="العرض (mm)">
            <input name="width_mm" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={values?.widthMm ?? ""} required />
          </FormField>
          <FormField label="الطول (m)">
            <input name="length_m" type="number" inputMode="decimal" min="0.01" step="0.01" defaultValue={values?.lengthM ?? ""} required />
          </FormField>
          <FormField label="السمك (mil)">
            <input name="thickness_mil" type="number" inputMode="decimal" min="0.001" step="0.001" defaultValue={values?.thicknessMil ?? ""} required />
          </FormField>
          <FormField label="الوزن (kg)">
            <input name="weight_kg" type="number" inputMode="decimal" min="0.001" step="0.001" defaultValue={values?.weightKg ?? ""} required />
          </FormField>
          <FormField label="بلد المنشأ">
            <input name="origin_country" type="text" minLength={2} maxLength={80} defaultValue={values?.originCountry ?? ""} required />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="السعر المرجعي" description="للعرض أو المرجعية فقط؛ المعاملات المستقبلية ستحتفظ بسعرها الخاص.">
        <FormGrid>
          <FormField label="السعر المرجعي" optional>
            <input name="reference_price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={values?.referencePrice ?? ""} />
          </FormField>
          <FormField label="كود العملة" hint="3 حروف مثل EGP أو USD." optional>
            <input name="currency_code" type="text" minLength={3} maxLength={3} pattern="[A-Za-z]{3}" dir="ltr" defaultValue={values?.currencyCode ?? ""} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="سياسة الضمان" description="المصدر الحالي لمدة الضمان وشروط التغطية والعناية؛ الضمان الفعلي سيحفظ Snapshot لاحقًا.">
        <FormGrid>
          <FormField label="مدة الضمان الافتراضية بالشهور">
            <input name="default_warranty_months" type="number" inputMode="numeric" min={1} max={240} step={1} defaultValue={values?.defaultWarrantyMonths} required />
          </FormField>
          <FormField label="نطاق تغطية الضمان" full>
            <textarea name="warranty_coverage" rows={5} maxLength={12000} defaultValue={values?.warrantyCoverage ?? ""} required />
          </FormField>
          <FormField label="تعليمات العناية" full>
            <textarea name="care_instructions" rows={5} maxLength={12000} defaultValue={values?.careInstructions ?? ""} required />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection title="محتوى المنتج" description="المحتوى الذي يدعم صفحة المنتج العامة والمواد التعريفية دون خلطه ببيانات التشغيل الفعلية.">
        <FormGrid>
          <FormField label="الوصف التسويقي" hint="مطلوب عند اختيار حالة منشور." full optional>
            <textarea name="marketing_description" rows={5} maxLength={5000} defaultValue={values?.marketingDescription ?? ""} />
          </FormField>
          <FormField label="الوصف الفني" full optional>
            <textarea name="technical_description" rows={7} maxLength={10000} defaultValue={values?.technicalDescription ?? ""} />
          </FormField>
          <FormField label="المميزات" hint="ميزة واحدة في كل سطر، بحد أقصى 30 ميزة." full optional>
            <textarea name="features" rows={6} defaultValue={values?.features.join("\n") ?? ""} />
          </FormField>
          <FormField label="حالة النشر" hint="مستقلة عن حالة المنتج التشغيلية Active / Archived.">
            <select name="publication_status" defaultValue={values?.publicationStatus ?? "draft"} required>
              <option value="draft">مسودة</option>
              <option value="published">منشور للعامة</option>
            </select>
          </FormField>
        </FormGrid>
      </FormSection>
    </>
  );
}
