# Club Royale Finder

Local-only web app for searching your Royal Caribbean Club Royale casino offers. Two pieces:

- **Web app** (`/`) — Next.js + SQLite. Stores offers and serves the search UI.
- **Browser extension** (`/extension`) — captures your offers from royalcaribbean.com (logged-in browser session) and POSTs them to the local app.

Everything runs on `localhost`. No cloud, no accounts, no password storage.

---

## Run the app

```bash
cd club-royale-finder
npm install
npm run db:migrate          # creates ./data.db
npm run dev                 # http://localhost:3000
```

Optional — load sample data so the UI has something to show:

```bash
npm run db:seed             # in another terminal, while dev is running
```

Open http://localhost:3000 — search, filter by ship/region/length/sail-date/book-by, switch to Calendar view.

---

## Install the extension (Chrome / Edge / Brave)

1. Visit `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked** → pick the `extension/` folder in this repo
4. Pin the extension. Click it once and confirm the **Local app URL** is `http://localhost:3000`.

---

## Phase 1 — API discovery (one-time)

The extension's `recorder.js` patches `fetch`/`XMLHttpRequest` so it logs every JSON call royalcaribbean.com makes. The included mapper in `recorder.js → crfBuildPayload()` is a heuristic skeleton — it must be tightened up to RC's real response shapes once we map them.

To do the discovery:

1. Make sure you're logged into Club Royale.
2. Navigate to https://www.royalcaribbean.com/club-royale/offers
3. You'll see a floating **CRF** bar in the bottom-right. Click **● Record**.
4. Click into one offer → **View Sailings** → **View Details** on one sailing. Browse a couple more offers.
5. Click **Stop & Download** — saves `club-royale-recording-*.json` with every captured request and response.
6. Open the JSON, locate the calls that returned offers / sailings / details, note the URL patterns and field names.
7. Edit `extension/recorder.js → crfBuildPayload()` to map those fields into the schema below. Reload the extension.
8. Reload the offers page → click **Sync to local app**. You should see `Synced N/M`.

### Target schema (what `crfBuildPayload` must return)

```ts
{
  offers: [{
    rcOfferId: string,             // RC's offer identifier
    title: string,
    description?: string | null,
    compType?: string | null,      // "Free Cruise" | "Discount" | "Casino Cash" | ...
    bookByDate?: "YYYY-MM-DD" | null,
    terms?: string | null,
    raw: any,                      // full original payload (kept for forward-compat)
    sailings: [{
      rcSailingId: string,
      ship: string,
      sailDate: "YYYY-MM-DD",
      returnDate?: "YYYY-MM-DD" | null,
      nights: number,
      itineraryName?: string | null,
      region?: string | null,      // "Caribbean" | "Alaska" | ...
      departurePort?: string | null,
      portsOfCall?: string[] | null,
      stateroomCategory?: string | null,
      priceAfterOffer?: number | null,
      taxesFees?: number | null,
      raw: any
    }]
  }]
}
```

The web app's `/api/sync` validates against this with Zod ([src/lib/validation.ts](src/lib/validation.ts)).

---

## Project layout

```
src/
  app/
    page.tsx                  # search UI
    api/sync/route.ts         # POST: extension → DB (upsert)
    api/offers/route.ts       # GET:  filtered search
  components/
    SailingCard.tsx
    FilterSidebar.tsx
    CalendarView.tsx
  lib/
    db/{client,schema,queries}.ts
    validation.ts             # Zod source of truth (shared shape with extension)
    format.ts
drizzle/
  0000_init.sql               # SQLite migration
extension/
  manifest.json
  background.js               # service worker (sync + recording state)
  content.js                  # injects recorder + floating UI
  recorder.js                 # patches fetch/XHR, exposes crfBuildPayload
  popup.html / popup.js       # popup: app URL + last sync
fixtures/
  sample.json                 # seed data
scripts/
  migrate.ts / seed.ts
```

---

## How a real sync works

```
[Browser]                                    [Local Next.js]
royalcaribbean.com (logged in)               localhost:3000
  │  recorder.js patches fetch/XHR
  │  crfBuildPayload() builds normalized
  │  payload from captured / live calls
  │
  └─► chrome.runtime.sendMessage({SYNC})
        background.js POSTs JSON ──────────► /api/sync
                                              ├─ validates with Zod
                                              └─ upserts SQLite (data.db)

UI fetches /api/offers?…filters…  ◄──────── search/filter/sort
```

RC API calls happen inside your authenticated browser context — credentials never leave your machine.

---

## Verify

```bash
# DB exists, migration ran:
sqlite3 data.db ".schema offers" ".schema sailings"

# Seed and query through the API:
npm run db:seed
curl 'http://localhost:3000/api/offers?ships=Mariner+of+the+Seas&sort=sail_asc' | jq '.results | length'
```
