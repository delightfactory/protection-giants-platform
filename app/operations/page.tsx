const metrics = [
  { label: "المنتجات", value: "—" },
  { label: "الرولات", value: "—" },
  { label: "المراكز", value: "—" },
  { label: "الضمانات", value: "—" },
];

export default function OperationsPage() {
  return (
    <>
      <div className="operations-topbar">
        <div>
          <span className="eyebrow">بوابة التشغيل</span>
          <h1>الأساس جاهز لتركيب الموديولات</h1>
        </div>
        <p>لا توجد بيانات تشغيلية في هذه المرحلة.</p>
      </div>

      <section className="metric-grid" aria-label="مؤشرات تشغيلية أولية">
        {metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="foundation-note">
        <strong>Platform Foundation</strong>
        <p>هذه الشاشة تثبت بنية بوابة التشغيل فقط. كل وظيفة ستُضاف في مكعب مستقل بعد تحديد قواعد بياناتها وتدفقها ومعايير قبولها.</p>
      </section>
    </>
  );
}
