import type { ReactNode } from "react";
import { OperationsNav } from "@/components/operations-nav";

export default function OperationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="operations-shell">
      <OperationsNav />
      <main className="operations-content">{children}</main>
    </div>
  );
}
