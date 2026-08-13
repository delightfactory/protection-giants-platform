"use client";

import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

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
          <div className="empty-state">
            <strong>الدليل غير متاح مؤقتًا</strong>
            <p>لم نتمكن من تحميل بيانات المراكز العامة الآن.</p>
            <Link href="/centers" className="button button-primary">إعادة المحاولة</Link>
          </div>
        </div>
      </section>
    </>
  );
}
