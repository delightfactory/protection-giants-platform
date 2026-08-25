export default function PublicWarrantyNotFound() {
  return (
    <section className="warranty-public-page" aria-labelledby="warranty-public-not-found-title">
      <div className="warranty-public-wrap">
        <article className="warranty-public-panel is-neutral">
          <header className="warranty-public-header">
            <div className="warranty-public-heading">
              <span className="eyebrow">التحقق من الضمان</span>
              <h1 id="warranty-public-not-found-title">تعذر العثور على ضمان بهذا الرابط</h1>
              <p>
                الرابط غير صالح أو غير معروف. استخدم رمز QR الرسمي المطبوع مع المنتج أو مستندات الضمان.
              </p>
            </div>
            <span className="ui-status ui-status-neutral">رابط غير صالح</span>
          </header>

          <footer className="warranty-public-trust">
            <span className="warranty-public-trust-mark" aria-hidden="true">PG</span>
            <p>لا يمكن البحث عن الضمان برقم السيارة أو رقم الضمان أو بيانات العميل من هذه الصفحة.</p>
          </footer>
        </article>
      </div>
    </section>
  );
}
