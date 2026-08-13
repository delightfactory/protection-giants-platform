"use client";

import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

export default function CentersError() {
  return (
    <>
      <PageIntro
        eyebrow="شبكة Protection Giants"
        title="مراكز التركيب"
        description="تعذر تحميل دليل المراكز حاليًا. بيانات التشغيل الداخلية غير متأثرة ويمكنك المحاولة مرة أخرى لاحقًا."
      />
      <section className="section">
        <div className="container">
          <EmptyState
            eyebrow="دليل المراكز"
            title="الدليل غير متاح مؤقتًا"
            description="لم نتمكن من تحميل بيانات المراكز العامة الآن."
            action={<Link href="/centers" className="button button-primary">إعادة المحاولة</Link>}
          />
        </div>
      </section>
    </>
  );
}
