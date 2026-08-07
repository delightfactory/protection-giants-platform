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
    <>
      <label>
        <span>كود المنتج</span>
        <input name="code" type="text" minLength={2} maxLength={40} defaultValue={values?.code} required />
      </label>

      <label>
        <span>اسم المنتج</span>
        <input name="name" type="text" minLength={2} maxLength={120} defaultValue={values?.name} required />
      </label>

      <label>
        <span>رابط المنتج</span>
        <input
          name="slug"
          type="text"
          inputMode="url"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="protection-film-x"
          dir="ltr"
          defaultValue={values?.slug}
          required
        />
        <small>حروف إنجليزية صغيرة وأرقام وشرطات فقط. سيُستخدم في رابط صفحة المنتج العامة.</small>
      </label>

      <label>
        <span>مدة الضمان الافتراضية بالشهور</span>
        <input
          name="default_warranty_months"
          type="number"
          min={1}
          max={240}
          step={1}
          defaultValue={values?.defaultWarrantyMonths}
          required
        />
      </label>
    </>
  );
}
