import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db/client";
import { offers, sailings } from "@/lib/db/schema";
import { syncPayload } from "@/lib/validation";
import { eq } from "drizzle-orm";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: corsHeaders });
  }

  const parsed = syncPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400, headers: corsHeaders },
    );
  }

  let offerCount = 0;
  let sailingCount = 0;
  const now = new Date().toISOString();

  const tx = sqlite.transaction((payload: typeof parsed.data) => {
    for (const o of payload.offers) {
      const existing = db.select().from(offers).where(eq(offers.rcOfferId, o.rcOfferId)).all();
      let offerId: number;
      if (existing.length) {
        offerId = existing[0].id;
        db.update(offers)
          .set({
            title: o.title,
            description: o.description ?? null,
            compType: o.compType ?? null,
            bookByDate: o.bookByDate ?? null,
            terms: o.terms ?? null,
            rawJson: JSON.stringify(o.raw),
            syncedAt: now,
          })
          .where(eq(offers.id, offerId))
          .run();
      } else {
        const inserted = db
          .insert(offers)
          .values({
            rcOfferId: o.rcOfferId,
            title: o.title,
            description: o.description ?? null,
            compType: o.compType ?? null,
            bookByDate: o.bookByDate ?? null,
            terms: o.terms ?? null,
            rawJson: JSON.stringify(o.raw),
            syncedAt: now,
          })
          .returning({ id: offers.id })
          .all();
        offerId = inserted[0].id;
      }
      offerCount++;

      for (const s of o.sailings) {
        const existingSailing = db
          .select()
          .from(sailings)
          .where(eq(sailings.rcSailingId, s.rcSailingId))
          .all()
          .filter((row) => row.offerId === offerId);

        const values = {
          offerId,
          rcSailingId: s.rcSailingId,
          ship: s.ship,
          sailDate: s.sailDate,
          returnDate: s.returnDate ?? null,
          nights: s.nights,
          itineraryName: s.itineraryName ?? null,
          region: s.region ?? null,
          departurePort: s.departurePort ?? null,
          portsOfCall: s.portsOfCall ? JSON.stringify(s.portsOfCall) : null,
          stateroomCategory: s.stateroomCategory ?? null,
          priceAfterOffer: s.priceAfterOffer ?? null,
          taxesFees: s.taxesFees ?? null,
          rawJson: JSON.stringify(s.raw),
        };

        if (existingSailing.length) {
          db.update(sailings).set(values).where(eq(sailings.id, existingSailing[0].id)).run();
        } else {
          db.insert(sailings).values(values).run();
        }
        sailingCount++;
      }
    }
  });

  tx(parsed.data);

  return NextResponse.json(
    { ok: true, offers: offerCount, sailings: sailingCount, syncedAt: now },
    { headers: corsHeaders },
  );
}
