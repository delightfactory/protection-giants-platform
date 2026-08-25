import styles from "./page.module.css";

export default function PublicWarrantyNotFound() {
  return (
    <section className={styles.page} aria-labelledby="warranty-public-not-found-title">
      <div className={styles.wrap}>
        <article className={`${styles.panel} ${styles.neutral}`}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className="eyebrow">التحقق من الضمان</span>
              <h1 id="warranty-public-not-found-title">تعذر العثور على ضمان بهذا الرابط</h1>
              <p>
                الرابط غير صالح أو غير معروف. استخدم رمز QR الرسمي المطبوع مع المنتج أو مستندات الضمان.
              </p>
            </div>
            <span className="ui-status ui-status-neutral">رابط غير صالح</span>
          </header>

          <footer className={styles.trust}>
            <span className={styles.trustMark} aria-hidden="true">PG</span>
            <p>لا يمكن البحث عن الضمان برقم السيارة أو رقم الضمان أو بيانات العميل من هذه الصفحة.</p>
          </footer>
        </article>
      </div>
    </section>
  );
}
