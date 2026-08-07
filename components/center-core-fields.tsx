type DealerOption = {
  id: string;
  code: string;
  name: string;
  status: string;
};

type CenterCoreFieldsProps = {
  dealers: DealerOption[];
};

export function CenterCoreFields({ dealers }: CenterCoreFieldsProps) {
  return (
    <>
      <label>
        <span>كود مركز التركيب</span>
        <input
          name="code"
          type="text"
          minLength={2}
          maxLength={40}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}"
          placeholder="EG-TANTA-01"
          dir="ltr"
          required
        />
        <small>حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة.</small>
      </label>

      <label>
        <span>اسم مركز التركيب</span>
        <input name="name" type="text" minLength={2} maxLength={160} required />
      </label>

      <label>
        <span>الوكيل / الموزع الأب</span>
        <select name="dealer_id" defaultValue="">
          <option value="">مباشر للشركة</option>
          {dealers.map((dealer) => (
            <option value={dealer.id} key={dealer.id}>
              {dealer.name} ({dealer.code}){dealer.status === "suspended" ? " — موقوف" : ""}
            </option>
          ))}
        </select>
        <small>اتركه «مباشر للشركة» إذا لم يكن المركز تابعًا لوكيل.</small>
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
      </label>

      <label>
        <span>المدينة</span>
        <input name="city" type="text" minLength={2} maxLength={120} required />
      </label>
    </>
  );
}
