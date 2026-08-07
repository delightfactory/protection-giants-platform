import type { ReactNode } from "react";
import { OperationsNav } from "@/components/operations-nav";
import { requireOperationalProfile } from "@/lib/auth/operational-profile";
import "./operations.css";

export default async function OperationsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const profile = await requireOperationalProfile();

  return (
    <div className={`operations-shell operations-shell-${profile.role}`}>
      <OperationsNav profile={profile} />
      <main className="operations-content">{children}</main>
    </div>
  );
}
