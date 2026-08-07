import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { brandConfig } from "@/lib/brand-config";

export default function AccessDeniedPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="access-denied-title">
        <Link href="/" className="brand auth-brand" aria-label={`${brandConfig.name} - الرئيسية`}>
          <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
          <span>{brandConfig.name}</span>
        </Link>

        <div>
          <span className="eyebrow">بوابة التشغيل</span>
          <h1 id="access-denied-title">الوصول غير متاح</h1>
          <p>الحساب الحالي لا يملك ملف تشغيل فعالًا. راجع إدارة المنصة إذا كنت تتوقع أن يكون الحساب مفعلًا.</p>
        </div>

        <form action={signOut} className="auth-form">
          <button type="submit" className="button button-primary">تسجيل الخروج</button>
        </form>

        <Link href="/" className="auth-back-link">العودة إلى الموقع العام</Link>
      </section>
    </main>
  );
}
