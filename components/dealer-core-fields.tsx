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
    <>
      <label>
        <span>كود الوكيل / الموزع</span>
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
        <small>حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة.</small>
      </label>

      <label>
        <span>اسم الوكيل / الموزع</span>
        <input name="name" type="text" minLength={2} maxLength={160} defaultValue={values?.name} required />
      </label>

      <label>
        <span>كود الدولة</span>
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
        <small>رمز الدولة من حرفين مثل EG أو SA أو AE.</small>
      </label>
    </>
  );
}
