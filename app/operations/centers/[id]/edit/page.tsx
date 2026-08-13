import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CenterCoreFields, type CenterParentOption } from "@/components/center-core-fields";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  cancelCenterInvitation,
  reissueCenterInvitation,
  sendCenterInvitation,
  updateCenter,
} from "./actions";
import { recoverCenterOnboardingInvitation } from "./recovery-actions";

type CenterEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة وحدد تبعية تشغيلية صحيحة.",
  parent: "الطرف الأب المحدد غير متاح أو خارج نطاقك أو موقوف لهذا النقل.",
  duplicate: "يوجد مركز تركيب آخر بنفس الكود.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
  "invite-invalid": "راجع البريد الإلكتروني أو بيانات الدعوة وحاول مرة أخرى.",
  "invite-center-inactive": "لا يمكن إرسال أو إعادة إصدار دعوة لمركز موقوف. أعد تفعيل المركز أولًا.",
  "invite-onboarded": "المركز لديه حساب تشغيلي بالفعل، لذلك لا يحتاج إلى دعوة onboarding أولية جديدة.",
  "invite-pending": "هناك دعوة onboarding نشطة بالفعل لهذا المركز أو لهذا البريد الإلكتروني.",
  "invite-locked": "بدأ المستلم إكمال onboarding بالفعل، لذلك لم يعد مسموحًا بإلغاء أو استبدال الدعوة من هذه الشاشة.",
  "invite-email-unavailable": "لا يمكن استخدام هذا البريد في دعوة أولية. يوجد ارتباط Auth أو تشغيلي يحتاج مراجعة إدارية.",
  "invite-auth": "تعذر إنشاء وإرسال دعوة Supabase Auth. لم يتم تفعيل أي حساب تشغيلي.",
  "invite-audit": "تعذر تثبيت سجل الدعوة بصورة آمنة. لم يتم ترك حساب تشغيلي غير مكتمل.",
  "invite-missing": "الدعوة لم تعد معلقة أو تم التعامل معها بالفعل.",
  "invite-cleanup": "تم إيقاف الدعوة، لكن تعذر تنظيف حساب Auth غير المُطالب به. يحتاج هذا البريد مراجعة إدارية قبل إعادة الدعوة.",
  "invite-review-invalid": "بيانات طلب مراجعة الدعوة غير صحيحة.",
  "invite-review-missing": "هذه الدعوة لم تعد في حالة تحتاج مراجعة أو تم التعامل معها بالفعل.",
  "invite-review-locked": "تغيرت حالة الدعوة أثناء المراجعة؛ لم يتم فتحها أو حذف أي حساب بصورة غير مؤكدة.",
  "invite-review-profile": "يوجد Profile لهذا المستخدم؛ لن يتم إصلاحه تلقائيًا. راجع الحساب من إدارة الحسابات التشغيلية.",
  "invite-review-auth": "تعذر التحقق من حساب Auth أو تنظيف حالته؛ الدعوة ما زالت مقفولة للمراجعة.",
  "invite-review-identity": "هوية Auth لا تطابق البريد المسجل في الدعوة؛ تم إيقاف الإصلاح التلقائي.",
  "invite-review-cleanup": "أُغلقت الدعوة غير اللازمة، لكن تعذر حذف حساب Auth غير المكتمل. يحتاج إلى مراجعة إدارية.",
};

const successMessages: Record<string, string> = {
  "invite-sent": "تم إنشاء الدعوة وإرسالها إلى البريد المحدد.",
  "invite-cancelled": "تم إلغاء الدعوة ومنع استخدامها لإكمال onboarding.",
  "invite-reissued": "تم إبطال الدعوة السابقة وإصدار دعوة جديدة لنفس البريد.",
  "invite-review-reopened": "تم التحقق من عدم وجود Profile وتنظيف Auth؛ عادت الدعوة إلى Pending ويمكن للمستلم المحاولة بأمان.",
  "invite-review-superseded": "لم تعد الدعوة الاستثنائية مطلوبة وتم إغلاقها بأمان. يمكن إصدار دعوة جديدة إذا كان المركز ما زال بلا حساب.",
};

