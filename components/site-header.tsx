import { PublicNavLinks } from "@/components/public-nav-links";
import { BrandLockup } from "@/components/ui/brand-lockup";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <BrandLockup />
        <PublicNavLinks />
      </div>
    </header>
  );
}
