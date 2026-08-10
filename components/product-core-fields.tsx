import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";

type ProductCoreFieldValues = {
  code: string;
  name: string;
  slug: string;
  defaultWarrantyMonths: number;
};

type ProductCoreFieldsProps = {
  values?: ProductCoreFieldValues;
};

export function ProductCoreFields({ values }: ProductCoreFieldsProps) {
  return (
    <FormGrid>
      <FormField label="كود المنتج">
        <input
          name="code"
          type="text"
          minLength={2}
          maxLength={40}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={values?.code}
          required
        />
      </FormField>

      <FormField label="اسم المنتج">
        <input name="name" type="text" minLength={2} maxLength={120} defaultValue={values?.name} required />
      </FormField>

      <FormField
        label="رابط المنتج"
        hint="حروف إنجليزية صغيرة وأرقام وشرطات فقط. سيُستخدم في رابط صفحة المنتج العامة."
      >
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

      <FormField label="مدة الضمان الافتراضية بالشهور">
        <input
          name="default_warranty_months"
          type="number"
          inputMode="numeric"
          min={1}
          max={240}
          step={1}
          defaultValue={values?.defaultWarrantyMonths}
          required
        />
      </FormField>
    </FormGrid>
  );
}
