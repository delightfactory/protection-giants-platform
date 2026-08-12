import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DealerCoreFields } from "@/components/dealer-core-fields";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FormPanel, FormSection } from "@/components/ui/form-layout";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskBackLink } from "@/components/ui/task-back-link";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDealerAccount,
  resetDealerAccountPassword,
  setDealerAccountStatus,
  updateDealer,
} from "./actions";

type DealerEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const errorMessages: Record<string, string> = {
  invalid: "راجع البيانات المدخلة واختر وكيل الدولة الصحيح.",
  agent: "وكيل الدولة المحدد غير متاح أو موقوف لهذا النقل.",
  duplicate: "يوجد وكيل أو موزع آخر بنفس الكود.",
  failed: "تعذر حفظ التعديلات. حاول مرة أخرى.",
  "account-invalid": "راجع بيانات الحساب المدخلة وحاول مرة أخرى.",
  "account-dealer-inactive": "لا يمكن إنشاء حساب جديد لموزع موقوف. أعد تفعيل الموزع أولًا.",
  "account-missing": "الحساب المطلوب غير موجود أو لا ينتمي لهذا الموزع.",
  "account-duplicate": "يوجد حساب Auth آخر بنفس البريد الإلكتروني.",
  "account-password": "كلمة المرور غير مقبولة. استخدم كلمة مرور أقوى لا تقل عن 12 حرفًا.",
  "account-auth": "تعذر إنشاء أو تحديث حساب تسجيل الدخول في Supabase Auth.",
  "account-profile": "تعذر تثبيت الربط التشغيلي للحساب، ولذلك تم التراجع عن حساب Auth الجديد.",
  "account-status-auth": "تعذر تغيير حالة تسجيل الدخول للحساب.",
  "account-status-profile": "تعذر حفظ الحالة التشغيلية وتمت محاولة إعادة حالة Auth السابقة.",
};

const successMessages: Record<string, string> = {
  "account-created": "تم إنشاء حساب الموزع وربطه بهذا الكيان بنجاح.",
  "account-status": "تم تحديث حالة حساب الموزع في Auth والملف التشغيلي.",
  "account-password": "تم تعيين كلمة المرور الجديدة للحساب.",
};

