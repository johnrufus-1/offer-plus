"use client";
import { useState } from "react";
import { fmtDate, fmtMoney, daysUntil } from "@/lib/format";

export type SailingResult = {
  id: number;
  ship: string;
  sailDate: string;
  returnDate: string | null;
  nights: number;
  itineraryName: string | null;
  region: string | null;
  departurePort: string | null;
  portsOfCall: string[];
  stateroomCategory: string | null;
  priceAfterOffer: number | null;
  taxesFees: number | null;
  offer: {
    id: number;
    rcOfferId: string;
    title: string;
    compType: string | null;
    bookByDate: string | null;
    description: string | null;
  };
};

export function SailingCard({ s }: { s: SailingResult }) {
  const [open, setOpen] = useState(false);
  const bookByDays = daysUntil(s.offer.bookByDate);
  const compTone =
    s.offer.compType === "Free Cruise"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : s.offer.compType === "Casino Cash"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-sky-500/15 text-sky-300 border-sky-500/30";

  return (
    <div className="card p-4 hover:border-accent/60 transition">
      <button onClick={() => setOpen(!open)} className="w-full text-left">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-base font-semibold">{s.ship}</h3>
            <span className="text-muted text-sm">·</span>
            <span className="text-sm text-muted">{s.itineraryName ?? s.region ?? ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`chip border ${compTone}`}>{s.offer.compType ?? "Offer"}</span>
            {bookByDays != null && bookByDays >= 0 && (
              <span className={`chip ${bookByDays <= 14 ? "border-warn text-warn" : ""}`}>
                Book in {bookByDays}d
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">{fmtDate(s.sailDate)}</span>
          {s.returnDate && <span className="text-muted">→ {fmtDate(s.returnDate)}</span>}
          <span className="chip">{s.nights} nights</span>
          {s.departurePort && <span className="text-muted">from {s.departurePort}</span>}
          {s.stateroomCategory && <span className="chip">{s.stateroomCategory}</span>}
          <span className="ml-auto text-sm">
            <span className="text-muted">After offer </span>
            <span className="font-semibold">{fmtMoney(s.priceAfterOffer)}</span>
            {s.taxesFees != null && <span className="text-muted"> + {fmtMoney(s.taxesFees)} tax</span>}
          </span>
        </div>
      </button>
      {open && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-3 text-sm md:grid-cols-2">
          <div>
            <div className="text-muted text-xs uppercase tracking-wide">Offer</div>
            <div className="font-medium">{s.offer.title}</div>
            {s.offer.description && <div className="text-muted mt-1">{s.offer.description}</div>}
            {s.offer.bookByDate && (
              <div className="mt-1 text-muted">Book by {fmtDate(s.offer.bookByDate)}</div>
            )}
          </div>
          <div>
            <div className="text-muted text-xs uppercase tracking-wide">Ports of call</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {s.portsOfCall.length ? (
                s.portsOfCall.map((p) => <span key={p} className="chip">{p}</span>)
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
