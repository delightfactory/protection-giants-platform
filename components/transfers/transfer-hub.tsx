import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { TransferStatus, TransferSummary } from "@/lib/transfers/receipt";
import { transferStatusLabel } from "@/lib/transfers/receipt";
import { transferPartyTypeLabel } from "@/lib/transfers/transfer-id";
import styles from "./transfer-hub.module.css";

const dateFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function statusTone(status: TransferStatus): "success" | "neutral" | "warning" | "danger" | "accent" {
  switch (status) {
    case "received": return "success";
    case "partially_received": return "warning";
    case "pending": return "accent";
    case "partially_completed": return "warning";
    case "cancelled":
    case "rejected": return "neutral";
  }
}

function queryHref(input: {
  direction: string;
  scope: string;
  search?: string;
  page?: number;
}): string {
  const params = new URLSearchParams();
  params.set("direction", input.direction);
  params.set("scope", input.scope);
  if (input.search) params.set("q", input.search);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/operations/transfers?${params.toString()}`;
}

export function TransferHub({
  rows,
  direction,
  scope,
  search,
  page,
  pageSize,
  incomingActionCount,
  outgoingActionCount,
  isAdmin,
}: {
  rows: TransferSummary[];
  direction: "incoming" | "outgoing" | "all";
  scope: "active" | "history" | "all";
  search: string;
  page: number;
  pageSize: number;
  incomingActionCount: number;
  outgoingActionCount: number;
  isAdmin: boolean;
}) {
  const matchingCount = rows[0]?.matching_count ?? 0;
  const pageCount = Math.max(1, Math.ceil(matchingCount / pageSize));

  return (
    <section className={styles.hub} aria-label="سجل التحويلات">
      <div className={styles.summaryStrip}>
        <div className={styles.summaryCard} data-attention={incomingActionCount > 0 ? "true" : "false"}>
          <span>واردة تحتاج إجراء</span>
          <strong>{incomingActionCount}</strong>
        </div>
        <div className={styles.summaryCard} data-attention={outgoingActionCount > 0 ? "true" : "false"}>
          <span>صادرة تحتاج متابعة</span>
          <strong>{outgoingActionCount}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>نتائج العرض الحالي</span>
          <strong>{matchingCount}</strong>
        </div>
      </div>

      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="اتجاه التحويل">
          <Link className={styles.tab} data-active={direction === "incoming"} href={queryHref({ direction: "incoming", scope })}>
            الواردة
          </Link>
          <Link className={styles.tab} data-active={direction === "outgoing"} href={queryHref({ direction: "outgoing", scope })}>
            الصادرة
          </Link>
          {isAdmin ? (
            <Link className={styles.tab} data-active={direction === "all"} href={queryHref({ direction: "all", scope })}>
              كل التحويلات
            </Link>
          ) : null}
        </nav>

        <nav className={styles.scopes} aria-label="حالة سجل التحويل">
          <Link className={styles.scope} data-active={scope === "active"} href={queryHref({ direction, scope: "active" })}>
            الجارية
          </Link>
          <Link className={styles.scope} data-active={scope === "history"} href={queryHref({ direction, scope: "history" })}>
            السجل
          </Link>
          <Link className={styles.scope} data-active={scope === "all"} href={queryHref({ direction, scope: "all" })}>
            الكل
          </Link>
        </nav>

        <form className={styles.searchForm} method="get">
          <input type="hidden" name="direction" value={direction} />
          <input type="hidden" name="scope" value={scope} />
          <input
            name="q"
            defaultValue={search}
            placeholder="PG-T-YYYYMMDD-NNNNNNNN"
            aria-label="بحث برقم التحويل الكامل"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="button button-ghost" type="submit">بحث برقم التحويل</button>
        </form>
      </div>

      <div className={styles.list}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            <strong>لا توجد تحويلات في هذا العرض</strong>
            <p>{search ? "راجع رقم التحويل أو غيّر نطاق العرض." : "ستظهر التحويلات هنا عندما توجد حركة مطابقة."}</p>
          </div>
        ) : rows.map((row) => {
          const counterpartyType = direction === "incoming" ? row.sender_party_type : row.recipient_party_type;
          const counterpartyName = direction === "incoming" ? row.sender_name : row.recipient_name;
          const remaining = row.pending_count;
          const taskLabel = direction === "incoming" && row.needs_action
            ? row.status === "partially_received" ? "استكمال الاستلام" : "مراجعة واستلام"
            : row.needs_action ? "مراجعة المتبقي" : "فتح التفاصيل";

          return (
            <Link
              key={row.transfer_id}
              href={`/operations/transfers/${row.transfer_id}`}
              className={styles.card}
              data-attention={row.needs_action ? "true" : "false"}
            >
              <div className={styles.cardTop}>
                <div className={styles.counterparty}>
                  <span>{direction === "incoming" ? "من" : direction === "outgoing" ? "إلى" : "الأطراف"}</span>
                  <strong>{counterpartyName}</strong>
                  <span>{transferPartyTypeLabel(counterpartyType)}</span>
                </div>
                <StatusBadge tone={statusTone(row.status)}>{transferStatusLabel(row.status)}</StatusBadge>
              </div>

              <div className={styles.number}>{row.transfer_number}</div>

              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <span>إجمالي</span>
                  <strong>{row.roll_count}</strong>
                </div>
                <div className={styles.metric}>
                  <span>مستلم</span>
                  <strong>{row.received_count}</strong>
                </div>
                <div className={styles.metric}>
                  <span>متبقي</span>
                  <strong>{remaining}</strong>
                </div>
              </div>

              <div className={styles.cardBottom}>
                <span className={styles.date}>{dateFormatter.format(new Date(row.created_at))}</span>
                <span className={styles.cta}>{taskLabel} ←</span>
              </div>
            </Link>
          );
        })}
      </div>

      {pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="صفحات التحويلات">
          {page > 1 ? (
            <Link className="button button-ghost" href={queryHref({ direction, scope, search, page: page - 1 })}>السابق</Link>
          ) : null}
          {page < pageCount ? (
            <Link className="button button-ghost" href={queryHref({ direction, scope, search, page: page + 1 })}>التالي</Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
