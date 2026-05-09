// IndexedDB helpers — ES module used by background.js and dashboard.js

const DB_NAME = "crfDB";
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("offers")) {
        db.createObjectStore("offers", { keyPath: "rcOfferId" });
      }
      if (!db.objectStoreNames.contains("sailings")) {
        const s = db.createObjectStore("sailings", { keyPath: "rcSailingId" });
        s.createIndex("sailDate", "sailDate");
        s.createIndex("ship", "ship");
        s.createIndex("region", "region");
        s.createIndex("nights", "nights");
        s.createIndex("offerId", "offerId");
      }
      if (!db.objectStoreNames.contains("favorites")) {
        db.createObjectStore("favorites", { keyPath: "rcSailingId" });
      }
      if (!db.objectStoreNames.contains("reminders")) {
        const r = db.createObjectStore("reminders", { keyPath: "rcSailingId" });
        r.createIndex("fireAt", "fireAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeGetAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertOffers(payload) {
  const db = await openDB();
  const now = new Date().toISOString();
  let offerCount = 0;
  let sailingCount = 0;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(["offers", "sailings"], "readwrite");
    const offerStore = tx.objectStore("offers");
    const sailingStore = tx.objectStore("sailings");

    for (const o of payload.offers) {
      offerStore.put({
        rcOfferId: o.rcOfferId,
        title: o.title,
        description: o.description ?? null,
        compType: o.compType ?? null,
        bookByDate: o.bookByDate ?? null,
        terms: o.terms ?? null,
        rawJson: JSON.stringify(o.raw ?? {}),
        syncedAt: now,
      });
      offerCount++;

      for (const s of o.sailings ?? []) {
        sailingStore.put({
          rcSailingId: s.rcSailingId,
          offerId: o.rcOfferId,
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
          rawJson: JSON.stringify(s.raw ?? {}),
        });
        sailingCount++;
      }
    }

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return { offerCount, sailingCount, syncedAt: now };
}

export async function getAllData() {
  const db = await openDB();
  const [offers, sailings, favIds, reminders] = await Promise.all([
    storeGetAll(db, "offers"),
    storeGetAll(db, "sailings"),
    getFavoriteIds(),
    storeGetAll(db, "reminders"),
  ]);

  const offerMap = Object.fromEntries(offers.map((o) => [o.rcOfferId, o]));
  const favSet = new Set(favIds);
  const reminderMap = Object.fromEntries(reminders.map((r) => [r.rcSailingId, r]));

  const enriched = sailings.map((s) => ({
    ...s,
    portsOfCall: s.portsOfCall ? JSON.parse(s.portsOfCall) : [],
    offer: offerMap[s.offerId] ?? null,
    isFavorite: favSet.has(s.rcSailingId),
    reminder: reminderMap[s.rcSailingId] ?? null,
  }));

  return { offers, sailings: enriched };
}

export async function toggleFavorite(rcSailingId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("favorites", "readwrite");
    const store = tx.objectStore("favorites");
    const getReq = store.get(rcSailingId);
    let willBeFavorite;
    getReq.onsuccess = () => {
      if (getReq.result) {
        store.delete(rcSailingId);
        willBeFavorite = false;
      } else {
        store.put({ rcSailingId, addedAt: new Date().toISOString() });
        willBeFavorite = true;
      }
    };
    tx.oncomplete = () => resolve(willBeFavorite);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFavoriteIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("favorites", "readonly").objectStore("favorites").getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function setReminder(rcSailingId, fireAt, offset, snapshot) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reminders", "readwrite");
    tx.objectStore("reminders").put({
      rcSailingId,
      fireAt,
      offset,
      snapshot,
      createdAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearReminder(rcSailingId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("reminders", "readwrite");
    tx.objectStore("reminders").delete(rcSailingId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllReminders() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("reminders", "readonly").objectStore("reminders").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getLastSync() {
  const db = await openDB();
  const offers = await storeGetAll(db, "offers");
  if (!offers.length) return null;
  return offers.reduce((latest, o) => (o.syncedAt > latest ? o.syncedAt : latest), "");
}
