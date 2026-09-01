import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export default function PublicRollNotFound() {
  return (
    <section className="container section" aria-labelledby="public-roll-recovery-title">
      <EmptyState
        eyebrow="رمز QR"
        title={<span id="public-roll-recovery-title">تعذر فتح هذا الرمز</span>}
        description={(
          <>
            الرابط غير صالح أو لم يعد قابلًا للقراءة. أعد مسح رمز QR الأصلي بإضاءة واضحة وتأكد من ظهور الرمز كاملًا داخل الكاميرا. لا تعرض هذه الصفحة ما إذا كان رقم أو سجل معين موجودًا داخل النظام.
          </>
        )}
        action={(
          <div className="hero-actions">
            <Link href="/warranty" className="button button-primary">طريقة الوصول إلى الضمان</Link>
            <Link href="/centers" className="button">دليل مراكز التركيب</Link>
          </div>
        )}
      />
    </section>
  );
}
