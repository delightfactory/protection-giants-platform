"use client";

import { useCallback, useMemo, useState } from "react";
import { CenterDirectoryMap, type CenterMapItem } from "@/components/center-directory-map";

export type PublicCenterDirectoryItem = {
  center_name: string;
  city: string;
  country_code: string;
  latitude: number;
  longitude: number;
  classification: "registered" | "approved";
};

type Filter = "all" | "approved" | "registered";

function centerKey(center: PublicCenterDirectoryItem, index: number) {
  return `${center.center_name}|${center.latitude}|${center.longitude}|${index}`;
}

function matchesQuery(center: PublicCenterDirectoryItem, query: string) {
  const normalized = query.trim().toLocaleLowerCase("ar");
  if (!normalized) return true;
  return `${center.center_name} ${center.city} ${center.country_code}`.toLocaleLowerCase("ar").includes(normalized);
}

export function CenterDirectoryBrowser({ centers }: { centers: PublicCenterDirectoryItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const entries = useMemo(
    () => centers.map((center, index) => ({ center, key: centerKey(center, index) })),
    [centers],
  );
  const filteredEntries = useMemo(
    () => entries.filter(({ center }) => (filter === "all" || center.classification === filter) && matchesQuery(center, query)),
    [entries, filter, query],
  );
  const approvedCount = centers.filter((center) => center.classification === "approved").length;
  const registeredCount = centers.length - approvedCount;
  const mapCenters: CenterMapItem[] = filteredEntries.map(({ center, key }) => ({
    key,
    name: center.center_name,
    city: center.city,
    latitude: center.latitude,
    longitude: center.longitude,
    classification: center.classification,
  }));

  const selectFromMap = useCallback((key: string) => {
    setSelectedKey(key);
    document.querySelector(`[data-center-key="${CSS.escape(key)}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  return (
    <>
      <section className="center-directory-tools" aria-label="البحث والتصفية">
        <label className="center-directory-search">
          <span>ابحث بالاسم أو المدينة</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: القاهرة أو اسم المركز" autoComplete="off" />
        </label>
        <div className="center-directory-filters" role="group" aria-label="حالة اعتماد المركز">
          {([[
            "all", `الكل ${centers.length}`,
          ], ["approved", `معتمد ${approvedCount}`], ["registered", `مسجل ${registeredCount}`]] as const).map(([value, label]) => (
            <button key={value} type="button" className={`center-directory-filter${filter === value ? " is-active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </section>

      <div className="center-directory-layout">
        <CenterDirectoryMap centers={mapCenters} selectedKey={selectedKey} onSelect={selectFromMap} />
        <section className="center-directory-results" aria-live="polite" aria-label="نتائج المراكز">
          <div className="center-directory-results-head">
            <strong>{filteredEntries.length} مركز</strong>
            <span>المعتمد يحمل علامة اعتماد واضحة، والمسجل مركز نشط ومحدد الموقع دون اعتماد شبكة حالي.</span>
          </div>
          {filteredEntries.length === 0 ? (
            <div className="center-directory-no-results"><strong>لا توجد نتائج مطابقة</strong><p>غيّر عبارة البحث أو اختر حالة أخرى.</p></div>
          ) : (
            <div className="center-directory-list">
              {filteredEntries.map(({ center, key }) => {
                const approved = center.classification === "approved";
                return (
                  <article key={key} data-center-key={key} className={`center-directory-card${selectedKey === key ? " is-selected" : ""}`}>
                    <div className="center-directory-card-head">
                      <div><span className="center-directory-city">{center.city} · <span dir="ltr">{center.country_code}</span></span><h2>{center.center_name}</h2></div>
                      <span className={`center-directory-status center-directory-status-${center.classification}`}>{approved ? "معتمد" : "مسجل"}</span>
                    </div>
                    <p>{approved ? "مركز معتمد حاليًا ضمن شبكة Protection Giants." : "مركز مسجل ونشط داخل الشبكة، ولم يحصل على اعتماد الشبكة حاليًا."}</p>
                    <button type="button" className="button button-ghost" onClick={() => setSelectedKey(key)}>عرض على الخريطة</button>
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
