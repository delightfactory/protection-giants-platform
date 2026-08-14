import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { CopyTransferIdButton } from "@/components/transfers/copy-transfer-id-button";
import { TransferHub } from "@/components/transfers/transfer-hub";
import { TransferIdQr } from "@/components/transfers/transfer-id-qr";
import surfaces from "@/components/transfers/transfer-surfaces.module.css";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { getCurrentTransferParty } from "@/lib/transfers/current-party.server";
import { getTransferAttentionCounts, listTransfers } from "@/lib/transfers/receipt.server";
import { transferPartyTypeLabel } from "@/lib/transfers/transfer-id";

const PAGE_SIZE = 30;
type Direction = "incoming" | "outgoing" | "all";
type Scope = "active" | "history" | "all";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validDirection(value: string, isAdmin: boolean): Direction {
  if (value === "outgoing") return "outgoing";
  if (value === "all" && isAdmin) return "all";
  return "incoming";
}

function validScope(value: string): Scope {
  return value === "history" || value === "all" ? value : "active";
}

function validSearch(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^PG-T-[0-9]{8}-[0-9]{8}$/.test(normalized) ? normalized : "";
}

function validPage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireOperationalProfile();
  const party = await getCurrentTransferParty(profile);
  const params = await searchParams;
  const isAdmin = profile.role === "admin";
  const direction = validDirection(first(params.direction), isAdmin);
  const scope = validScope(first(params.scope));
  const search = validSearch(first(params.q));
  const page = validPage(first(params.page));

  const [attentionCounts, rows] = await Promise.all([
    getTransferAttentionCounts(),
    listTransfers({
      direction,
      scope,
      search: search || null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="حركة العهدة"
        title="تحويلات اللفات"
        description="أرسل اللفات وتابع الوارد والصادر حتى يثبت الاستلام الفعلي وتنتقل العهدة المؤكدة."
        actions={<Link className="button button-primary" href="/operations/transfers/new">إرسال تحويل</Link>}
      />

      <div className={surfaces.landingGrid}>
        <section className={surfaces.identityPanel} aria-labelledby="party-transfer-id-title">
          <div className={surfaces.identityCopy}>
            <p className={surfaces.kicker}>{transferPartyTypeLabel(party.partyType)}</p>
            <h2 id="party-transfer-id-title">Transfer ID الخاص بجهتك</h2>
            <p>شارك هذا المعرّف أو الـQR عندما تريد من جهة أخرى إرسال لفات إلى جهتك. المعرّف يحدد المستلم فقط ولا يمنح صلاحية أو ينقل عهدة بمفرده.</p>
            <code className={surfaces.code}>{party.transferCode}</code>
            <div className={surfaces.actions}>
              <CopyTransferIdButton transferCode={party.transferCode} />
            </div>
          </div>
          <TransferIdQr transferCode={party.transferCode} />
        </section>

        <section className={surfaces.actionPanel} aria-labelledby="new-transfer-title">
          <div>
            <p className={surfaces.kicker}>إجراء تشغيلي</p>
            <h2 id="new-transfer-title">إرسال لفات</h2>
            <p>حدد المستلم بدقة واختر اللفات الموجودة فعليًا في عهدتك، ثم يظل التحويل محجوزًا حتى يؤكد المستلم ما وصل إليه.</p>
          </div>
          <Link href="/operations/transfers/new" className={`button button-primary ${surfaces.primary}`}>
            إرسال تحويل جديد
          </Link>
        </section>
      </div>

      <div className={surfaces.note}>
        التحويل المعلّق لا يغيّر العهدة المؤكدة. انتقال العهدة يحدث فقط لللفات التي يؤكد المستلم استلامها.
      </div>

      <TransferHub
        rows={rows}
        direction={direction}
        scope={scope}
        search={search}
        page={page}
        pageSize={PAGE_SIZE}
        incomingActionCount={attentionCounts.incomingActionCount}
        outgoingActionCount={attentionCounts.outgoingActionCount}
        isAdmin={isAdmin}
      />
    </>
  );
}
