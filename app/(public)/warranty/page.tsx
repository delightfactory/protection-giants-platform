import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "التحقق من الضمان",
  description: "الوصول الآمن إلى ضمان Protection Giants من خلال رمز QR الرسمي، مع إرشادات الاستعادة عند تعذر قراءة الرمز.",
};

export default function WarrantyPage() {
  return (
    <>
      <PageIntro
        eyebrow="الضمان"
        title="الوصول إلى ضمانك"
        description="يتم فتح سجل الضمان من خلال رمز QR الرسمي المرتبط بالسجل الصحيح. لا توفر المنصة بحثًا عامًا برقم الضمان أو بيانات السيارة أو بيانات العميل."
      />
      <div className="container section">
        <EmptyState
          eyebrow="الوصول الرسمي"
          title="امسح رمز QR الخاص بالضمان"
          description="استخدم رمز QR الموجود على نسخة السيارة أو شهادة الضمان أو الفاتورة. إذا تعذر مسحه، نظّف موضع الرمز، استخدم إضاءة واضحة، وأعد المحاولة مع ظهور الرمز كاملًا داخل الكاميرا. إذا استمر تعذر القراءة، استخدم دليل مراكز الشبكة لمراجعة مستنداتك ورمز QR؛ الدليل لا يتيح البحث عن ضمانك. لا تتطلب مشاهدة حالة الضمان تسجيل دخول أو حساب عميل."
          action={(
            <div className="hero-actions">
              <Link href="/centers" className="button button-primary">دليل مراكز الشبكة</Link>
              <Link href="/" className="button">العودة للرئيسية</Link>
            </div>
          )}
        />
      </div>
    </>
  );
}
