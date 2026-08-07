import { brandConfig } from "@/lib/brand-config";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <span>{brandConfig.englishName}</span>
        <span>منصة المنتجات والضمانات ومراكز التركيب المعتمدة</span>
      </div>
    </footer>
  );
}
