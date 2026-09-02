import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function RootNotFound() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="main-content">
        <section className="container section" aria-labelledby="root-not-found-title">
          <EmptyState
            eyebrow="Protection Giants"
            headingLevel={1}
            title={<span id="root-not-found-title">الصفحة غير متاحة</span>}
            description="قد يكون الرابط غير مكتمل أو لم يعد صالحًا. يمكنك العودة إلى الصفحة الرئيسية، أو استخدام المسارات العامة المعتمدة للوصول إلى المنتجات والضمان."
            action={(
              <div className="hero-actions">
                <Link href="/" className="button button-primary">العودة للرئيسية</Link>
                <Link href="/warranty" className="button">الوصول إلى الضمان</Link>
              </div>
            )}
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
