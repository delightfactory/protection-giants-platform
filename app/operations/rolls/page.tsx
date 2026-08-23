import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterActions, FilterBar, FilterField, FilterGrid } from "@/components/ui/filter-bar";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { PageHeader } from "@/components/ui/page-header";
import { RecordItem, RecordList } from "@/components/ui/record-list";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const internalSerialPattern = /^PG-R-[0-9]{8}-[0-9]{8}-[0-9]{2}-[0-9]{4,5}$/;
const erpSerialPattern = /^ERP-[A-F0-9]{16}$/;
const PAGE_SIZE = 100;
const MAX_PAGE = 100000;

type RollsPageProps = {
  searchParams: Promise<{ q?: string; order?: string; page?: string }>;
};

const orderFields = "id, order_number, production_date, product_id, product_code_snapshot, product_name_snapshot, status";

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_PAGE) : 1;
}

function rollsHref(search: string, orderFilter: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (orderFilter) params.set("order", orderFilter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/operations/rolls${query ? `?${query}` : ""}`;
}

function formatCustodyDate(value: string | undefined) {
  return value ? <LocalDateTime value={value} /> : "—";
}

export default async function RollsPage({ searchParams }: RollsPageProps) {
  const profile = await requireOperationalProfile();
  const isAdmin = profile.role === "admin";
  const params = await searchParams;
  const search = (params.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 80);
  const orderFilter = isAdmin && uuidPattern.test(params.order ?? "") ? params.order ?? "" : "";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createSupabaseServerClient();

  let canRecoverOpenedRoll = isAdmin;
  if (profile.role === "agent") {
    const { data: agentRecovery, error: agentRecoveryError } = await supabase
      .from("country_agents")
      .select("opened_roll_recovery_enabled")
      .eq("id", profile.country_agent_id)
      .maybeSingle();
    if (agentRecoveryError) throw agentRecoveryError;
    canRecoverOpenedRoll = Boolean(agentRecovery?.opened_roll_recovery_enabled);
  }

  let recentOrders: Array<{
    id: string;
    order_number: string;
    production_date: string;
    product_id: string;
    product_code_snapshot: string;
    product_name_snapshot: string;
    status: string;
  }> = [];

  if (isAdmin) {
    const { data, error } = await supabase
      .from("production_orders")
      .select(orderFields)
      .order("created_at", { ascending: false })
      .order("order_number", { ascending: false })
      .limit(100);
    if (error) throw error;
    recentOrders = data;
  }

  let rollsQuery = supabase
    .from("rolls")
    .select("id, product_id, production_order_id, production_lot_id, roll_index, serial_number, erp_serial, created_at")
    .order("created_at", { ascending: false })
    .order("serial_number", { ascending: true });

  if (search) {
    if (internalSerialPattern.test(search)) {
      rollsQuery = rollsQuery.eq("serial_number", search);
    } else if (erpSerialPattern.test(search)) {
      rollsQuery = rollsQuery.eq("erp_serial", search);
    } else {
      rollsQuery = rollsQuery.or(`serial_number.like.${search}%,erp_serial.like.${search}%`);
    }
  }
  if (orderFilter) rollsQuery = rollsQuery.eq("production_order_id", orderFilter);

  const { data: rollRows, error } = await rollsQuery.range(offset, offset + PAGE_SIZE);
  if (error) throw error;

  const hasNext = rollRows.length > PAGE_SIZE;
  const rolls = hasNext ? rollRows.slice(0, PAGE_SIZE) : rollRows;
  const hasPrevious = page > 1;
  const rollIds = rolls.map((roll) => roll.id);
  const lotIds = [...new Set(rolls.map((roll) => roll.production_lot_id))];
  const productIds = [...new Set(rolls.map((roll) => roll.product_id))];
  const referencedOrderIds = [...new Set(rolls.map((roll) => roll.production_order_id))];

  const custodyResult = rollIds.length
    ? await supabase
        .from("roll_custody_current")
        .select("roll_id, custodian_party_id, confirmed_at")
        .in("roll_id", rollIds)
    : { data: [], error: null };
  if (custodyResult.error) throw custodyResult.error;
  const custodyByRoll = new Map(custodyResult.data.map((row) => [row.roll_id, row]));

  const openingResult = rollIds.length && (isAdmin || profile.role === "center")
    ? await supabase
        .from("roll_openings")
        .select("roll_id, opened_at")
        .in("roll_id", rollIds)
    : { data: [], error: null };
  if (openingResult.error) throw openingResult.error;
  const openingByRoll = new Map(openingResult.data.map((row) => [row.roll_id, row]));

  let productsById = new Map<string, { code: string; name: string }>();
  if (!isAdmin && productIds.length) {
    const productsResult = await supabase
      .from("products")
      .select("id, code, name")
      .in("id", productIds);
    if (productsResult.error) throw productsResult.error;
    productsById = new Map(productsResult.data.map((product) => [product.id, product]));
  }

  let ordersById = new Map<string, (typeof recentOrders)[number]>();
  let dropdownOrders = recentOrders;
  let lotsById = new Map<string, { id: string; lot_number: string }>();

  if (isAdmin) {
    const selectedOrderIsRecent = Boolean(orderFilter && recentOrders.some((order) => order.id === orderFilter));

    const lotsResult = lotIds.length
      ? await supabase.from("production_lots").select("id, lot_number").in("id", lotIds)
      : { data: [], error: null };
    if (lotsResult.error) throw lotsResult.error;

    const referencedOrdersResult = referencedOrderIds.length
      ? await supabase
          .from("production_orders")
          .select(orderFields)
          .in("id", referencedOrderIds)
      : { data: [], error: null };
    if (referencedOrdersResult.error) throw referencedOrdersResult.error;

    const selectedOrderResult = orderFilter && !selectedOrderIsRecent
      ? await supabase
          .from("production_orders")
          .select(orderFields)
          .eq("id", orderFilter)
          .maybeSingle()
      : { data: null, error: null };
    if (selectedOrderResult.error) throw selectedOrderResult.error;

    const allKnownOrders = [
      ...recentOrders,
      ...referencedOrdersResult.data,
      ...(selectedOrderResult.data ? [selectedOrderResult.data] : []),
    ];
    ordersById = new Map(allKnownOrders.map((order) => [order.id, order]));
    dropdownOrders = [...ordersById.values()]
      .sort((a, b) => b.production_date.localeCompare(a.production_date) || b.order_number.localeCompare(a.order_number))
      .slice(0, selectedOrderResult.data ? 101 : 100);
    lotsById = new Map(lotsResult.data.map((lot) => [lot.id, lot]));
  }

  const partyIds = isAdmin
    ? [...new Set(custodyResult.data.map((row) => row.custodian_party_id))]
    : [];
  const partyLabels = new Map<string, string>();

  if (isAdmin && partyIds.length) {
    const partiesResult = await supabase
      .from("operational_parties")
      .select("id, party_type, country_agent_id, dealer_id, installation_center_id, transfer_code")
      .in("id", partyIds);
    if (partiesResult.error) throw partiesResult.error;

    const agentIds = partiesResult.data.flatMap((party) => party.country_agent_id ? [party.country_agent_id] : []);
    const dealerIds = partiesResult.data.flatMap((party) => party.dealer_id ? [party.dealer_id] : []);
    const centerIds = partiesResult.data.flatMap((party) => party.installation_center_id ? [party.installation_center_id] : []);

    const agentNames = new Map<string, string>();
    const dealerNames = new Map<string, string>();
    const centerNames = new Map<string, string>();

    if (agentIds.length) {
      const result = await supabase.from("country_agents").select("id, name").in("id", agentIds);
      if (result.error) throw result.error;
      for (const row of result.data) agentNames.set(row.id, row.name);
    }
    if (dealerIds.length) {
      const result = await supabase.from("dealers").select("id, name").in("id", dealerIds);
      if (result.error) throw result.error;
      for (const row of result.data) dealerNames.set(row.id, row.name);
    }
    if (centerIds.length) {
      const result = await supabase.from("installation_centers").select("id, name").in("id", centerIds);
      if (result.error) throw result.error;
      for (const row of result.data) centerNames.set(row.id, row.name);
    }

    for (const party of partiesResult.data) {
      let label = "Protection Giants";
      if (party.party_type === "agent" && party.country_agent_id) {
        label = agentNames.get(party.country_agent_id) ?? "وكيل دولة";
      } else if (party.party_type === "dealer" && party.dealer_id) {
        label = dealerNames.get(party.dealer_id) ?? "موزع";
      } else if (party.party_type === "center" && party.installation_center_id) {
        label = centerNames.get(party.installation_center_id) ?? "مركز تركيب";
      }
      partyLabels.set(party.id, label);
    }
  }

  const filtersActive = Boolean(search || orderFilter);

  return (
    <>
      <PageHeader
        eyebrow="العهدة"
        title={isAdmin ? "سجل عهدة اللفات" : "اللفات في عهدتك"}
        description={isAdmin
          ? "اعرض كل لفة وهوية حامل العهدة المؤكدة حاليًا، مع الاحتفاظ ببيانات الإنتاج كسجل مرجعي."
          : "تظهر هنا فقط اللفات المؤكدة حاليًا في عهدة جهتك التشغيلية."}
        meta={`صفحة ${page.toLocaleString("en-US")} · ${rolls.length.toLocaleString("en-US")} لفة${hasNext ? " · يوجد المزيد" : ""}`}
        actions={(
          <>
            {profile.role === "center" ? (
              <Link href="/operations/rolls/open" className="button button-primary">فتح رول</Link>
            ) : (
              <Link href="/operations/transfers/new" className="button button-primary">تحويل لفات</Link>
            )}
            {profile.role === "center" ? (
              <Link href="/operations/transfers/new" className="button button-ghost">تحويل لفات</Link>
            ) : null}
            {canRecoverOpenedRoll ? (
              <Link href="/operations/rolls/recovery" className="button button-ghost">استرداد رول مفتوح</Link>
            ) : null}
            {isAdmin ? <Link href="/operations/production-orders" className="button button-ghost">أوامر الإنتاج</Link> : null}
          </>
        )}
      />

      <FilterBar label="البحث في العهدة">
        <form method="get">
          <FilterGrid>
            <FilterField label="Serial / ERP Serial" wide>
              <input name="q" type="search" defaultValue={search} placeholder="PG-R-... أو ERP-..." dir="ltr" />
            </FilterField>
            {isAdmin ? (
              <FilterField label="أمر الإنتاج">
                <select name="order" defaultValue={orderFilter}>
                  <option value="">كل الأوامر</option>
                  {dropdownOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_number}{order.status === "voided" ? " — مُبطل" : ""}
                    </option>
                  ))}
                </select>
              </FilterField>
            ) : null}
            <FilterActions>
              <button type="submit" className="button button-primary">بحث</button>
              {filtersActive ? <Link href="/operations/rolls" className="button button-ghost">مسح</Link> : null}
            </FilterActions>
          </FilterGrid>
        </form>
      </FilterBar>

      {rolls.length === 0 ? (
        <EmptyState
          eyebrow="عهدة اللفات"
          title={hasPrevious
            ? "لا توجد لفات في هذه الصفحة"
            : filtersActive
              ? "لم يتم العثور على لفة مطابقة"
              : isAdmin
                ? "لا توجد لفات مولّدة بعد"
                : "لا توجد لفات في عهدتك حاليًا"}
          description={hasPrevious
            ? "ارجع للصفحة السابقة أو غيّر معايير البحث."
            : filtersActive
              ? "راجع الرقم ثم أعد البحث."
              : isAdmin
                ? "تظهر العهدة تلقائيًا عند إنشاء أول أمر إنتاج."
                : "ستظهر اللفات هنا عندما تصبح عهدتها مؤكدة لجهتك في مسار التشغيل."}
          action={hasPrevious
            ? <Link href={rollsHref(search, orderFilter, page - 1)} className="button button-ghost">الصفحة السابقة</Link>
            : filtersActive
              ? <Link href="/operations/rolls" className="button button-ghost">عرض العهدة</Link>
              : isAdmin
                ? <Link href="/operations/production-orders/new" className="button button-primary">إنشاء أمر إنتاج</Link>
                : profile.role === "center"
                  ? <Link href="/operations/rolls/open" className="button button-primary">فتح رول</Link>
                  : undefined}
        />
      ) : (
        <>
          <RecordList label="قائمة عهدة اللفات">
            {rolls.map((roll) => {
              const custody = custodyByRoll.get(roll.id);
              const opening = openingByRoll.get(roll.id);
              const order = ordersById.get(roll.production_order_id);
              const lot = lotsById.get(roll.production_lot_id);
              const product = productsById.get(roll.product_id);
              const isVoided = order?.status === "voided";
              const custodyLabel = isAdmin
                ? custody ? partyLabels.get(custody.custodian_party_id) ?? "جهة تشغيلية" : "غير مسجلة"
                : "جهتك التشغيلية";

              const facts = isAdmin
                ? [
                    { label: "ERP Serial", value: roll.erp_serial, dir: "ltr" as const },
                    { label: "العهدة الحالية", value: custodyLabel, dir: "rtl" as const },
                    { label: "تأكيد العهدة", value: formatCustodyDate(custody?.confirmed_at), dir: "ltr" as const },
                    { label: "فتح الرول", value: opening ? formatCustodyDate(opening.opened_at) : "—", dir: "ltr" as const },
                    { label: "Lot", value: lot?.lot_number ?? "—", dir: lot ? "ltr" as const : "rtl" as const },
                    { label: "أمر الإنتاج", value: order?.order_number ?? "—", dir: order ? "ltr" as const : "rtl" as const },
                  ]
                : [
                    { label: "ERP Serial", value: roll.erp_serial, dir: "ltr" as const },
                    { label: "العهدة الحالية", value: custodyLabel, dir: "rtl" as const },
                    { label: "تأكيد العهدة", value: formatCustodyDate(custody?.confirmed_at), dir: "ltr" as const },
                    ...(profile.role === "center"
                      ? [{ label: "فتح الرول", value: opening ? formatCustodyDate(opening.opened_at) : "لم يُفتح", dir: "ltr" as const }]
                      : []),
                    { label: "ترتيب اللفة", value: roll.roll_index.toLocaleString("en-US"), dir: "ltr" as const },
                  ];

              return (
                <RecordItem
                  key={roll.id}
                  kicker={isAdmin
                    ? order ? <span dir="ltr">{order.product_code_snapshot}</span> : undefined
                    : product ? <span dir="ltr">{product.code}</span> : undefined}
                  title={<span dir="ltr">{roll.serial_number}</span>}
                  subtitle={isAdmin ? order?.product_name_snapshot : product?.name}
                  facts={facts}
                  status={opening
                    ? <StatusBadge tone="warning">مفتوح</StatusBadge>
                    : isAdmin
                      ? !custody
                        ? <StatusBadge tone="danger">عهدة غير مكتملة</StatusBadge>
                        : <StatusBadge tone={isVoided ? "danger" : "success"}>{isVoided ? "أمر مُبطل" : "عهدة مؤكدة"}</StatusBadge>
                      : <StatusBadge tone="success">في عهدتك</StatusBadge>}
                  actions={isAdmin && order
                    ? <Link href={`/operations/production-orders/${order.id}`} className="button button-ghost">فتح الأمر</Link>
                    : undefined}
                />
              );
            })}
          </RecordList>

          {(hasPrevious || hasNext) ? (
            <nav className="production-pagination" aria-label="صفحات عهدة اللفات">
              {hasPrevious ? <Link href={rollsHref(search, orderFilter, page - 1)} className="button button-ghost">السابق</Link> : <span />}
              <span>صفحة {page.toLocaleString("en-US")}</span>
              {hasNext ? <Link href={rollsHref(search, orderFilter, page + 1)} className="button button-ghost">التالي</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
