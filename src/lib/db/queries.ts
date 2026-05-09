import { and, eq, gte, lte, inArray, like, or, asc, desc, SQL } from "drizzle-orm";
import { db } from "./client";
import { offers, sailings } from "./schema";

export type OfferFilters = {
  q?: string;
  ships?: string[];
  regions?: string[];
  nightsMin?: number;
  nightsMax?: number;
  sailFrom?: string;
  sailTo?: string;
  bookByBefore?: string;
  compTypes?: string[];
  sort?: "sail_asc" | "sail_desc" | "nights_asc" | "nights_desc" | "book_by_soonest" | "recently_synced";
  limit?: number;
  offset?: number;
};

export async function searchSailings(f: OfferFilters) {
  const conditions: SQL[] = [];
  if (f.ships?.length) conditions.push(inArray(sailings.ship, f.ships));
  if (f.regions?.length) conditions.push(inArray(sailings.region, f.regions));
  if (f.nightsMin != null) conditions.push(gte(sailings.nights, f.nightsMin));
  if (f.nightsMax != null) conditions.push(lte(sailings.nights, f.nightsMax));
  if (f.sailFrom) conditions.push(gte(sailings.sailDate, f.sailFrom));
  if (f.sailTo) conditions.push(lte(sailings.sailDate, f.sailTo));
  if (f.bookByBefore) conditions.push(lte(offers.bookByDate, f.bookByBefore));
  if (f.compTypes?.length) conditions.push(inArray(offers.compType, f.compTypes));
  if (f.q) {
    const needle = `%${f.q}%`;
    const qCond = or(
      like(sailings.ship, needle),
      like(sailings.itineraryName, needle),
      like(sailings.region, needle),
      like(offers.title, needle),
    );
    if (qCond) conditions.push(qCond);
  }

  let order: SQL;
  switch (f.sort) {
    case "sail_desc":
      order = desc(sailings.sailDate);
      break;
    case "nights_asc":
      order = asc(sailings.nights);
      break;
    case "nights_desc":
      order = desc(sailings.nights);
      break;
    case "book_by_soonest":
      order = asc(offers.bookByDate);
      break;
    case "recently_synced":
      order = desc(offers.syncedAt);
      break;
    case "sail_asc":
    default:
      order = asc(sailings.sailDate);
  }

  const rows = await db
    .select({
      sailing: sailings,
      offer: offers,
    })
    .from(sailings)
    .innerJoin(offers, eq(sailings.offerId, offers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(order)
    .limit(f.limit ?? 200)
    .offset(f.offset ?? 0);

  return rows.map((r) => ({
    ...r.sailing,
    portsOfCall: r.sailing.portsOfCall ? (JSON.parse(r.sailing.portsOfCall) as string[]) : [],
    offer: {
      id: r.offer.id,
      rcOfferId: r.offer.rcOfferId,
      title: r.offer.title,
      compType: r.offer.compType,
      bookByDate: r.offer.bookByDate,
      description: r.offer.description,
    },
  }));
}

export async function getFacets() {
  const allShips = await db.selectDistinct({ ship: sailings.ship }).from(sailings);
  const allRegions = await db.selectDistinct({ region: sailings.region }).from(sailings);
  const allComps = await db.selectDistinct({ compType: offers.compType }).from(offers);
  return {
    ships: allShips.map((r) => r.ship).filter(Boolean) as string[],
    regions: allRegions.map((r) => r.region).filter(Boolean) as string[],
    compTypes: allComps.map((r) => r.compType).filter(Boolean) as string[],
  };
}

export async function lastSyncAt(): Promise<string | null> {
  const r = await db
    .select({ syncedAt: offers.syncedAt })
    .from(offers)
    .orderBy(desc(offers.syncedAt))
    .limit(1);
  return r[0]?.syncedAt ?? null;
}
