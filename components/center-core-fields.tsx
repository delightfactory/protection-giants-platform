import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";

type DealerOption = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type CenterCoreFieldValues = {
  code: string;
  name: string;
  dealerId: string | null;
  countryCode: string;
  city: string;
};

type CenterCoreFieldsProps = {
  dealers: DealerOption[];
  values?: CenterCoreFieldValues;
};

export function CenterCoreFields({ dealers, values }: CenterCoreFieldsProps) {
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
        label="الوكيل / الموزع الأب"
        hint="اختر «مباشر للشركة» إذا لم يكن المركز تابعًا لوكيل."
        optional
      >
        <select name="dealer_id" defaultValue={values?.dealerId ?? ""}>
          <option value="">مباشر للشركة</option>
          {dealers.map((dealer) => (
            <option value={dealer.id} key={dealer.id}>
              {dealer.name} ({dealer.code}){dealer.status === "suspended" ? " — موقوف" : ""}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="كود الدولة">
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

      <FormField label="المدينة" full>
        <input name="city" type="text" minLength={2} maxLength={120} defaultValue={values?.city} required />
      </FormField>
    </FormGrid>
  );
}
