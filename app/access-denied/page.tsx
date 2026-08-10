import Link from "next/link";
import { BrandLockup } from "@/components/ui/brand-lockup";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { signOut } from "@/lib/auth/actions";

export default function AccessDeniedPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="access-denied-title">
        <BrandLockup className="auth-brand" />

        <div className="auth-heading">
          <span className="eyebrow">بوابة التشغيل</span>
          <h1 id="access-denied-title">الوصول غير متاح</h1>
          <p>الحساب الحالي لا يملك ملف تشغيل فعالًا، لذلك تم إيقاف الوصول إلى بوابة العمليات.</p>
        </div>

        <FeedbackBanner tone="warning">
          راجع إدارة المنصة إذا كنت تتوقع أن يكون هذا الحساب مفعلًا أو مرتبطًا بكيان تشغيلي.
        </FeedbackBanner>

        <form action={signOut} className="auth-form auth-single-action">
          <button type="submit" className="button button-primary">تسجيل الخروج</button>
        </form>

        <Link href="/" className="auth-back-link">العودة إلى الموقع العام</Link>
      </section>
    </main>
  );
}
