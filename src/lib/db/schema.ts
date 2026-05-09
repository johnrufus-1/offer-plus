import { sqliteTable, integer, text, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rcOfferId: text("rc_offer_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    compType: text("comp_type"),
    bookByDate: text("book_by_date"),
    terms: text("terms"),
    rawJson: text("raw_json").notNull(),
    syncedAt: text("synced_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    rcOfferIdUq: uniqueIndex("offers_rc_offer_id_uq").on(t.rcOfferId),
    bookByIdx: index("idx_offers_book_by").on(t.bookByDate),
  }),
);

export const sailings = sqliteTable(
  "sailings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    rcSailingId: text("rc_sailing_id").notNull(),
    ship: text("ship").notNull(),
    sailDate: text("sail_date").notNull(),
    returnDate: text("return_date"),
    nights: integer("nights").notNull(),
    itineraryName: text("itinerary_name"),
    region: text("region"),
    departurePort: text("departure_port"),
    portsOfCall: text("ports_of_call"),
    stateroomCategory: text("stateroom_category"),
    priceAfterOffer: real("price_after_offer"),
    taxesFees: real("taxes_fees"),
    rawJson: text("raw_json").notNull(),
  },
  (t) => ({
    offerSailingUq: uniqueIndex("sailings_offer_rc_sailing_uq").on(t.offerId, t.rcSailingId),
    sailDateIdx: index("idx_sailings_sail_date").on(t.sailDate),
    shipIdx: index("idx_sailings_ship").on(t.ship),
    regionIdx: index("idx_sailings_region").on(t.region),
    nightsIdx: index("idx_sailings_nights").on(t.nights),
  }),
);

export type Offer = typeof offers.$inferSelect;
export type Sailing = typeof sailings.$inferSelect;
