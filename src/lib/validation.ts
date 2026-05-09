import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const sailingInput = z.object({
  rcSailingId: z.string().min(1),
  ship: z.string().min(1),
  sailDate: isoDate,
  returnDate: isoDate.nullable().optional(),
  nights: z.number().int().positive(),
  itineraryName: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  departurePort: z.string().nullable().optional(),
  portsOfCall: z.array(z.string()).nullable().optional(),
  stateroomCategory: z.string().nullable().optional(),
  priceAfterOffer: z.number().nullable().optional(),
  taxesFees: z.number().nullable().optional(),
  raw: z.unknown(),
});

export const offerInput = z.object({
  rcOfferId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  compType: z.string().nullable().optional(),
  bookByDate: isoDate.nullable().optional(),
  terms: z.string().nullable().optional(),
  raw: z.unknown(),
  sailings: z.array(sailingInput),
});

export const syncPayload = z.object({
  offers: z.array(offerInput),
});

export type SyncPayload = z.infer<typeof syncPayload>;
export type OfferInput = z.infer<typeof offerInput>;
export type SailingInput = z.infer<typeof sailingInput>;
