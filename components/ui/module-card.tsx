import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";

type ModuleCardProps = {
  href: string;
  title: string;
  description: string;
  icon: IconName;
};

export function ModuleCard({ href, title, description, icon }: ModuleCardProps) {
  return (
    <Link href={href} className="ui-module-card">
      <span className="ui-module-icon" aria-hidden="true"><Icon name={icon} /></span>
      <span className="ui-module-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="ui-module-arrow" aria-hidden="true">←</span>
    </Link>
  );
}
