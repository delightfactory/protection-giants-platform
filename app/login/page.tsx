import Link from "next/link";
import { BrandLockup } from "@/components/ui/brand-lockup";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { signIn } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  required: "أدخل البريد الإلكتروني وكلمة المرور.",
  credentials: "بيانات الدخول غير صحيحة.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <BrandLockup className="auth-brand" />

        <div className="auth-heading">
          <span className="eyebrow">بوابة التشغيل</span>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>دخول آمن لمستخدمي الشركة والوكلاء ومراكز التركيب المعتمدة.</p>
        </div>

        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}

        <form action={signIn} className="auth-form">
          <FormField label="البريد الإلكتروني">
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              required
            />
          </FormField>

          <FormField label="كلمة المرور">
            <input name="password" type="password" autoComplete="current-password" dir="ltr" required />
          </FormField>

          <button type="submit" className="button button-primary">دخول</button>
        </form>

        <Link href="/" className="auth-back-link">العودة إلى الموقع العام</Link>
      </section>
    </main>
  );
}
