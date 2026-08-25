import { LocalDateTime } from "@/components/ui/local-date-time";
import styles from "./warranty-audit-timeline.module.css";

type WarrantyAuditEvent = {
  event_id: string;
  event_kind: string;
  actor_profile_id: string;
  reason: string | null;
  change_snapshot: unknown;
  created_at: string;
};

const fieldLabels: Record<string, string> = {
  customer_name: "اسم العميل",
  customer_phone: "هاتف العميل",
  customer_email: "البريد الإلكتروني",
  vehicle_make: "ماركة السيارة",
  vehicle_model: "موديل السيارة",
  vehicle_year: "سنة الموديل",
  vehicle_plate: "رقم اللوحة",
  vehicle_color: "اللون",
  vehicle_vin: "VIN / رقم الشاسيه",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

function eventTitle(kind: string) {
  if (kind === "activated") return "تم تفعيل الضمان";
  if (kind === "details_corrected") return "تم تصحيح بيانات العميل/السيارة";
  if (kind === "voided_in_error") return "تم إلغاء التفعيل المسجل بالخطأ";
  return "حدث تدقيق";
}

function changedFields(snapshot: unknown) {
  const root = asRecord(snapshot);
  const before = asRecord(root?.before);
  const after = asRecord(root?.after);
  if (!before || !after) return [];

  return Object.keys(fieldLabels)
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({
      field,
      label: fieldLabels[field],
      before: displayValue(before[field]),
      after: displayValue(after[field]),
    }));
}

export function WarrantyAuditTimeline({ events }: { events: WarrantyAuditEvent[] }) {
  return (
    <section className={styles.card} aria-label="سجل تدقيق الضمان">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Admin audit</span>
          <h2>سجل التدقيق</h2>
        </div>
        <span className={styles.count}>{events.length} حدث</span>
      </div>

      {events.length === 0 ? (
        <p className={styles.empty}>لا توجد أحداث تدقيق مسجلة لهذا الضمان.</p>
      ) : (
        <ol className={styles.timeline}>
          {events.map((event) => {
            const changes = event.event_kind === "details_corrected" ? changedFields(event.change_snapshot) : [];
            return (
              <li key={event.event_id} className={styles.event}>
                <div className={styles.eventHeader}>
                  <strong>{eventTitle(event.event_kind)}</strong>
                  <LocalDateTime value={event.created_at} />
                </div>
                <div className={styles.meta}>
                  <span>معرف المنفذ</span>
                  <code dir="ltr">{event.actor_profile_id}</code>
                </div>
                {event.reason ? <p className={styles.reason}><strong>السبب:</strong> {event.reason}</p> : null}
                {changes.length > 0 ? (
                  <dl className={styles.changes}>
                    {changes.map((change) => (
                      <div key={change.field}>
                        <dt>{change.label}</dt>
                        <dd>
                          <span className={styles.before} dir="auto">{change.before}</span>
                          <span aria-hidden="true">←</span>
                          <span className={styles.after} dir="auto">{change.after}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
