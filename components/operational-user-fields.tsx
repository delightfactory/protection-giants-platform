"use client";

import { useState } from "react";
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
  const [role, setRole] = useState<OperationalUserRole | "">(
    defaultValues?.role ?? "",
  );

  return (
    <>
      <label>
        الاسم الظاهر
        <input
          name="display_name"
          type="text"
          minLength={2}
          maxLength={120}
          required
          defaultValue={defaultValues?.displayName ?? ""}
          autoComplete="name"
        />
        <small>اسم واضح يظهر داخل لوحة العمليات ويعرّف صاحب الحساب.</small>
      </label>

      <label>
        رقم الهاتف
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
        <small>اختياري حاليًا، ومحفوظ من البداية لدعم التحقق أو تسجيل الدخول بالهاتف مستقبلًا دون إعادة تصميم الحساب.</small>
      </label>

      <label>
        الدور التشغيلي
        {lockRole ? (
          <>
            <input type="hidden" name="role" value={role} />
            <select value={role} disabled aria-disabled="true">
              <option value="admin">إدارة الشركة</option>
            </select>
            <small>لا يمكن خفض صلاحية الحساب الإداري الذي تستخدمه الآن.</small>
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
      </label>

      {role === "dealer" ? (
        <label>
          الوكيل / الموزع المرتبط
          <select name="dealer_id" required defaultValue={defaultValues?.dealerId ?? ""}>
            <option value="" disabled>اختر الوكيل أو الموزع</option>
            {dealers.map((dealer) => (
              <option key={dealer.id} value={dealer.id}>
                {optionLabel(dealer)}
              </option>
            ))}
          </select>
          <small>الحساب سيمثل هذا الكيان فقط داخل النظام.</small>
        </label>
      ) : null}

      {role === "center" ? (
        <label>
          مركز التركيب المرتبط
          <select
            name="installation_center_id"
            required
            defaultValue={defaultValues?.centerId ?? ""}
          >
            <option value="" disabled>اختر مركز التركيب</option>
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {optionLabel(center)}
              </option>
            ))}
          </select>
          <small>الحساب سيمثل مركز التركيب المحدد فقط داخل النظام.</small>
        </label>
      ) : null}

      {role === "admin" ? (
        <div className="user-role-note">
          حساب إدارة الشركة لا يرتبط بوكيل أو مركز تركيب.
        </div>
      ) : null}
    </>
  );
}
