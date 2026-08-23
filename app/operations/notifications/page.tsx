import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import {
  getNotificationUnreadCount,
  listInboxNotifications,
  NOTIFICATION_PAGE_SIZE,
  type InboxNotification,
} from "@/lib/notifications/inbox.server";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  openNotificationAction,
} from "./actions";
import styles from "./notifications.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validPage(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function sourceLabel(sourceDomain: string) {
  const labels: Record<string, string> = {
    roll_transfer: "تحويلات العهدة",
    roll_transfers: "تحويلات العهدة",
    center_location: "مواقع المراكز",
    center_network_approval: "اعتماد المراكز",
    center_onboarding: "انضمام المراكز",
    roll_preinstall_issue: "بلاغات ما قبل التركيب",
  };
  return labels[sourceDomain] ?? "تنبيه تشغيلي";
}

function attentionPresentation(attention: InboxNotification["attention_level"]) {
  if (attention === "action_required") {
    return { label: "إجراء مطلوب", className: `${styles.attention} ${styles.attentionAction}` };
  }
  if (attention === "warning") {
    return { label: "تنبيه", className: `${styles.attention} ${styles.attentionWarning}` };
  }
  return { label: "للعلم", className: styles.attention };
}

function feedbackMessage(code: string) {
  if (code === "read-all") return "تعذر تحديث حالة كل الإشعارات. حاول مرة أخرى.";
  if (code === "read") return "تعذر تحديث حالة الإشعار. حاول مرة أخرى.";
  if (code === "notification") return "الإشعار غير متاح أو لم يعد ضمن نطاق حسابك.";
  return "";
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireOperationalProfile();
  const params = await searchParams;
  const page = validPage(first(params.page));
  const errorMessage = feedbackMessage(first(params.error));

  const [notifications, unreadCount] = await Promise.all([
    listInboxNotifications({
      limit: NOTIFICATION_PAGE_SIZE,
      offset: (page - 1) * NOTIFICATION_PAGE_SIZE,
    }),
    getNotificationUnreadCount(),
  ]);

  const hasNextPage = notifications.length === NOTIFICATION_PAGE_SIZE;

  return (
    <>
      <PageHeader
        eyebrow="متابعة العمل"
        title="الإشعارات"
        description="كل التنبيهات التشغيلية المرتبطة بحسابك في مكان واحد. قراءة الإشعار لا تعني تنفيذ الإجراء المطلوب داخله."
      />

      {errorMessage ? (
        <div className={styles.feedback} role="alert">{errorMessage}</div>
      ) : null}

      <section className={styles.toolbar} aria-label="ملخص الإشعارات">
        <div className={styles.toolbarCopy}>
          {unreadCount > 0 ? (
            <span>لديك <strong>{unreadCount}</strong> إشعار غير مقروء.</span>
          ) : (
            <span>لا توجد إشعارات غير مقروءة حاليًا.</span>
          )}
        </div>
        {unreadCount > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="button button-secondary">تحديد الكل كمقروء</button>
          </form>
        ) : null}
      </section>

      <div className={styles.stack}>
        {notifications.length === 0 ? (
          <section className={styles.empty}>
            <h2>{page === 1 ? "لا توجد إشعارات حتى الآن" : "لا توجد إشعارات في هذه الصفحة"}</h2>
            <p>
              {page === 1
                ? "ستظهر هنا التنبيهات المرتبطة بالتحويلات واعتمادات المراكز والحالات التشغيلية المهمة عندما تحدث."
                : "يمكنك الرجوع إلى الصفحة السابقة لمتابعة سجل الإشعارات."}
            </p>
          </section>
        ) : (
          <div className={styles.list} aria-label="قائمة الإشعارات">
            {notifications.map((notification) => {
              const unread = !notification.read_at;
              const attention = attentionPresentation(notification.attention_level);

              return (
                <article
                  key={notification.id}
                  className={`${styles.card} ${unread ? styles.cardUnread : ""}`}
                  aria-label={`${unread ? "غير مقروء، " : ""}${notification.title}`}
                >
                  <div className={styles.content}>
                    <div className={styles.meta}>
                      <span className={styles.source}>{sourceLabel(notification.source_domain)}</span>
                      <span className={attention.className}>{attention.label}</span>
                      {unread ? <span className={styles.state}>غير مقروء</span> : null}
                    </div>
                    <h2 className={styles.title}>{notification.title}</h2>
                    <p className={styles.body}>{notification.body}</p>
                    <LocalDateTime value={notification.created_at} className={styles.time} />
                  </div>

                  <div className={styles.actions}>
                    {notification.action_path ? (
                      <form action={openNotificationAction}>
                        <input type="hidden" name="notification_id" value={notification.id} />
                        <button type="submit" className={styles.actionButton}>
                          {unread ? "فتح والاطلاع" : "فتح التفاصيل"}
                        </button>
                      </form>
                    ) : unread ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notification_id" value={notification.id} />
                        <button type="submit" className={styles.readButton}>تم الاطلاع</button>
                      </form>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {(page > 1 || hasNextPage) ? (
        <nav className={styles.pagination} aria-label="صفحات الإشعارات">
          {page > 1 ? (
            <Link href={`/operations/notifications?page=${page - 1}`}>الأحدث</Link>
          ) : (
            <span aria-disabled="true">الأحدث</span>
          )}
          {hasNextPage ? (
            <Link href={`/operations/notifications?page=${page + 1}`}>الأقدم</Link>
          ) : (
            <span aria-disabled="true">الأقدم</span>
          )}
        </nav>
      ) : null}
    </>
  );
}
