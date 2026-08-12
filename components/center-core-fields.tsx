import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";

export type CenterParentOption = {
  value: string;
  label: string;
  countryCode: string;
};

type CenterCoreFieldValues = {
  code: string;
  name: string;
  parentRef: string;
  city: string;
};

type CenterCoreFieldsProps = {
  parentOptions: CenterParentOption[];
  values?: CenterCoreFieldValues;
  lockParent?: boolean;
};

export function CenterCoreFields({ parentOptions, values, lockParent = false }: CenterCoreFieldsProps) {
  const selectedParent = parentOptions.find((option) => option.value === values?.parentRef);

  return (
    <FormGrid>
      <FormField
        label="كود مركز التركيب"
        hint="حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة."
      >
        <input
          name="code"
          type="text"
          minLength={2}
          maxLength={40}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}"
          placeholder="EG-TANTA-01"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          defaultValue={values?.code}
          required
        />
      </FormField>

      <FormField label="اسم مركز التركيب">
        <input name="name" type="text" minLength={2} maxLength={160} defaultValue={values?.name} required />
      </FormField>

      <FormField
        label="التبعية التشغيلية"
        hint="الدولة تُستمد تلقائيًا من الطرف الأب ولا تُدخل يدويًا."
      >
        {lockParent ? (
          <>
            <input type="hidden" name="parent_ref" value={values?.parentRef ?? ""} />
            <select value={values?.parentRef ?? ""} disabled aria-disabled="true">
              <option value={values?.parentRef ?? ""}>{selectedParent?.label ?? "التبعية غير متاحة"}</option>
            </select>
          </>
        ) : (
          <select name="parent_ref" defaultValue={values?.parentRef ?? ""} required>
            <option value="" disabled>اختر التبعية</option>
            {parentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.countryCode}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField label="المدينة" full>
        <input name="city" type="text" minLength={2} maxLength={120} defaultValue={values?.city} required />
      </FormField>
    </FormGrid>
  );
}
