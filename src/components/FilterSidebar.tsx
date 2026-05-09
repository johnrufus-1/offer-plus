"use client";
import clsx from "clsx";

export type Filters = {
  q: string;
  ships: string[];
  regions: string[];
  compTypes: string[];
  nightsMin: number;
  nightsMax: number;
  sailFrom: string;
  sailTo: string;
  bookByBefore: string;
  sort: string;
};

export const emptyFilters: Filters = {
  q: "",
  ships: [],
  regions: [],
  compTypes: [],
  nightsMin: 2,
  nightsMax: 14,
  sailFrom: "",
  sailTo: "",
  bookByBefore: "",
  sort: "sail_asc",
};

type Facets = { ships: string[]; regions: string[]; compTypes: string[] };

export function FilterSidebar({
  filters,
  setFilters,
  facets,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  facets: Facets;
}) {
  const toggle = (key: "ships" | "regions" | "compTypes", v: string) => {
    const cur = filters[key];
    setFilters({ ...filters, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };

  return (
    <aside className="card sticky top-4 h-fit space-y-5 p-4">
      <Section label="Sail date">
        <div className="flex gap-2">
          <input
            type="date"
            className="input"
            value={filters.sailFrom}
            onChange={(e) => setFilters({ ...filters, sailFrom: e.target.value })}
          />
          <input
            type="date"
            className="input"
            value={filters.sailTo}
            onChange={(e) => setFilters({ ...filters, sailTo: e.target.value })}
          />
        </div>
      </Section>

      <Section label={`Nights · ${filters.nightsMin}–${filters.nightsMax}`}>
        <div className="space-y-2">
          <input
            type="range"
            min={2}
            max={14}
            value={filters.nightsMin}
            onChange={(e) =>
              setFilters({ ...filters, nightsMin: Math.min(Number(e.target.value), filters.nightsMax) })
            }
            className="w-full accent-accent"
          />
          <input
            type="range"
            min={2}
            max={14}
            value={filters.nightsMax}
            onChange={(e) =>
              setFilters({ ...filters, nightsMax: Math.max(Number(e.target.value), filters.nightsMin) })
            }
            className="w-full accent-accent"
          />
        </div>
      </Section>

      <Section label="Book by">
        <input
          type="date"
          className="input"
          value={filters.bookByBefore}
          onChange={(e) => setFilters({ ...filters, bookByBefore: e.target.value })}
        />
      </Section>

      {facets.ships.length > 0 && (
        <Section label="Ship">
          <div className="flex flex-wrap gap-1.5">
            {facets.ships.map((ship) => (
              <button
                key={ship}
                onClick={() => toggle("ships", ship)}
                className={clsx("chip cursor-pointer", filters.ships.includes(ship) && "chip-active")}
              >
                {ship}
              </button>
            ))}
          </div>
        </Section>
      )}

      {facets.regions.length > 0 && (
        <Section label="Region">
          <div className="flex flex-wrap gap-1.5">
            {facets.regions.map((r) => (
              <button
                key={r}
                onClick={() => toggle("regions", r)}
                className={clsx("chip cursor-pointer", filters.regions.includes(r) && "chip-active")}
              >
                {r}
              </button>
            ))}
          </div>
        </Section>
      )}

      {facets.compTypes.length > 0 && (
        <Section label="Comp type">
          <div className="flex flex-wrap gap-1.5">
            {facets.compTypes.map((c) => (
              <button
                key={c}
                onClick={() => toggle("compTypes", c)}
                className={clsx("chip cursor-pointer", filters.compTypes.includes(c) && "chip-active")}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>
      )}

      <button className="btn w-full justify-center" onClick={() => setFilters(emptyFilters)}>
        Reset filters
      </button>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  );
}
