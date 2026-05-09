// IndexedDB helpers — ES module used by background.js and dashboard.js

const DB_NAME = "crfDB";
const DB_VERSION = 6;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

      // v4: wipe + recreate offers/sailings with compound keys.
      // For fresh installs (oldVersion=0) this also runs and creates them.
      if (oldVersion < 4) {
        if (db.objectStoreNames.contains("offers")) db.deleteObjectStore("offers");
        if (db.objectStoreNames.contains("sailings")) db.deleteObjectStore("sailings");

        const offerStore = db.createObjectStore("offers", { keyPath: ["profileId", "rcOfferId"] });
        offerStore.createIndex("profileId", "profileId");
        offerStore.createIndex("rcOfferId", "rcOfferId");

        const sailingStore = db.createObjectStore("sailings", { keyPath: ["profileId", "rcSailingId"] });
        sailingStore.createIndex("profileId", "profileId");
        sailingStore.createIndex("rcSailingId", "rcSailingId");
        sailingStore.createIndex("sailDate", "sailDate");
        sailingStore.createIndex("ship", "ship");
        sailingStore.createIndex("region", "region");
        sailingStore.createIndex("nights", "nights");
        sailingStore.createIndex("offerId", "offerId");

        if (!db.objectStoreNames.contains("favorites")) {
          db.createObjectStore("favorites", { keyPath: "rcSailingId" });
        }
        if (!db.objectStoreNames.contains("reminders")) {
          const r = db.createObjectStore("reminders", { keyPath: "rcSailingId" });
          r.createIndex("fireAt", "fireAt");
        }
        if (!db.objectStoreNames.contains("profiles")) {
          const p = db.createObjectStore("profiles", { keyPath: "profileId" });
          p.createIndex("loyaltyId", "loyaltyId");
          p.put({
            profileId: "me",
            name: "Me",
            loyaltyId: null,
            source: "live",
            unnamed: false,
            addedAt: new Date().toISOString(),
            lastSyncAt: null,
          });
        }
      }

      // v5: per-profile disabled offers (excludes Annual Tier etc. from
      // both display and match calculation).
      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains("disabledOffers")) {
          // keyPath `id` is `${profileId}|${rcOfferId}`
          db.createObjectStore("disabledOffers", { keyPath: "id" });
        }
      }

      // v6: sailings keypath changes from [profileId, rcSailingId] to
      // [profileId, offerId, rcSailingId]. The old shape silently overwrote
      // a sailing whenever the same rcSailingId arrived under a different
      // offer for the same profile (very common — Annual Tier covers
      // everything plus you have specific offers covering subsets). The
      // new shape stores one row per (profile, offer, sailing) tuple so
      // disabling one offer doesn't make sailings disappear that are also
      // covered by another offer. Wipes the sailings store; user re-syncs.
      if (oldVersion < 6) {
        if (db.objectStoreNames.contains("sailings")) db.deleteObjectStore("sailings");
        const sailingStore = db.createObjectStore("sailings", {
          keyPath: ["profileId", "offerId", "rcSailingId"],
        });
        sailingStore.createIndex("profileId", "profileId");
        sailingStore.createIndex("rcSailingId", "rcSailingId");
        sailingStore.createIndex("offerId", "offerId");
        sailingStore.createIndex("sailDate", "sailDate");
        sailingStore.createIndex("ship", "ship");
        sailingStore.createIndex("region", "region");
        sailingStore.createIndex("nights", "nights");
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

// ── Profiles ───────────────────────────────────────────────────────────────
export async function listProfiles() {
  const db = await openDB();
  return storeGetAll(db, "profiles");
}

export async function getProfile(profileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("profiles", "readonly").objectStore("profiles").get(profileId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Find or create the profile that owns `loyaltyId`. First-ever sync rebinds
// the bootstrap "me" profile to the captured loyaltyId. Subsequent unknown
// loyaltyIds get a new profile with `unnamed: true` and a placeholder name.
export async function ensureProfile(loyaltyId) {
  if (!loyaltyId) throw new Error("loyaltyId required");
  const db = await openDB();
  const profiles = await storeGetAll(db, "profiles");

  const existing = profiles.find((p) => p.loyaltyId === loyaltyId);
  if (existing) return existing;

  const me = profiles.find((p) => p.profileId === "me");
  if (me && me.loyaltyId == null) {
    me.loyaltyId = loyaltyId;
    await putProfile(db, me);
    return me;
  }

  const profileId = `acct-${loyaltyId}`;
  const newProfile = {
    profileId,
    name: `Account ****${String(loyaltyId).slice(-4)}`,
    loyaltyId,
    source: "live",
    unnamed: true,
    addedAt: new Date().toISOString(),
    lastSyncAt: null,
  };
  await putProfile(db, newProfile);
  return newProfile;
}

function putProfile(db, profile) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("profiles", "readwrite");
    tx.objectStore("profiles").put(profile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function renameProfile(profileId, name) {
  const db = await openDB();
  const p = await getProfile(profileId);
  if (!p) throw new Error("Profile not found");
  p.name = name;
  p.unnamed = false;
  await putProfile(db, p);
  return p;
}

export async function markProfileSynced(profileId) {
  const db = await openDB();
  const p = await getProfile(profileId);
  if (!p) return null;
  p.lastSyncAt = new Date().toISOString();
  await putProfile(db, p);
  return p;
}

export async function deleteProfile(profileId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["profiles", "offers", "sailings"], "readwrite");
    tx.objectStore("profiles").delete(profileId);

    // Cursor-delete offers and sailings owned by this profile.
    deleteByProfileIndex(tx.objectStore("offers"), profileId);
    deleteByProfileIndex(tx.objectStore("sailings"), profileId);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function deleteByProfileIndex(store, profileId) {
  const idx = store.index("profileId");
  const req = idx.openCursor(IDBKeyRange.only(profileId));
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

// ── Offers / Sailings ──────────────────────────────────────────────────────
export async function upsertOffers(payload, profileId) {
  if (!profileId) throw new Error("profileId required");
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
        profileId,
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
          profileId,
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

  await markProfileSynced(profileId);
  return { offerCount, sailingCount, syncedAt: now };
}

// Returns aggregated rows: one entry per unique rcSailingId, with per-profile
// offer data nested under .profiles[profileId]. Also returns the profiles list,
// the raw offers list (each enriched with sailingCount + disabled flag), and
// a summary count of offers/matches.
//
// Offers in `disabledOffers` are excluded from sailing aggregation: their
// per-profile entries don't appear on cards and don't count toward matches.
// Sailings whose only offers are disabled disappear entirely.
export async function getAllData() {
  const db = await openDB();
  const [profiles, offers, sailings, favIds, reminders, disabledKeys] = await Promise.all([
    storeGetAll(db, "profiles"),
    storeGetAll(db, "offers"),
    storeGetAll(db, "sailings"),
    getFavoriteIds(),
    storeGetAll(db, "reminders"),
    getDisabledOfferKeys(),
  ]);

  const offerKey = (profileId, rcOfferId) => `${profileId}|${rcOfferId}`;
  const offerMap = new Map(offers.map((o) => [offerKey(o.profileId, o.rcOfferId), o]));
  const disabledSet = new Set(disabledKeys);
  const favSet = new Set(favIds);
  const reminderMap = new Map(reminders.map((r) => [r.rcSailingId, r]));

  // Pre-compute per-offer sailing counts (raw, before disabled filtering)
  const offerSailingCounts = new Map();
  for (const s of sailings) {
    const k = offerKey(s.profileId, s.offerId);
    offerSailingCounts.set(k, (offerSailingCounts.get(k) || 0) + 1);
  }

  // Group sailings by rcSailingId, merging per-profile entries — skipping
  // any sailing whose owning offer is disabled. With the v6 schema, a
  // single profile may have multiple rows for the same rcSailingId (one
  // per offer that covers it); first non-disabled offer encountered wins
  // for the per-profile display entry.
  const byRcSailingId = new Map();
  for (const s of sailings) {
    const k = offerKey(s.profileId, s.offerId);
    if (disabledSet.has(k)) continue;

    const profileOffer = offerMap.get(k) || null;
    const profileEntry = {
      profileId: s.profileId,
      offerId: s.offerId,
      offer: profileOffer,
      stateroomCategory: s.stateroomCategory,
      priceAfterOffer: s.priceAfterOffer,
      taxesFees: s.taxesFees,
    };

    let agg = byRcSailingId.get(s.rcSailingId);
    if (!agg) {
      let raw = null;
      try { raw = s.rawJson ? JSON.parse(s.rawJson) : null; } catch (_) {}
      agg = {
        rcSailingId: s.rcSailingId,
        ship: s.ship,
        shipCode: raw?.shipCode || null,
        sailDate: s.sailDate,
        returnDate: s.returnDate,
        nights: s.nights,
        itineraryName: s.itineraryName,
        itineraryCode: raw?.itineraryCode || null,
        region: s.region,
        departurePort: s.departurePort,
        departurePortCode: raw?.departurePort?.code || null,
        portsOfCall: s.portsOfCall ? JSON.parse(s.portsOfCall) : [],
        profiles: {},
        matchProfileIds: [],
        isFavorite: favSet.has(s.rcSailingId),
        reminder: reminderMap.get(s.rcSailingId) || null,
      };
      byRcSailingId.set(s.rcSailingId, agg);
    }
    if (!agg.profiles[s.profileId]) {
      agg.profiles[s.profileId] = profileEntry;
      agg.matchProfileIds.push(s.profileId);
    }
  }

  // Enrich offers with their sailing count + disabled flag for the manager UI
  const enrichedOffers = offers.map((o) => ({
    ...o,
    sailingCount: offerSailingCounts.get(offerKey(o.profileId, o.rcOfferId)) || 0,
    disabled: disabledSet.has(offerKey(o.profileId, o.rcOfferId)),
  }));

  return {
    profiles,
    offers: enrichedOffers,
    sailings: [...byRcSailingId.values()],
    counts: {
      profiles: profiles.length,
      uniqueSailings: byRcSailingId.size,
      totalOfferSailings: sailings.length,
      matches: [...byRcSailingId.values()].filter((s) => s.matchProfileIds.length > 1).length,
    },
  };
}

// ── Disabled offers ────────────────────────────────────────────────────────
export async function getDisabledOfferKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("disabledOffers", "readonly").objectStore("disabledOffers").getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function toggleOfferDisabled(profileId, rcOfferId) {
  const id = `${profileId}|${rcOfferId}`;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("disabledOffers", "readwrite");
    const store = tx.objectStore("disabledOffers");
    const getReq = store.get(id);
    let willBeDisabled;
    getReq.onsuccess = () => {
      if (getReq.result) {
        store.delete(id);
        willBeDisabled = false;
      } else {
        store.put({ id, profileId, rcOfferId, disabledAt: new Date().toISOString() });
        willBeDisabled = true;
      }
    };
    tx.oncomplete = () => resolve(willBeDisabled);
    tx.onerror = () => reject(tx.error);
  });
}

// ── Favorites ──────────────────────────────────────────────────────────────
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

// ── Reminders ──────────────────────────────────────────────────────────────
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

// ── Last sync (across all profiles) ────────────────────────────────────────
export async function getLastSync() {
  const profiles = await listProfiles();
  const stamps = profiles.map((p) => p.lastSyncAt).filter(Boolean);
  if (!stamps.length) return null;
  return stamps.reduce((latest, t) => (t > latest ? t : latest), "");
}

// ── Buddy export / import ──────────────────────────────────────────────────
const EXPORT_SCHEMA_VERSION = 1;

export async function exportProfileJson(profileId) {
  const db = await openDB();
  const profile = await getProfile(profileId);
  if (!profile) throw new Error("Profile not found");

  const offers = await getAllByIndex(db, "offers", "profileId", profileId);
  const sailings = await getAllByIndex(db, "sailings", "profileId", profileId);
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: { name: profile.name, loyaltyId: profile.loyaltyId },
    offers,
    sailings,
  };
}

function getAllByIndex(db, storeName, indexName, value) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function importProfileJson(json) {
  if (!json || json.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    throw new Error("Incompatible export format");
  }
  const db = await openDB();
  const incomingLoyaltyId = json.profile?.loyaltyId || null;

  // If a profile with this loyaltyId already exists, re-upsert into it.
  // Otherwise create a new imported profile.
  let profile = null;
  if (incomingLoyaltyId) {
    const all = await listProfiles();
    profile = all.find((p) => p.loyaltyId === incomingLoyaltyId) || null;
  }
  if (!profile) {
    const profileId = `imported-${Math.random().toString(36).slice(2, 9)}`;
    profile = {
      profileId,
      name: json.profile?.name || "Imported",
      loyaltyId: incomingLoyaltyId,
      source: "imported",
      unnamed: false,
      addedAt: new Date().toISOString(),
      lastSyncAt: json.exportedAt || new Date().toISOString(),
    };
    await putProfile(db, profile);
  }

  // Re-stamp profileId on imported rows so they belong to the local profile.
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["offers", "sailings"], "readwrite");
    const offerStore = tx.objectStore("offers");
    const sailingStore = tx.objectStore("sailings");
    for (const o of json.offers || []) offerStore.put({ ...o, profileId: profile.profileId });
    for (const s of json.sailings || []) sailingStore.put({ ...s, profileId: profile.profileId });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return { profileId: profile.profileId, name: profile.name };
}
