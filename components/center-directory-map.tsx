"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export type CenterMapItem = {
  key: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  classification: "registered" | "approved";
};

export function CenterDirectoryMap({ centers, onSelect }: { centers: CenterMapItem[]; onSelect: (key: string) => void }) {
  return <div className="center-directory-map-panel" aria-label="خريطة مراكز التركيب" />;
}
