import type { Metadata } from "next";
import { getFreshClaimAccess } from "@/lib/warranty/claim-access.server";
import { resolvePublicWarranty } from "@/lib/warranty/public-warranty";
import CustomerClaimIntake from "./claim-client";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  params: Promise<{ publicCode: string }>;
};

export const metadata: Metadata = {
  title: "تقديم مطالبة ضمان",
  description: "تقديم مطالبة ضمان رسمية لعملاء Protection Giants.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function WarrantyClaimPage({ params }: Props) {
  const { publicCode } = await params;
  const [publicWarranty, access] = await Promise.all([
    resolvePublicWarranty(publicCode),
    getFreshClaimAccess(publicCode),
  ]);

  const publicProductName =
    publicWarranty.kind === "active"
    || publicWarranty.kind === "expired"
    || publicWarranty.kind === "not_activated"
    || publicWarranty.kind === "no_current_warranty_after_void"
    || publicWarranty.kind === "unavailable_for_warranty"
      ? publicWarranty.productName
      : null;

  return (
    <section className={styles.page}>
      <div className={styles.wrap}>
        <CustomerClaimIntake
          publicCode={publicCode}
          initialContext={access?.context ?? null}
          publicProductName={publicProductName}
          publicState={publicWarranty.kind === "not_found" ? null : publicWarranty.kind}
        />
      </div>
    </section>
  );
}
