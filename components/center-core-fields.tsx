"use client";

import { useState } from "react";
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
  countryCode?: string;
  city: string;
};

type CenterCoreFieldsProps = {
  parentOptions: CenterParentOption[];
  values?: CenterCoreFieldValues;
  lockParent?: boolean;
};

export function CenterCoreFields({ parentOptions, values, lockParent = false }: CenterCoreFieldsProps) {
  const [parentRef, setParentRef] = useState(values?.parentRef ?? "");
  const selectedParent = parentOptions.find((option) => option.value === parentRef);
  const isCompanyDirect = parentRef === "company";

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
        hint="مع Agent أو Dealer تُستمد الدولة تلقائيًا من الطرف الأب."
      >
        {lockParent ? (
          <>
            <input type="hidden" name="parent_ref" value={parentRef} />
            <select value={parentRef} disabled aria-disabled="true">
              <option value={parentRef}>{selectedParent?.label ?? "التبعية غير متاحة"}</option>
            </select>
          </>
        ) : (
          <select
            name="parent_ref"
            value={parentRef}
            onChange={(event) => setParentRef(event.target.value)}
            required
          >
            <option value="" disabled>اختر التبعية</option>
            {parentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}{option.countryCode ? ` — ${option.countryCode}` : ""}
              </option>
            ))}
          </select>
        )}
      </FormField>

      {isCompanyDirect ? (
        <FormField label="كود الدولة" hint="مطلوب فقط لأن المركز مباشر للشركة ولا يوجد طرف أب نستمد منه الدولة.">
          <input
            name="company_country_code"
            type="text"
            minLength={2}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            defaultValue={values?.countryCode ?? ""}
            placeholder="EG"
            autoCapitalize="characters"
            spellCheck={false}
            dir="ltr"
            required
          />
        </FormField>
      ) : null}

      <FormField label="المدينة" full>
        <input name="city" type="text" minLength={2} maxLength={120} defaultValue={values?.city} required />
      </FormField>
    </FormGrid>
  );
}
