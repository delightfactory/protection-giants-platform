import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/ui/brand-lockup";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOperationalUserId } from "@/lib/users/operational-user-input";
import { completeCenterOnboarding } from "./actions";

type CenterOnboardingPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const errorMessages: Record<string, string> = {
  "invite-link": "رابط الدعوة غير صالح أو انتهت صلاحيته. اطلب من الجهة المسؤولة عن المركز إعادة إصدار الدعوة.",
  session: "تعذر إثبات جلسة الدعوة. افتح رابط الدعوة الأصلي مرة أخرى أو اطلب إعادة إصداره.",
  invalid: "راجع الاسم ورقم الهاتف وكلمتي المرور ثم حاول مرة أخرى.",
  "invite-state": "الدعوة لم تعد متاحة للإكمال. قد تكون أُلغيت أو استُبدلت بدعوة أحدث.",
  "invite-review": "تم إيقاف إكمال هذه الدعوة احترازيًا وتحتاج مراجعة من إدارة Protection Giants قبل المحاولة مرة أخرى.",
  "invite-identity": "هوية البريد الحالية لا تطابق الدعوة المسجلة للمركز.",
  "center-inactive": "المركز موقوف حاليًا، لذلك لا يمكن إكمال تفعيل الحساب حتى تتم إعادة تفعيله.",
  "center-onboarded": "تم ربط حساب تشغيلي بالمركز بالفعل. لا يمكن استخدام دعوة الحساب الأول لإنشاء حساب إضافي.",
  "auth-update": "تعذر حفظ بيانات الدخول الجديدة. راجع كلمة المرور وحاول مرة أخرى.",
  provisioning: "تعذر تثبيت الربط التشغيلي للمركز. لم يتم إنشاء Profile غير موثوق.",
  profile: "تعذر التحقق من Profile التشغيلي بعد التفعيل. أوقفنا الإكمال للحفاظ على سلامة الربط.",
};

function ErrorState({ message }: { message: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="onboarding-error-title">
        <BrandLockup className="auth-brand" />
        <div className="auth-heading">
          <span className="eyebrow">دعوة مركز تركيب</span>
          <h1 id="onboarding-error-title">تعذر إكمال الدعوة</h1>
        </div>
        <FeedbackBanner tone="error">{message}</FeedbackBanner>
        <p>لن يتم إنشاء أي صلاحية تشغيلية من رابط غير صالح أو دعوة لم تعد نشطة أو تحتاج مراجعة إدارية.</p>
        <Link href="/" className="auth-back-link">العودة إلى الموقع العام</Link>
      </section>
    </main>
  );
}

export default async function CenterOnboardingPage({ searchParams }: CenterOnboardingPageProps) {
  const { error } = await searchParams;
  if (error === "invite-link") {
    return <ErrorState message={errorMessages[error]} />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !isOperationalUserId(userId)) {
    return <ErrorState message={errorMessages[error ?? "session"] ?? errorMessages.session} />;
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, installation_center_id")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfileError) throw existingProfileError;
  if (existingProfile) {
    if (existingProfile.role === "center" && existingProfile.installation_center_id) {
      redirect("/operations");
    }
    redirect("/access-denied");
  }

  const { data: invitation, error: invitationError } = await supabaseAdmin
    .from("center_onboarding_invitations")
    .select("id, installation_center_id, invited_email, auth_user_id, status, accepted_at, review_required_at, failure_code")
    .eq("auth_user_id", userId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invitationError) throw invitationError;
  if (!invitation || invitation.auth_user_id !== userId) {
    return <ErrorState message={errorMessages[error ?? "invite-state"] ?? errorMessages["invite-state"]} />;
  }
  if (invitation.review_required_at || invitation.failure_code) {
    return <ErrorState message={errorMessages["invite-review"]} />;
  }

  const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const authEmail = authResult.user?.email?.trim().toLowerCase();
  if (authError || !authEmail || authEmail !== invitation.invited_email) {
    return <ErrorState message={errorMessages[error ?? "invite-identity"] ?? errorMessages["invite-identity"]} />;
  }

  const [{ data: center, error: centerError }, { data: otherCenterProfile, error: otherCenterProfileError }] = await Promise.all([
    supabaseAdmin
      .from("installation_centers")
      .select("id, code, name, city, country_code, status")
      .eq("id", invitation.installation_center_id)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "center")
      .eq("installation_center_id", invitation.installation_center_id)
      .neq("id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (centerError) throw centerError;
  if (otherCenterProfileError) throw otherCenterProfileError;
  if (!center) return <ErrorState message={errorMessages["invite-state"]} />;
  if (center.status !== "active") return <ErrorState message={errorMessages["center-inactive"]} />;
  if (otherCenterProfile) return <ErrorState message={errorMessages["center-onboarded"]} />;

  const errorMessage = error ? errorMessages[error] : undefined;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="center-onboarding-title">
        <BrandLockup className="auth-brand" />

        <div className="auth-heading">
          <span className="eyebrow">دعوة مركز تركيب</span>
          <h1 id="center-onboarding-title">إعداد حساب المركز</h1>
          <p>أكمل بيانات حسابك للمركز المسجل مسبقًا. الربط التشغيلي ثابت ولا يمكن تغييره من هذه الصفحة.</p>
        </div>

        {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}

        <div className="user-role-note">
          <strong>{center.name}</strong>
          <p dir="ltr">Center Code: {center.code}</p>
          <p>{center.city} — <span dir="ltr">{center.country_code}</span></p>
          <p>البريد المدعو: <span dir="ltr">{invitation.invited_email}</span></p>
          {invitation.status === "accepted" ? <p>تم تثبيت قبول الدعوة؛ هذه الصفحة تستكمل Profile التشغيلي فقط.</p> : null}
        </div>

        <form action={completeCenterOnboarding} className="auth-form">
          <FormField label="الاسم الظاهر">
            <input
              name="display_name"
              type="text"
              minLength={2}
              maxLength={120}
              required
              autoComplete="name"
            />
          </FormField>

          <FormField label="رقم الهاتف" optional>
            <input
              name="phone"
              type="tel"
              minLength={5}
              maxLength={32}
              autoComplete="tel"
              inputMode="tel"
              dir="ltr"
            />
          </FormField>

          <FormField label="كلمة المرور الجديدة" hint="12 حرفًا على الأقل.">
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
              dir="ltr"
            />
          </FormField>

          <FormField label="تأكيد كلمة المرور">
            <input
              name="password_confirmation"
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete="new-password"
              dir="ltr"
            />
          </FormField>

          <button type="submit" className="button button-primary">إكمال إعداد الحساب</button>
        </form>

        <p className="auth-back-link">لن يتم إنشاء الحساب التشغيلي إلا إذا ظلت هذه الدعوة مرتبطة بنفس البريد والمركز.</p>
      </section>
    </main>
  );
}
