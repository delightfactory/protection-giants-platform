import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "التحقق من الضمان",
  description: "الوصول إلى ضمان Protection Giants من خلال رمز QR الرسمي المرتبط بالرول.",
};

export default function WarrantyPage() {
  return (
    <>
      <PageIntro
        eyebrow="الضمان"
        title="تحقق من ضمانك"
        description="يتم فتح سجل الضمان من خلال رمز QR الرسمي المرتبط بالرول لضمان الوصول إلى السجل الصحيح دون البحث ببيانات قابلة للتخمين."
      />
      <div className="container section">
        <EmptyState
          eyebrow="الوصول الرسمي"
          title="امسح رمز QR الخاص بالضمان"
          description="استخدم رمز QR الموجود على نسخة السيارة أو شهادة الضمان أو الفاتورة. لا تتطلب مشاهدة حالة الضمان تسجيل دخول أو حساب عميل."
        />
      </div>
    </>
  );
}
