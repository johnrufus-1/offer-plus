"use client";
import { useEffect, useMemo, useState } from "react";
import { FilterSidebar, Filters, emptyFilters } from "@/components/FilterSidebar";
import { SailingCard, SailingResult } from "@/components/SailingCard";
import { CalendarView } from "@/components/CalendarView";

type ApiResponse = {
  results: SailingResult[];
  facets: { ships: string[]; regions: string[]; compTypes: string[] };
  lastSyncAt: string | null;
};

function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.ships.length) p.set("ships", f.ships.join(","));
  if (f.regions.length) p.set("regions", f.regions.join(","));
  if (f.compTypes.length) p.set("compTypes", f.compTypes.join(","));
  if (f.nightsMin !== 2) p.set("nights_min", String(f.nightsMin));
  if (f.nightsMax !== 14) p.set("nights_max", String(f.nightsMax));
  if (f.sailFrom) p.set("sail_from", f.sailFrom);
  if (f.sailTo) p.set("sail_to", f.sailTo);
  if (f.bookByBefore) p.set("book_by_before", f.bookByBefore);
  if (f.sort) p.set("sort", f.sort);
  return p.toString();
}

export default function Home() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");

  const qs = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/offers?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setData(d);
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [qs]);

  const facets = data?.facets ?? { ships: [], regions: [], compTypes: [] };
  const results = data?.results ?? [];
  const lastSync = data?.lastSyncAt;

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-accent">Club Royale</span> Finder
        </h1>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted">
          {lastSync ? (
            <span>Last sync · {new Date(lastSync).toLocaleString()}</span>
          ) : (
            <span>No data yet — run the extension or seed</span>
          )}
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          autoFocus
          type="search"
          placeholder="Search ship, itinerary, region…"
          className="input flex-1 min-w-[280px]"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <select
          className="input w-auto"
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
        >
          <option value="sail_asc">Sail date ↑</option>
          <option value="sail_desc">Sail date ↓</option>
          <option value="nights_asc">Nights ↑</option>
          <option value="nights_desc">Nights ↓</option>
          <option value="book_by_soonest">Book by soonest</option>
          <option value="recently_synced">Recently synced</option>
        </select>
        <div className="flex rounded-md border border-border bg-panel p-0.5 text-sm">
          <button
            className={`px-3 py-1.5 rounded ${view === "list" ? "bg-accent text-white" : ""}`}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={`px-3 py-1.5 rounded ${view === "calendar" ? "bg-accent text-white" : ""}`}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        <FilterSidebar filters={filters} setFilters={setFilters} facets={facets} />

        <section>
          <div className="mb-3 flex items-center justify-between text-sm text-muted">
            <span>{loading ? "Searching…" : `${results.length} sailing${results.length === 1 ? "" : "s"}`}</span>
          </div>
          {view === "list" ? (
            <div className="space-y-3">
              {results.map((s) => (
                <SailingCard key={s.id} s={s} />
              ))}
              {!loading && results.length === 0 && (
                <div className="card p-8 text-center text-muted">No sailings match the current filters.</div>
              )}
            </div>
          ) : (
            <CalendarView rows={results} />
          )}
        </section>
      </div>
    </main>
  );
}
