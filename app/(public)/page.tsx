import Link from "next/link";
import { brandConfig } from "@/lib/brand-config";

const foundationAreas = [
  { title: "منتجات واضحة", text: "كتالوج ومواصفات وسياسات ضمان تُدار لاحقًا من مصدر بيانات واحد." },
  { title: "مراكز معتمدة", text: "شبكة مراكز موثقة تعرض للجمهور وتستخدم لاحقًا في عمليات التركيب والضمان." },
  { title: "ضمان قابل للتحقق", text: "مسار رقمي بسيط يبدأ من الرول وينتهي بصفحة ضمان واضحة للعميل." },
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">{brandConfig.englishName}</span>
          <h1>منصة واحدة للمنتج، الرول، مركز التركيب وضمان العميل.</h1>
          <p className="lead">
            أساس رقمي بسيط ومنظم لإدارة تجربة أفلام حماية الطلاء، مع بناء كل وظيفة على مراحل مستقلة وقابلة للمراجعة.
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
            <div><span className="eyebrow">الأساس</span><h2>تجربة واضحة من أول يوم</h2></div>
            <p>هذه النسخة تثبت هيكل المنصة والتنقل والهوية فقط. الوظائف التشغيلية ستُضاف كمكونات مستقلة بعد اعتماد كل مكعب.</p>
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
