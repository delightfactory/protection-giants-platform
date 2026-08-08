import Link from "next/link";
import { OperationalUserFields } from "@/components/operational-user-fields";
import { requireAdminProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOperationalUser } from "./actions";

type UserCreatePageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة. الاسم والبريد والدور وكلمة المرور مطلوبة بالقيم الصحيحة.",
  entity: "الوكيل أو مركز التركيب المحدد غير متاح أو موقوف حاليًا.",
  duplicate: "يوجد حساب Auth آخر بنفس البريد الإلكتروني.",
  password: "كلمة المرور غير مقبولة حسب سياسة Supabase Auth. استخدم كلمة مرور أقوى.",
  auth: "تعذر إنشاء حساب تسجيل الدخول. لم يتم حفظ حساب تشغيلي ناقص.",
  profile: "تعذر إنشاء الملف التشغيلي تلقائيًا، ولذلك تم التراجع عن حساب Auth الجديد.",
};

export default async function UserCreatePage({ searchParams }: UserCreatePageProps) {
  await requireAdminProfile();
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  const supabase = await createSupabaseServerClient();
  const [dealersResult, centersResult] = await Promise.all([
    supabase
      .from("dealers")
      .select("id, code, name, status")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("installation_centers")
      .select("id, code, name, status")
      .eq("status", "active")
      .order("name"),
  ]);

  if (dealersResult.error) throw dealersResult.error;
  if (centersResult.error) throw centersResult.error;

  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">الحسابات التشغيلية</span>
          <h1>إنشاء حساب جديد</h1>
        </div>
        <Link href="/operations/users" className="button">العودة للحسابات</Link>
      </div>

      <section className="operations-form-panel user-form-panel">
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

        <form action={createOperationalUser} className="operations-form">
          <div className="user-form-intro">
            <strong>بيانات تسجيل الدخول</strong>
            <p>البريد هو هوية الدخول الحالية. كلمة المرور هنا مؤقتة ويجب تسليمها لصاحب الحساب عبر قناة آمنة.</p>
          </div>

          <label>
            البريد الإلكتروني
            <input
              name="email"
              type="email"
              maxLength={254}
              required
              autoComplete="email"
              inputMode="email"
              dir="ltr"
            />
          </label>

          <label>
            كلمة المرور المؤقتة
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
              dir="ltr"
            />
            <small>12 حرفًا على الأقل، مع الالتزام بأي سياسة أقوى يتم تفعيلها لاحقًا داخل Supabase Auth.</small>
          </label>

          <div className="user-form-divider" aria-hidden="true" />

          <div className="user-form-intro">
            <strong>الهوية والصلاحية التشغيلية</strong>
            <p>اختيار الدور يحدد الكيان الذي يمثله الحساب وما يمكنه الوصول إليه داخل المنصة.</p>
          </div>

          <OperationalUserFields
            dealers={dealersResult.data}
            centers={centersResult.data}
          />

          <div className="operations-form-actions">
            <button type="submit" className="button button-primary">إنشاء الحساب</button>
            <Link href="/operations/users" className="button">إلغاء</Link>
          </div>
        </form>
      </section>
    </>
  );
}
