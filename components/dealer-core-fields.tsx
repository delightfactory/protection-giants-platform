export function DealerCoreFields() {
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
          dir="ltr"
          required
        />
        <small>حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة.</small>
      </label>

      <label>
        <span>اسم الوكيل / الموزع</span>
        <input name="name" type="text" minLength={2} maxLength={160} required />
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
          dir="ltr"
          required
        />
        <small>رمز الدولة من حرفين مثل EG أو SA أو AE.</small>
      </label>
    </>
  );
}
