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

type PopupLike = { setText(text: string): PopupLike };
type MapLike = {
  on(event: string, handler: () => void): MapLike;
  addControl(control: unknown, position?: string): MapLike;
  fitBounds(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): MapLike;
  flyTo(options: Record<string, unknown>): MapLike;
  remove(): void;
};
type MarkerLike = {
  setLngLat(coordinates: [number, number]): MarkerLike;
  setPopup(popup: PopupLike): MarkerLike;
  addTo(map: MapLike): MarkerLike;
  remove(): void;
};
type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => MapLike;
  Marker: new (options?: Record<string, unknown>) => MarkerLike;
  Popup: new (options?: Record<string, unknown>) => PopupLike;
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
};

declare global {
  interface Window { maplibregl?: MapLibreGlobal }
}

const version = "5.16.0";
const scriptUrl = `https://unpkg.com/maplibre-gl@${version}/dist/maplibre-gl.js`;
const cssUrl = `https://unpkg.com/maplibre-gl@${version}/dist/maplibre-gl.css`;
const tileUrl = process.env.NEXT_PUBLIC_CENTER_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function ensureMapCss() {
  if (document.querySelector(`link[data-center-map-css="${version}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl;
  link.dataset.centerMapCss = version;
  document.head.appendChild(link);
}

export function CenterDirectoryMap({ centers, onSelect }: { centers: CenterMapItem[]; onSelect: (key: string) => void }) {
  const [libraryReady, setLibraryReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<MarkerLike[]>([]);

  useEffect(() => {
    ensureMapCss();
    if (window.maplibregl) setLibraryReady(true);
  }, []);

  useEffect(() => {
    if (!libraryReady || mapFailed || !containerRef.current || mapRef.current || !window.maplibregl) return;
    try {
      const maplibre = window.maplibregl;
      const map = new maplibre.Map({
        container: containerRef.current,
        center: [30.8, 26.8],
        zoom: 5,
        attributionControl: true,
        style: {
          version: 8,
          sources: { basemap: { type: "raster", tiles: [tileUrl], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        },
      });
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      map.on("load", () => {
        loadedRef.current = true;
        setMapReady(true);
      });
      map.on("error", () => {
        if (!loadedRef.current) setMapFailed(true);
      });
      mapRef.current = map;
    } catch {
      setMapFailed(true);
    }

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [libraryReady, mapFailed]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = window.maplibregl;
    if (!map || !maplibre) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    if (centers.length === 0) return;

    centers.forEach((center) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `center-map-marker center-map-marker-${center.classification}`;
      element.setAttribute("aria-label", `${center.name}، ${center.city}`);
      element.title = center.name;
      element.addEventListener("click", () => onSelect(center.key));
      const popup = new maplibre.Popup({ offset: 18 }).setText(`${center.name} · ${center.city} · ${center.classification === "approved" ? "معتمد" : "مسجل"}`);
      markersRef.current.push(
        new maplibre.Marker({ element, anchor: "bottom" })
          .setLngLat([center.longitude, center.latitude])
          .setPopup(popup)
          .addTo(map),
      );
    });

    if (centers.length === 1) {
      map.flyTo({ center: [centers[0].longitude, centers[0].latitude], zoom: 12, essential: false });
      return;
    }
    const latitudes = centers.map((center) => center.latitude);
    const longitudes = centers.map((center) => center.longitude);
    map.fitBounds(
      [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]],
      { padding: 48, maxZoom: 11, duration: 0 },
    );
  }, [centers, onSelect]);

  return (
    <section className="center-directory-map-panel" aria-label="خريطة مراكز التركيب">
      <Script src={scriptUrl} strategy="afterInteractive" onReady={() => setLibraryReady(true)} onError={() => setMapFailed(true)} />
      <div ref={containerRef} className="center-directory-map" />
      {!mapReady && !mapFailed ? <div className="center-directory-map-state">جارٍ تحميل الخريطة…</div> : null}
      {mapFailed ? <div className="center-directory-map-state center-directory-map-error">تعذر تحميل الخريطة حاليًا. قائمة المراكز والبحث ما زالا متاحين بالكامل.</div> : null}
      {mapReady && centers.length === 0 ? <div className="center-directory-map-state">لا توجد مراكز مطابقة لعرضها على الخريطة.</div> : null}
    </section>
  );
}
