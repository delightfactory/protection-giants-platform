import Link from "next/link";
import styles from "./page.module.css";

export default function PublicWarrantyNotFound() {
  return (
    <section className={styles.page} aria-labelledby="warranty-public-not-found-title">
      <div className={styles.wrap}>
        <article className={`${styles.panel} ${styles.neutral}`}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className="eyebrow">التحقق من الضمان</span>
              <h1 id="warranty-public-not-found-title">تعذر فتح الضمان من هذا الرابط</h1>
              <p>
                الرابط غير صالح أو غير معروف. أعد مسح رمز QR الرسمي المطبوع على مستندات الضمان بإضاءة واضحة، وتأكد من ظهور الرمز كاملًا داخل الكاميرا.
              </p>
            </div>
            <span className="ui-status ui-status-neutral">رابط غير صالح</span>
          </header>

          <div className="hero-actions">
            <Link href="/warranty" className="button button-primary">إرشادات الوصول للضمان</Link>
            <Link href="/centers" className="button">دليل مراكز الشبكة</Link>
          </div>

          <footer className={styles.trust}>
            <span className={styles.trustMark} aria-hidden="true">PG</span>
            <p>لا يمكن البحث عن الضمان برقم الضمان أو VIN / الشاسيه أو الهاتف أو أي بيانات عميل من هذه الصفحة.</p>
          </footer>
        </article>
      </div>
    </section>
  );
}
