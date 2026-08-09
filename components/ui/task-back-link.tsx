import Link from "next/link";
import { Icon } from "@/components/ui/icon";

type TaskBackLinkProps = {
  href: string;
  label: string;
};

export function TaskBackLink({ href, label }: TaskBackLinkProps) {
  return (
    <Link href={href} className="button button-ghost ui-task-back">
      <Icon name="back" />
      <span>{label}</span>
    </Link>
  );
}
