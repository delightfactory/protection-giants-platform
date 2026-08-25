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
  title: "خدمة الضمان | Protection Giants",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function WarrantyClaimPage({ params }: Props) {
  const { publicCode } = await params;
  const [publicWarranty, access] = await Promise.all([
    resolvePublicWarranty(publicCode),
    getFreshClaimAccess(publicCode),
  ]);

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <CustomerClaimIntake
          publicCode={publicCode}
          initialContext={access?.context ?? null}
          publicProductName={publicWarranty?.productName ?? null}
          publicState={publicWarranty?.state ?? null}
        />
      </div>
    </main>
  );
}
