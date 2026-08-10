"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";
import type { OperationalUserRole } from "@/lib/users/operational-user-input";

type EntityOption = {
  id: string;
  code: string;
  name: string;
  status?: string;
};

type OperationalUserFieldsProps = {
  dealers: EntityOption[];
  centers: EntityOption[];
  defaultValues?: {
    displayName?: string;
    phone?: string | null;
    role?: OperationalUserRole;
    dealerId?: string | null;
    centerId?: string | null;
  };
  lockRole?: boolean;
};

function optionLabel(option: EntityOption) {
  const statusSuffix = option.status === "suspended" ? " — موقوف" : "";
  return `${option.name} (${option.code})${statusSuffix}`;
}

export function OperationalUserFields({
  dealers,
  centers,
  defaultValues,
  lockRole = false,
}: OperationalUserFieldsProps) {
  const [role, setRole] = useState<OperationalUserRole | "">(defaultValues?.role ?? "");

  return (
    <FormGrid>
      <FormField label="الاسم الظاهر" hint="الاسم الذي يظهر داخل بوابة التشغيل ويعرّف صاحب الحساب.">
        <input
          name="display_name"
          type="text"
          minLength={2}
          maxLength={120}
          required
          defaultValue={defaultValues?.displayName ?? ""}
          autoComplete="name"
        />
      </FormField>

      <FormField
        label="رقم الهاتف"
        hint="محفوظ كبيان تشغيلي وداعم للتفعيل المستقبلي دون استخدامه حاليًا كهوية دخول."
        optional
      >
        <input
          name="phone"
          type="tel"
          minLength={5}
          maxLength={32}
          defaultValue={defaultValues?.phone ?? ""}
          autoComplete="tel"
          inputMode="tel"
          dir="ltr"
        />
      </FormField>

      <FormField
        label="الدور التشغيلي"
        hint={lockRole ? "الحساب الإداري الحالي محمي من خفض الصلاحية ذاتيًا." : "الدور يحدد نطاق الوصول والكيان الذي يمثله الحساب."}
      >
        {lockRole ? (
          <>
            <input type="hidden" name="role" value={role} />
            <select value={role} disabled aria-disabled="true">
              <option value="admin">إدارة الشركة</option>
            </select>
          </>
        ) : (
          <select
            name="role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as OperationalUserRole | "")}
          >
            <option value="" disabled>اختر الدور</option>
            <option value="admin">إدارة الشركة</option>
            <option value="dealer">وكيل / موزع</option>
            <option value="center">مركز تركيب</option>
          </select>
        )}
      </FormField>

      {role === "dealer" ? (
        <FormField label="الوكيل / الموزع المرتبط" hint="الحساب سيمثل هذا الكيان فقط داخل النظام.">
          <select name="dealer_id" required defaultValue={defaultValues?.dealerId ?? ""}>
            <option value="" disabled>اختر الوكيل أو الموزع</option>
            {dealers.map((dealer) => (
              <option key={dealer.id} value={dealer.id}>{optionLabel(dealer)}</option>
            ))}
          </select>
        </FormField>
      ) : null}

      {role === "center" ? (
        <FormField label="مركز التركيب المرتبط" hint="الحساب سيمثل مركز التركيب المحدد فقط داخل النظام.">
          <select name="installation_center_id" required defaultValue={defaultValues?.centerId ?? ""}>
            <option value="" disabled>اختر مركز التركيب</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>{optionLabel(center)}</option>
            ))}
          </select>
        </FormField>
      ) : null}

      {role === "admin" ? (
        <div className="user-role-note ui-form-grid-full">
          حساب إدارة الشركة لا يرتبط بوكيل أو مركز تركيب.
        </div>
      ) : null}
    </FormGrid>
  );
}
