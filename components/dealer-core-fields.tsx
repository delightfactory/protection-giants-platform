import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";

type DealerCoreFieldValues = {
  code: string;
  name: string;
  countryCode: string;
};

type DealerCoreFieldsProps = {
  values?: DealerCoreFieldValues;
};

export function DealerCoreFields({ values }: DealerCoreFieldsProps) {
  return (
    <FormGrid>
      <FormField
        label="كود الوكيل / الموزع"
        hint="حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة."
      >
        <input
          name="code"
          type="text"
          minLength={2}
          maxLength={40}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}"
          placeholder="EG-CAIRO"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          defaultValue={values?.code}
          required
        />
      </FormField>

      <FormField label="اسم الوكيل / الموزع">
        <input name="name" type="text" minLength={2} maxLength={160} defaultValue={values?.name} required />
      </FormField>

      <FormField label="كود الدولة" hint="رمز الدولة من حرفين مثل EG أو SA أو AE.">
        <input
          name="country_code"
          type="text"
          minLength={2}
          maxLength={2}
          pattern="[A-Za-z]{2}"
          placeholder="EG"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          defaultValue={values?.countryCode}
          required
        />
      </FormField>
    </FormGrid>
  );
}