const reviewFailureLabels: Record<string, string> = {
  "profile-mismatch": "نتيجة Profile لم تطابق الربط المتوقع بعد provisioning.",
  "profile-read-uncertain": "تعذر إثبات حالة Profile بعد provisioning، فتم إيقاف Auth احترازيًا.",
};

function formatInviteDate(value: string | null) {
  if (!value) return "غير متاح";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function CenterEditPage({ params, searchParams }: CenterEditPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role === "center") redirect("/access-denied");

  const { id } = await params;
  const { error, success } = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [centerResult, dealersResult, agentsResult, partyResult] = await Promise.all([
    supabase
      .from("installation_centers")
      .select("id, code, name, dealer_id, country_agent_id, country_code, city, status")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("dealers").select("id, code, name, country_code, status").order("name"),
    profile.role === "dealer"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("country_agents").select("id, code, name, country_code, status").order("name"),
    supabase
      .from("operational_parties")
      .select("transfer_code")
      .eq("installation_center_id", id)
      .maybeSingle(),
  ]);

  if (centerResult.error) throw centerResult.error;
  if (dealersResult.error) throw dealersResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (partyResult.error) throw partyResult.error;
  if (!centerResult.data) notFound();

  const center = centerResult.data;
  const currentParentRef = center.dealer_id
    ? `dealer:${center.dealer_id}`
    : center.country_agent_id
      ? `agent:${center.country_agent_id}`
      : "company";

  const parentOptions: CenterParentOption[] = [];

  if (profile.role === "admin") {
    parentOptions.push({
      value: "company",
      label: "مباشر لشركة Protection Giants",
      countryCode: center.dealer_id || center.country_agent_id ? "" : center.country_code,
    });
  }

  if (profile.role === "admin" || profile.role === "agent") {
    for (const agent of agentsResult.data) {
      if (agent.status !== "active" && `agent:${agent.id}` !== currentParentRef) continue;
      parentOptions.push({
        value: `agent:${agent.id}`,
        label: `مباشر لوكيل الدولة: ${agent.name} (${agent.code})${agent.status === "suspended" ? " — موقوف" : ""}`,
        countryCode: agent.country_code,
      });
    }
  }

  for (const dealer of dealersResult.data) {
    if (dealer.status !== "active" && `dealer:${dealer.id}` !== currentParentRef) continue;
    parentOptions.push({
      value: `dealer:${dealer.id}`,
      label: `تحت الموزع: ${dealer.name} (${dealer.code})${dealer.status === "suspended" ? " — موقوف" : ""}`,
      countryCode: dealer.country_code,
    });
  }

  if (profile.role === "dealer" && currentParentRef !== `dealer:${profile.dealer_id}`) {
    notFound();
  }

  // The Center row above is the RLS authorization proof. Privileged reads below
  // are then restricted to this exact Center and do not expose an Auth directory.
  const supabaseAdmin = createSupabaseAdminClient();
  const [centerProfileResult, invitationResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "center")
      .eq("installation_center_id", center.id)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("center_onboarding_invitations")
      .select("id, invited_email, auth_user_id, status, created_at, accepted_at, review_required_at, failure_code")
      .eq("installation_center_id", center.id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (centerProfileResult.error) throw centerProfileResult.error;
  if (invitationResult.error) throw invitationResult.error;

  const centerHasAccount = Boolean(centerProfileResult.data);
  const invitation = invitationResult.data;
  const reviewInvitation = invitation?.status === "accepted" && invitation.review_required_at
    ? invitation
    : null;
  const pendingInvitation = invitation?.status === "pending" ? invitation : null;
  const finalizingInvitation = invitation?.status === "accepted" && !reviewInvitation && !centerHasAccount
    ? invitation
    : null;
  const centerActive = center.status === "active";
  const errorMessage = error ? errorMessages[error] : undefined;
  const successMessage = success ? successMessages[success] : undefined;

  return (
    <>
      <PageHeader
        eyebrow="مراكز التركيب"
        title={center.name}
        description="تعديل هوية المركز وموقعه وتبعيته، وإدارة دعوة الحساب الأول داخل نفس النطاق التشغيلي."
        meta={partyResult.data?.transfer_code ? <span dir="ltr">Transfer ID: {partyResult.data.transfer_code}</span> : undefined}
        actions={<TaskBackLink href="/operations/centers" label="العودة للمراكز" />}
      />

      {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
      {successMessage ? <FeedbackBanner tone="success">{successMessage}</FeedbackBanner> : null}

      <div className="user-settings-stack">
        <FormPanel>
          <form action={updateCenter} className="operations-form">
            <input type="hidden" name="center_id" value={center.id} />
            <input type="hidden" name="current_parent_ref" value={currentParentRef} />
            <FormSection
              title="بيانات مركز التركيب"
              description={profile.role === "dealer"
                ? "يمكنك تعديل بيانات مركز تابع لك، بينما تظل التبعية ثابتة على موزعك."
                : "يمكنك نقل المركز فقط بين الأطراف التي تظهر لك ضمن نطاقك التشغيلي."}
            >
              <CenterCoreFields
                parentOptions={parentOptions}
                lockParent={profile.role === "dealer"}
                values={{
                  code: center.code,
                  name: center.name,
                  parentRef: currentParentRef,
                  countryCode: center.country_code,
                  city: center.city,
                }}
              />
            </FormSection>

            <div className="operations-form-actions">
              <button type="submit" className="button button-primary">حفظ التعديلات</button>
              <Link href="/operations/centers" className="button button-ghost">إلغاء</Link>
            </div>
          </form>
        </FormPanel>

        <FormPanel>
          <FormSection
            title="دعوة الحساب الأول للمركز"
            description="الدعوة تخص أول مستخدم يمثل هذا المركز. الدور والمركز محددان مسبقًا ولا يختارهما المستلم."
          >
            {reviewInvitation ? (
              <div className="operations-form">
                <div className="user-role-note">
                  <div className="operations-form-actions is-inline">
                    <StatusBadge tone="warning">تحتاج مراجعة</StatusBadge>
                  </div>
                  <p>البريد: <span dir="ltr">{reviewInvitation.invited_email}</span></p>
                  <p>وقت الإيقاف الاحترازي: <span dir="ltr">{formatInviteDate(reviewInvitation.review_required_at)}</span></p>
                  <p>{reviewFailureLabels[reviewInvitation.failure_code ?? ""] ?? "حدث فشل غير متوقع أثناء التحقق النهائي من onboarding."}</p>
                  <p>المستلم ممنوع من إعادة المحاولة حتى تُحسم هذه الحالة من الإدارة.</p>
                </div>

                {profile.role === "admin" ? (
                  <div className="operations-form-actions">
                    <form action={recoverCenterOnboardingInvitation}>
                      <input type="hidden" name="center_id" value={center.id} />
                      <input type="hidden" name="invitation_id" value={reviewInvitation.id} />
                      <ConfirmSubmitButton
                        tone="primary"
                        title="فحص واستعادة حالة onboarding؟"
                        description="سيعيد النظام التحقق من Auth وProfile. لن يُعاد فتح الدعوة إذا وُجد أي Profile لهذا المستخدم. وإذا كان للمركز حساب آخر، ستُغلق الدعوة غير المكتملة بدل إنشاء حساب إضافي."
                        confirmLabel="بدء الفحص الآمن"
                      >
                        فحص الحالة واستعادتها
                      </ConfirmSubmitButton>
                    </form>
                    <Link href="/operations/users" className="button button-ghost">فتح إدارة الحسابات</Link>
                  </div>
                ) : (
                  <div className="user-role-note">هذه حالة أمنية استثنائية تحتاج تدخل إدارة Protection Giants؛ لا يحاول Agent أو Dealer إعادة إصدار الدعوة.</div>
                )}
              </div>
            ) : centerHasAccount ? (
              <div className="user-role-note">
                <div className="operations-form-actions is-inline">
                  <StatusBadge tone="success">تم الربط</StatusBadge>
                </div>
                <p>يوجد حساب تشغيلي واحد على الأقل مرتبط بالمركز؛ onboarding الأولي مغلق لهذا المركز.</p>
                {pendingInvitation ? (
                  <form action={cancelCenterInvitation} className="operations-form">
                    <input type="hidden" name="center_id" value={center.id} />
                    <input type="hidden" name="invitation_id" value={pendingInvitation.id} />
                    <p>توجد أيضًا دعوة قديمة معلقة إلى <span dir="ltr">{pendingInvitation.invited_email}</span>. يمكن إبطالها بأمان.</p>
                    <div className="operations-form-actions is-inline">
                      <ConfirmSubmitButton
                        title="إلغاء الدعوة الزائدة؟"
                        description="المركز لديه حساب تشغيلي بالفعل. سيتم إبطال هذه الدعوة وحذف مستخدم Auth غير المُطالب به إن وُجد، دون المساس بحساب المركز الحالي."
                        confirmLabel="إلغاء الدعوة"
                      >
                        إلغاء الدعوة الزائدة
                      </ConfirmSubmitButton>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : finalizingInvitation ? (
              <div className="user-role-note">
                <div className="operations-form-actions is-inline">
                  <StatusBadge tone="neutral">قيد الإكمال</StatusBadge>
                </div>
                <p>
                  المستلم <span dir="ltr">{finalizingInvitation.invited_email}</span> بدأ إكمال onboarding في {formatInviteDate(finalizingInvitation.accepted_at ?? finalizingInvitation.created_at)}.
                </p>
                <p>تم قفل الإلغاء وإعادة الإصدار حتى لا تتسابق عملية الإدارة مع إنشاء Profile التشغيلي.</p>
              </div>
            ) : pendingInvitation ? (
              <div className="operations-form">
                <div className="user-role-note">
                  <div className="operations-form-actions is-inline">
                    <StatusBadge tone="neutral">دعوة معلقة</StatusBadge>
                  </div>
                  <p>البريد: <span dir="ltr">{pendingInvitation.invited_email}</span></p>
                  <p>تاريخ الإصدار: <span dir="ltr">{formatInviteDate(pendingInvitation.created_at)}</span></p>
                </div>

                <div className="operations-form-actions">
                  <form action={reissueCenterInvitation}>
                    <input type="hidden" name="center_id" value={center.id} />
                    <input type="hidden" name="invitation_id" value={pendingInvitation.id} />
                    <ConfirmSubmitButton
                      tone="primary"
                      title="إعادة إصدار الدعوة؟"
                      description="سيتم إبطال رابط الدعوة الحالي وحذف مستخدم Auth غير المُطالب به ثم إصدار دعوة جديدة لنفس البريد."
                      confirmLabel="إعادة الإصدار"
                      disabled={!centerActive}
                    >
                      إعادة إصدار الدعوة
                    </ConfirmSubmitButton>
                  </form>

                  <form action={cancelCenterInvitation}>
                    <input type="hidden" name="center_id" value={center.id} />
                    <input type="hidden" name="invitation_id" value={pendingInvitation.id} />
                    <ConfirmSubmitButton
                      title="إلغاء الدعوة؟"
                      description="سيتم إبطال الدعوة ومنعها من إنشاء Profile للمركز. إذا لم يبدأ المستلم الإكمال فسيتم تنظيف مستخدم Auth غير المُطالب به."
                      confirmLabel="تأكيد الإلغاء"
                    >
                      إلغاء الدعوة
                    </ConfirmSubmitButton>
                  </form>
                </div>

                {!centerActive ? (
                  <div className="user-role-note">المركز موقوف؛ يمكن إلغاء الدعوة الحالية لكن لا يمكن إعادة إصدارها قبل إعادة تفعيل المركز.</div>
                ) : null}
              </div>
            ) : centerActive ? (
              <form action={sendCenterInvitation} className="operations-form">
                <input type="hidden" name="center_id" value={center.id} />
                <FormField label="البريد الإلكتروني للمستخدم الأول" hint="سيصل إليه رابط آمن لإعداد كلمة المرور والاسم الظاهر. لا يختار الدور أو المركز.">
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    required
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    dir="ltr"
                  />
                </FormField>
                <div className="operations-form-actions is-inline">
                  <button type="submit" className="button button-primary">إرسال دعوة onboarding</button>
                </div>
              </form>
            ) : (
              <div className="user-role-note">المركز موقوف؛ أعد تفعيله أولًا قبل إرسال دعوة الحساب الأول.</div>
            )}
          </FormSection>
        </FormPanel>
      </div>
    </>
  );
}
