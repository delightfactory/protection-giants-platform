import type { Metadata } from "next";
import type { ReactNode } from "react";

export function generateMetadata(): Metadata {
  return {
    title: "خدمة الضمان",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function WarrantyClaimLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
