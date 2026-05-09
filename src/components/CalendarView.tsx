"use client";
import { SailingResult } from "./SailingCard";

export function CalendarView({ rows }: { rows: SailingResult[] }) {
  const byMonth = new Map<string, SailingResult[]>();
  for (const r of rows) {
    const m = r.sailDate.slice(0, 7);
    const arr = byMonth.get(m) ?? [];
    arr.push(r);
    byMonth.set(m, arr);
  }
  const months = Array.from(byMonth.keys()).sort();

  return (
    <div className="space-y-6">
      {months.map((m) => {
        const monthRows = byMonth.get(m)!;
        const max = Math.max(...monthRows.map(() => 1).reduce((a, _, i, arr) => {
          const d = arr.length;
          return d > 0 ? [d] : a;
        }, [0] as number[]));
        const date = new Date(m + "-01T00:00:00");
        const label = date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        const first = new Date(date);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

        const counts = new Map<number, number>();
        for (const r of monthRows) {
          const d = Number(r.sailDate.slice(8, 10));
          counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        const peak = Math.max(...Array.from(counts.values()), 1);

        return (
          <div key={m} className="card p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-lg font-semibold">{label}</h3>
              <span className="text-sm text-muted">{monthRows.length} sailings</span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="py-1">{d}</div>
              ))}
              {Array.from({ length: first.getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
              {Array.from({ length: lastDay }).map((_, i) => {
                const day = i + 1;
                const c = counts.get(day) ?? 0;
                const intensity = c === 0 ? 0 : 0.2 + 0.8 * (c / peak);
                return (
                  <div
                    key={day}
                    className="aspect-square rounded-md border border-border flex flex-col items-center justify-center text-text"
                    style={{ backgroundColor: c ? `rgba(59, 130, 246, ${intensity})` : "transparent" }}
                    title={c ? `${c} sailing${c > 1 ? "s" : ""}` : ""}
                  >
                    <div className="text-xs">{day}</div>
                    {c > 0 && <div className="text-[10px] font-semibold">{c}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {months.length === 0 && <div className="card p-8 text-center text-muted">No sailings match.</div>}
    </div>
  );
}
