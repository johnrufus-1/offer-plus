import { NextRequest, NextResponse } from "next/server";
import { searchSailings, getFacets, lastSyncAt, OfferFilters } from "@/lib/db/queries";

function arr(p: string | null): string[] | undefined {
  if (!p) return undefined;
  return p.split(",").filter(Boolean);
}

function int(p: string | null): number | undefined {
  if (p == null || p === "") return undefined;
  const n = Number(p);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters: OfferFilters = {
    q: sp.get("q") || undefined,
    ships: arr(sp.get("ships")),
    regions: arr(sp.get("regions")),
    compTypes: arr(sp.get("compTypes")),
    nightsMin: int(sp.get("nights_min")),
    nightsMax: int(sp.get("nights_max")),
    sailFrom: sp.get("sail_from") || undefined,
    sailTo: sp.get("sail_to") || undefined,
    bookByBefore: sp.get("book_by_before") || undefined,
    sort: (sp.get("sort") as OfferFilters["sort"]) || undefined,
    limit: int(sp.get("limit")) ?? 200,
    offset: int(sp.get("offset")) ?? 0,
  };

  const [results, facets, syncedAt] = await Promise.all([
    searchSailings(filters),
    getFacets(),
    lastSyncAt(),
  ]);

  return NextResponse.json({ results, facets, lastSyncAt: syncedAt });
}
