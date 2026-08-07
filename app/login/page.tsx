import Link from "next/link";
import { signIn } from "./actions";
import { brandConfig } from "@/lib/brand-config";

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
        <Link href="/" className="brand auth-brand" aria-label={`${brandConfig.name} - الرئيسية`}>
          <span className="brand-mark" aria-hidden="true">{brandConfig.shortName}</span>
          <span>{brandConfig.name}</span>
        </Link>

        <div>
          <span className="eyebrow">بوابة التشغيل</span>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>الدخول مخصص لمستخدمي الشركة والوكلاء ومراكز التركيب المعتمدة.</p>
        </div>

        {errorMessage ? (
          <p className="form-error" role="alert">{errorMessage}</p>
        ) : null}

        <form action={signIn} className="auth-form">
          <label>
            <span>البريد الإلكتروني</span>
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
          </label>

          <label>
            <span>كلمة المرور</span>
            <input name="password" type="password" autoComplete="current-password" dir="ltr" required />
          </label>

          <button type="submit" className="button button-primary">دخول</button>
        </form>

        <Link href="/" className="auth-back-link">العودة إلى الموقع العام</Link>
      </section>
    </main>
  );
}
