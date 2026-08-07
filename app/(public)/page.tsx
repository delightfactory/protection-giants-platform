import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";

const foundationAreas = [
  { title: "منتجات موثقة", text: "عرض واضح لمنتجات أفلام الحماية وبيانات الضمان المرتبطة بها عند تفعيل النشر العام." },
  { title: "مراكز معتمدة", text: "شبكة مراكز تركيب تعتمدها الإدارة وتظهر للجمهور من مصدر تشغيلي واحد." },
  { title: "ضمان رقمي", text: "مسار تحقق بسيط وآمن يربط المنتج والتركيب بضمان العميل عند اكتمال دورة التفعيل." },
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
            <p>يتم تفعيل كل خدمة عامة عندما يكتمل مسارها التشغيلي والآمن، بدون بيانات وهمية أو وظائف شكلية.</p>
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
