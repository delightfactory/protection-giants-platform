"use client";

import type { CenterMapItem } from "@/components/center-directory-map";

export type PublicCenterDirectoryItem = {
  center_name: string;
  city: string;
  country_code: string;
  latitude: number;
  longitude: number;
  classification: "registered" | "approved";
};

export function CenterDirectoryBrowser({ centers }: { centers: PublicCenterDirectoryItem[] }) {
  return null;
}
