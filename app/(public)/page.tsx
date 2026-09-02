import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";

const foundationAreas = [
  { title: "منتجات موثقة", text: "عرض واضح لمنتجات أفلام الحماية المنشورة ومواصفاتها ومعلومات الضمان المعتمدة." },
  { title: "شبكة مراكز التركيب", text: "دليل للمراكز النشطة والمسجلة داخل الشبكة مع توضيح حالة الاعتماد لكل مركز." },
  { title: "ضمان رقمي", text: "مسار تحقق آمن يربط الضمان المفعّل بالمنتج والتركيب ويتيح للعميل الوصول إلى سجله عبر رمز QR الرسمي." },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">{brandConfig.englishName}</span>
          <h1>من المنتج إلى التركيب والضمان، تجربة حماية موثقة في منصة واحدة.</h1>
          <p className="lead">
            منصة Protection Giants تربط المنتجات ومراكز التركيب والضمانات ضمن تجربة رقمية واضحة، مبنية لتخدم التشغيل اليومي والعملاء من الهاتف أولًا.
          </p>
          <div className="hero-actions">
            <Link href="/products" className="button button-primary">استعرض المنتجات</Link>
            <Link href="/warranty" className="button">تحقق من الضمان</Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div><span className="eyebrow">Protection Giants</span><h2>منظومة واحدة بتجربة واضحة</h2></div>
            <p>المحتوى العام يعرض المنتجات المنشورة، شبكة مراكز التركيب، والوصول الآمن إلى الضمان من مصادر المنصة الرسمية.</p>
          </div>
          <div className="card-grid">
            {foundationAreas.map((area, index) => (
              <article className="card" key={area.title}>
                <span className="card-kicker">0{index + 1}</span>
                <h3>{area.title}</h3>
                <p>{area.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
