import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";

type AgentCoreFieldValues = {
  code: string;
  name: string;
  countryCode: string;
};

type AgentCoreFieldsProps = {
  values?: AgentCoreFieldValues;
};

export function AgentCoreFields({ values }: AgentCoreFieldsProps) {
  return (
    <FormGrid>
      <FormField
        label="كود الوكيل"
        hint="حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة."
      >
        <input
          name="code"
          type="text"
          minLength={2}
          maxLength={40}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}"
          placeholder="EG-AGENT"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          defaultValue={values?.code}
          required
        />
      </FormField>

      <FormField label="اسم وكيل الدولة">
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
