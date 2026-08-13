"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

export type PublicCenterDirectoryItem = {
  center_name: string;
  city: string;
  country_code: string;
  latitude: number;
  longitude: number;
  classification: "registered" | "approved";
};

type Filter = "all" | "approved" | "registered";

type PopupLike = {
  setText(text: string): PopupLike;
};

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
  interface Window {
    maplibregl?: MapLibreGlobal;
  }
}

const mapLibreVersion = "5.16.0";
const mapLibreScript = `https://unpkg.com/maplibre-gl@${mapLibreVersion}/dist/maplibre-gl.js`;
const mapLibreCss = `https://unpkg.com/maplibre-gl@${mapLibreVersion}/dist/maplibre-gl.css`;
const tileUrl = process.env.NEXT_PUBLIC_CENTER_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function centerKey(center: PublicCenterDirectoryItem) {
  return `${center.center_name}|${center.latitude}|${center.longitude}`;
}

function matchesQuery(center: PublicCenterDirectoryItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase("ar");
  if (!normalized) return true;
  return `${center.center_name} ${center.city} ${center.country_code}`.toLocaleLowerCase("ar").includes(normalized);
}

function ensureMapCss() {
  if (document.querySelector(`link[data-center-map-css="${mapLibreVersion}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = mapLibreCss;
  link.dataset.centerMapCss = mapLibreVersion;
  document.head.appendChild(link);
}

export function CenterDirectoryBrowser({ centers }: { centers: PublicCenterDirectoryItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [libraryReady, setLibraryReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const markersRef = useRef<MarkerLike[]>([]);

  const filteredCenters = useMemo(
    () => centers.filter((center) => {
      const classificationMatches = filter === "all" || center.classification === filter;
      return classificationMatches && matchesQuery(center, query);
    }),
    [centers, filter, query],
  );

  const approvedCount = centers.filter((center) => center.classification === "approved").length;
  const registeredCount = centers.length - approvedCount;

  useEffect(() => {
    ensureMapCss();
    if (window.maplibregl) setLibraryReady(true);
  }, []);

  useEffect(() => {
    if (!libraryReady || mapFailed || !mapContainerRef.current || mapRef.current || !window.maplibregl) return;

    try {
      const maplibre = window.maplibregl;
      const map = new maplibre.Map({
        container: mapContainerRef.current,
        center: [30.8, 26.8],
        zoom: 5,
        attributionControl: true,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: [tileUrl],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "basemap", type: "raster", source: "basemap" }],
        },
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-left");
      map.on("load", () => setMapFailed(false));
      mapRef.current = map;
    } catch {
      setMapFailed(true);
    }

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [libraryReady, mapFailed]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = window.maplibregl;
    if (!map || !maplibre) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (filteredCenters.length === 0) return;

    for (const center of filteredCenters) {
      const key = centerKey(center);
      const element = document.createElement("button");
      element.type = "button";
      element.className = `center-map-marker center-map-marker-${center.classification}`;
      element.setAttribute("aria-label", `${center.center_name}، ${center.city}`);
      element.title = center.center_name;
      element.addEventListener("click", () => {
        setSelectedKey(key);
        document.querySelector(`[data-center-key="${CSS.escape(key)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      const popup = new maplibre.Popup({ offset: 18 }).setText(
        `${center.center_name} · ${center.city} · ${center.classification === "approved" ? "معتمد" : "مسجل"}`,
      );
      const marker = new maplibre.Marker({ element, anchor: "bottom" })
        .setLngLat([center.longitude, center.latitude])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (filteredCenters.length === 1) {
      const center = filteredCenters[0];
      map.flyTo({ center: [center.longitude, center.latitude], zoom: 12, essential: false });
      return;
    }

    const latitudes = filteredCenters.map((center) => center.latitude);
    const longitudes = filteredCenters.map((center) => center.longitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      { padding: 48, maxZoom: 11, duration: 0 },
    );
  }, [filteredCenters, libraryReady]);

  function focusCenter(center: PublicCenterDirectoryItem) {
    const key = centerKey(center);
    setSelectedKey(key);
    mapRef.current?.flyTo({ center: [center.longitude, center.latitude], zoom: 13, essential: false });
    mapContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <Script
        src={mapLibreScript}
        strategy="afterInteractive"
        onReady={() => setLibraryReady(true)}
        onError={() => setMapFailed(true)}
      />

      <section className="center-directory-tools" aria-label="البحث والتصفية">
        <label className="center-directory-search">
          <span>ابحث بالاسم أو المدينة</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="مثال: القاهرة أو اسم المركز"
            autoComplete="off"
          />
        </label>
        <div className="center-directory-filters" role="group" aria-label="حالة اعتماد المركز">
          {([
            ["all", `الكل ${centers.length}`],
            ["approved", `معتمد ${approvedCount}`],
            ["registered", `مسجل ${registeredCount}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`center-directory-filter${filter === value ? " is-active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="center-directory-layout">
        <section className="center-directory-map-panel" aria-label="خريطة مراكز التركيب">
          <div ref={mapContainerRef} className="center-directory-map" />
          {!libraryReady && !mapFailed ? <div className="center-directory-map-state">جارٍ تحميل الخريطة…</div> : null}
          {mapFailed ? (
            <div className="center-directory-map-state center-directory-map-error">
              تعذر تحميل الخريطة حاليًا. قائمة المراكز والبحث ما زالا متاحين بالكامل.
            </div>
          ) : null}
          {filteredCenters.length === 0 && !mapFailed ? (
            <div className="center-directory-map-state">لا توجد مراكز مطابقة لعرضها على الخريطة.</div>
          ) : null}
        </section>

        <section className="center-directory-results" aria-live="polite" aria-label="نتائج المراكز">
          <div className="center-directory-results-head">
            <strong>{filteredCenters.length} مركز</strong>
            <span>المعتمد يحمل علامة اعتماد واضحة، والمسجل مركز نشط ومحدد الموقع دون اعتماد شبكة حالي.</span>
          </div>

          {filteredCenters.length === 0 ? (
            <div className="center-directory-no-results">
              <strong>لا توجد نتائج مطابقة</strong>
              <p>غيّر عبارة البحث أو اختر حالة أخرى.</p>
            </div>
          ) : (
            <div className="center-directory-list">
              {filteredCenters.map((center) => {
                const key = centerKey(center);
                const approved = center.classification === "approved";
                return (
                  <article
                    key={key}
                    data-center-key={key}
                    className={`center-directory-card${selectedKey === key ? " is-selected" : ""}`}
                  >
                    <div className="center-directory-card-head">
                      <div>
                        <span className="center-directory-city">{center.city} · <span dir="ltr">{center.country_code}</span></span>
                        <h2>{center.center_name}</h2>
                      </div>
                      <span className={`center-directory-status center-directory-status-${center.classification}`}>
                        {approved ? "معتمد" : "مسجل"}
                      </span>
                    </div>
                    <p>{approved ? "مركز معتمد حاليًا ضمن شبكة Protection Giants." : "مركز مسجل ونشط داخل الشبكة، ولم يحصل على اعتماد الشبكة حاليًا."}</p>
                    <button type="button" className="button button-ghost" onClick={() => focusCenter(center)}>
                      عرض على الخريطة
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