export default async function DealerEditPage({ params, searchParams }: DealerEditPageProps) {
  const profile = await requireOperationalProfile();
  if (profile.role !== "admin" && profile.role !== "agent") redirect("/access-denied");

  const { id } = await params;
  const { error, success } = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const [dealerResult, agentsResult, partyResult] = await Promise.all([
    supabase
      .from("dealers")
      .select("id, code, name, country_code, country_agent_id, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("country_agents")
      .select("id, code, name, country_code, status")
      .order("name"),
    supabase
      .from("operational_parties")
      .select("transfer_code")
      .eq("dealer_id", id)
      .maybeSingle(),
  ]);

  if (dealerResult.error) throw dealerResult.error;
  if (agentsResult.error) throw agentsResult.error;
  if (partyResult.error) throw partyResult.error;
  if (!dealerResult.data) notFound();

  const dealer = dealerResult.data;
  const agents = agentsResult.data.filter(
    (agent) => agent.status === "active" || agent.id === dealer.country_agent_id,
  );

  if (profile.role === "agent" && dealer.country_agent_id !== profile.country_agent_id) {
    notFound();
  }

  // The normal RLS-scoped Dealer read above is the authorization proof. Only
  // after that proof do we use the privileged client, restricted to this Dealer.
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: accountProfiles, error: accountProfilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, phone, status, role, country_agent_id, dealer_id, installation_center_id")
    .eq("role", "dealer")
    .eq("dealer_id", dealer.id)
    .order("created_at", { ascending: true });

  if (accountProfilesError) throw accountProfilesError;

  const dealerAccounts = await Promise.all(
    accountProfiles.map(async (account) => {
      const { data, error: authError } = await supabaseAdmin.auth.admin.getUserById(account.id);
      return {
        ...account,
        email: authError ? null : data.user?.email ?? null,
      };
    }),
  );

  const errorMessage = error ? errorMessages[error] : undefined;
  const successMessage = success ? successMessages[success] : undefined;
  const dealerActive = dealer.status === "active";

  return (
    <>
      <PageHeader
        eyebrow="الوكلاء والموزعون"
        title={dealer.name}
        description="تعديل هوية الموزع وإدارة حسابات الدخول المرتبطة به داخل نفس النطاق التشغيلي."
        meta={partyResult.data?.transfer_code ? <span dir="ltr">Transfer ID: {partyResult.data.transfer_code}</span> : undefined}
        actions={<TaskBackLink href="/operations/dealers" label="العودة للوكلاء" />}
      />

      {errorMessage ? <FeedbackBanner tone="error">{errorMessage}</FeedbackBanner> : null}
      {successMessage ? <FeedbackBanner tone="success">{successMessage}</FeedbackBanner> : null}

      <div className="user-settings-stack">
        <FormPanel>
          <form action={updateDealer} className="operations-form">
            <input type="hidden" name="dealer_id" value={dealer.id} />
            <FormSection
              title="بيانات الوكيل"
              description={profile.role === "admin"
                ? "يمكن للإدارة نقل الموزع إلى وكيل دولة آخر نشط؛ الدولة ستتغير تلقائيًا مع الوكيل الجديد."
                : "يمكنك تعديل بيانات الموزع داخل نطاقك، ولا يمكنك نقله إلى وكيل دولة آخر."}
            >
              <DealerCoreFields
                agents={agents}
                lockAgent={profile.role === "agent"}
                values={{
                  code: dealer.code,
                  name: dealer.name,
                  countryAgentId: dealer.country_agent_id,
                }}
              />
            </FormSection>

            <div className="operations-form-actions">
              <button type="submit" className="button button-primary">حفظ التعديلات</button>
              <Link href="/operations/dealers" className="button button-ghost">إلغاء</Link>
            </div>
          </form>
        </FormPanel>

        <FormPanel>
          <FormSection
            title="حسابات الموزع"
            description="هذه الحسابات ثابتة على هذا الموزع. لا تمنح هذه الشاشة وصولًا إلى حسابات موزعين آخرين."
          >
            {dealerAccounts.length === 0 ? (
              <div className="user-role-note">لا توجد حسابات دخول مرتبطة بهذا الموزع حتى الآن.</div>
            ) : (
              <RecordList label="حسابات الموزع">
                {dealerAccounts.map((account) => {
                  const isActive = account.status === "active";
                  return (
                    <RecordItem
                      key={account.id}
                      kicker="حساب موزع"
                      title={account.display_name}
                      subtitle={<span dir="ltr">{account.email ?? "البريد غير متاح"}</span>}
                      facts={[
                        { label: "الهاتف", value: account.phone ?? "غير مسجل", dir: account.phone ? "ltr" : undefined },
                      ]}
                      status={
                        <StatusBadge tone={isActive ? "success" : "neutral"}>
                          {isActive ? "نشط" : "موقوف"}
                        </StatusBadge>
                      }
                      actions={
                        <>
                          <form action={setDealerAccountStatus}>
                            <input type="hidden" name="dealer_id" value={dealer.id} />
                            <input type="hidden" name="user_id" value={account.id} />
                            <input type="hidden" name="target_status" value={isActive ? "suspended" : "active"} />
                            {isActive ? (
                              <ConfirmSubmitButton
                                title="إيقاف حساب الموزع؟"
                                description="سيتم منع تسجيل الدخول وإيقاف الملف التشغيلي لهذا الحساب فقط، دون تغيير حالة الموزع نفسه."
                                confirmLabel="تأكيد الإيقاف"
                              >
                                إيقاف الحساب
                              </ConfirmSubmitButton>
                            ) : (
                              <button type="submit" className="button button-primary">إعادة التفعيل</button>
                            )}
                          </form>

                          <form action={resetDealerAccountPassword} className="operations-form">
                            <input type="hidden" name="dealer_id" value={dealer.id} />
                            <input type="hidden" name="user_id" value={account.id} />
                            <input
                              name="new_password"
                              type="password"
                              minLength={12}
                              maxLength={128}
                              required
                              autoComplete="new-password"
                              dir="ltr"
                              aria-label={`كلمة مرور جديدة لحساب ${account.display_name}`}
                              placeholder="كلمة مرور جديدة"
                            />
                            <button type="submit" className="button button-ghost">تعيين كلمة المرور</button>
                          </form>
                        </>
                      }
                    />
                  );
                })}
              </RecordList>
            )}
          </FormSection>
        </FormPanel>

        <FormPanel>
          <form action={createDealerAccount} className="operations-form">
            <input type="hidden" name="dealer_id" value={dealer.id} />
            <FormSection
              title="إنشاء حساب للموزع"
              description={dealerActive
                ? "أنشئ حسابًا إضافيًا ثابت الدور والارتباط بهذا الموزع."
                : "الموزع موقوف؛ أعد تفعيله أولًا قبل إنشاء حساب دخول جديد."}
            >
              {dealerActive ? (
                <FormGrid>
                  <FormField label="الاسم الظاهر">
                    <input name="display_name" type="text" minLength={2} maxLength={120} required autoComplete="name" />
                  </FormField>
                  <FormField label="البريد الإلكتروني">
                    <input name="email" type="email" maxLength={254} required autoComplete="email" inputMode="email" dir="ltr" />
                  </FormField>
                  <FormField label="رقم الهاتف" optional>
                    <input name="phone" type="tel" minLength={5} maxLength={32} autoComplete="tel" inputMode="tel" dir="ltr" />
                  </FormField>
                  <FormField label="كلمة المرور المؤقتة" hint="12 حرفًا على الأقل.">
                    <input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password" dir="ltr" />
                  </FormField>
                </FormGrid>
              ) : (
                <div className="user-role-note">إنشاء الحسابات متوقف مؤقتًا لأن حالة الموزع موقوفة.</div>
              )}
            </FormSection>

            {dealerActive ? (
              <div className="operations-form-actions is-inline">
                <button type="submit" className="button button-primary">إنشاء حساب للموزع</button>
              </div>
            ) : null}
          </form>
        </FormPanel>
      </div>
    </>
  );
}
