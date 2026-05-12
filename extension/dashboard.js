// dashboard.js — Offer+ full-tab dashboard

// ── State ──────────────────────────────────────────────────────────────────
let allSailings = [];           // aggregated by rcSailingId (post disabled-offer filter)
let profiles = [];              // [{ profileId, name, ... }]
let allOffers = [];             // raw offers, enriched with sailingCount + disabled
let counts = { profiles: 0, uniqueSailings: 0, totalOfferSailings: 0, matches: 0 };
let favSet = new Set();
let bookedSet = new Set();
let openOfferLists = new Set(); // remembered between modal renders
let filters = {
  search: "",
  profileIds: new Set(),        // empty = all profiles
  ships: new Set(),
  regions: new Set(),
  departurePorts: new Set(),
  rooms: new Set(),
  minNights: 0,
  sailFrom: "",
  sailTo: "",
  favOnly: false,
  bookedOnly: false,
  matchOnly: false,
};
let sortKey = "sailDate";
let view = "list";

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  restoreStateFromHash();
  bindControls();
  await loadData();
}

async function loadData() {
  setStatus("Loading…");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_ALL" });
    if (!resp?.ok) { setStatus("Error loading data"); return; }
    allSailings = resp.data.sailings;
    profiles = resp.data.profiles || [];
    allOffers = resp.data.offers || [];
    counts = resp.data.counts || counts;
    favSet = new Set(allSailings.filter((s) => s.isFavorite).map((s) => s.rcSailingId));
    bookedSet = new Set(allSailings.filter((s) => s.booking).map((s) => s.rcSailingId));
    updateFavToggleLabel();
    updateBookedToggleLabel();
    updateMatchToggleLabel();
    populateFacets();
    renderNamingBanner();
    render();
    const syncResp = await chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" });
    if (syncResp?.lastSync) setStatus("Last sync: " + fmtDate(syncResp.lastSync));
    else setStatus("Never synced — visit Club Royale offers page and click Sync");
  } catch (e) {
    setStatus("Error: " + e.message);
  }
}

function profileById(id) {
  return profiles.find((p) => p.profileId === id) || null;
}

// ── Controls ───────────────────────────────────────────────────────────────
function bindControls() {
  document.getElementById("search").addEventListener("input", (e) => { filters.search = e.target.value; render(); });
  document.getElementById("sort-select").addEventListener("change", (e) => { sortKey = e.target.value; render(); });
  document.getElementById("nights-range").addEventListener("input", (e) => {
    filters.minNights = +e.target.value;
    document.getElementById("nights-val").textContent = filters.minNights === 0 ? "Any" : `≥ ${filters.minNights}n`;
    render();
  });
  document.getElementById("sail-from").addEventListener("input", (e) => { filters.sailFrom = e.target.value; render(); });
  document.getElementById("sail-to").addEventListener("input", (e) => { filters.sailTo = e.target.value; render(); });
  document.getElementById("sail-preset-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#sail-preset-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const days = chip.dataset.days;
    const customInputs = document.getElementById("sail-custom-inputs");
    if (days === "custom") {
      customInputs.style.display = "";
    } else if (days === "0") {
      filters.sailFrom = "";
      filters.sailTo = "";
      document.getElementById("sail-from").value = "";
      document.getElementById("sail-to").value = "";
      customInputs.style.display = "none";
      render();
    } else {
      filters.sailFrom = todayISO();
      filters.sailTo = addDaysISO(+days);
      document.getElementById("sail-from").value = filters.sailFrom;
      document.getElementById("sail-to").value = filters.sailTo;
      customInputs.style.display = "none";
      render();
    }
  });
  document.querySelectorAll(".filter-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const map = {
        ships: "ship-chips", regions: "region-chips", rooms: "rooms-section",
        profiles: "profile-chips",
        departurePorts: "departure-chips",
      };
      const key = {
        ships: "ships", regions: "regions", rooms: "rooms",
        profiles: "profileIds",
        departurePorts: "departurePorts",
      }[target];
      const container = document.getElementById(map[target]);
      if (!container || !key) return;
      filters[key].clear();
      container.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
      render();
    });
  });
  document.getElementById("reset-btn").addEventListener("click", resetFilters);
  document.getElementById("fav-toggle").addEventListener("click", () => {
    filters.favOnly = !filters.favOnly;
    document.getElementById("fav-toggle").classList.toggle("active", filters.favOnly);
    render();
  });
  document.getElementById("booked-toggle").addEventListener("click", () => {
    filters.bookedOnly = !filters.bookedOnly;
    document.getElementById("booked-toggle").classList.toggle("active", filters.bookedOnly);
    render();
  });
  document.getElementById("match-toggle").addEventListener("click", () => {
    filters.matchOnly = !filters.matchOnly;
    document.getElementById("match-toggle").classList.toggle("active", filters.matchOnly);
    render();
  });
  document.getElementById("profiles-btn").addEventListener("click", openProfilesModal);
  document.getElementById("export-mobile-btn").addEventListener("click", async () => {
    const btn = document.getElementById("export-mobile-btn");
    btn.textContent = "⏳";
    btn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "GET_EXPORT_DATA" });
      if (!resp?.ok) throw new Error(resp?.error || "Export failed");
      const html = generateMobileHtml(resp.data);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: "offer-plus-" + new Date().toISOString().slice(0, 10) + ".html",
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e.message);
    } finally {
      btn.textContent = "📱";
      btn.disabled = false;
    }
  });
  document.getElementById("sync-mobile-btn").addEventListener("click", async () => {
    const btn = document.getElementById("sync-mobile-btn");
    btn.textContent = "⏳";
    btn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "GET_EXPORT_DATA" });
      if (!resp?.ok) throw new Error(resp?.error || "Failed to load data");
      await window.startMobileSync(resp.data);
    } catch (e) {
      alert("Sync failed: " + e.message);
    } finally {
      btn.textContent = "🔄 Sync";
      btn.disabled = false;
    }
  });
  document.getElementById("sync-mobile-close").addEventListener("click", () => window.stopMobileSync());
  document.getElementById("sync-mobile-backdrop").addEventListener("click", () => window.stopMobileSync());
  document.getElementById("profiles-modal-close").addEventListener("click", closeProfilesModal);
  document.querySelector("#profiles-modal .modal-backdrop").addEventListener("click", closeProfilesModal);
  document.getElementById("import-file").addEventListener("change", handleImportFile);
  document.getElementById("export-bookings-btn").addEventListener("click", exportAllBookings);
  document.querySelectorAll("#view-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = btn.dataset.view;
      document.querySelectorAll("#view-toggle button").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("list-view").style.display   = view === "list"   ? "" : "none";
      document.getElementById("offers-view").style.display = view === "offers" ? "" : "none";
      render();
    });
  });
}

function resetFilters() {
  filters = {
    search: "",
    profileIds: new Set(),
    ships: new Set(), regions: new Set(),
    departurePorts: new Set(),
    rooms: new Set(),
    minNights: 0, sailFrom: "", sailTo: "",
    favOnly: false, bookedOnly: false, matchOnly: false,
  };
  document.getElementById("search").value = "";
  document.getElementById("nights-range").value = 0;
  document.getElementById("nights-val").textContent = "Any";
  document.getElementById("sail-from").value = "";
  document.getElementById("sail-to").value = "";
  document.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
  const anyChip = document.querySelector('#sail-preset-chips .chip[data-days="0"]');
  if (anyChip) anyChip.classList.add("active");
  document.getElementById("sail-custom-inputs").style.display = "none";
  document.getElementById("fav-toggle").classList.remove("active");
  document.getElementById("booked-toggle").classList.remove("active");
  document.getElementById("match-toggle").classList.remove("active");
  render();
}


// ── Facets ─────────────────────────────────────────────────────────────────
function populateFacets() {
  // Ship/Region/Departure are canonical (top-level on the aggregated row)
  const ships = [...new Set(allSailings.map((s) => s.ship).filter(Boolean))].sort();
  const regions = [...new Set(allSailings.map((s) => s.region).filter(Boolean))].sort();
  const departurePorts = [...new Set(allSailings.map((s) => s.departurePort).filter(Boolean))].sort();

  renderChips("ship-chips", ships, "ships");
  renderChips("region-chips", regions, "regions");
  renderChips("departure-chips", departurePorts, "departurePorts");
  renderProfileRooms();
  renderProfileChips();

  const maxNights = Math.max(...allSailings.map((s) => s.nights || 0), 0);
  document.getElementById("nights-range").max = maxNights;
}

// Per-profile room filter — one chip group per profile that has any rooms.
// `filters.rooms` is a Set of composite keys `"profileId|roomName"`.
function renderProfileRooms() {
  const container = document.getElementById("rooms-section");
  if (!container) return;
  container.innerHTML = "";

  // Build profileId -> sorted rooms[] from synced data
  const roomsByProfile = new Map();
  for (const s of allSailings) {
    for (const pid of Object.keys(s.profiles || {})) {
      const r = s.profiles[pid].stateroomCategory;
      if (!r) continue;
      if (!roomsByProfile.has(pid)) roomsByProfile.set(pid, new Set());
      roomsByProfile.get(pid).add(r);
    }
  }

  // Order: profiles array order so it matches the rest of the UI
  for (const profile of profiles) {
    const set = roomsByProfile.get(profile.profileId);
    if (!set || !set.size) continue;
    const rooms = [...set].sort();
    const group = document.createElement("div");
    group.className = "rooms-profile-group";
    const dot = `<span class="profile-dot" style="background:${profileColor(profile.profileId)}"></span>`;
    const label = profiles.length > 1
      ? `${dot}${esc(profile.name)}'s rooms`
      : `${dot}Rooms`;
    group.innerHTML = `<div class="rooms-profile-label">${label}</div><div class="chip-group" data-profile-id="${esc(profile.profileId)}"></div>`;
    const chipsEl = group.querySelector(".chip-group");
    for (const r of rooms) {
      const key = `${profile.profileId}|${r}`;
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = r;
      if (filters.rooms.has(key)) chip.classList.add("active");
      chip.addEventListener("click", () => {
        if (filters.rooms.has(key)) filters.rooms.delete(key);
        else filters.rooms.add(key);
        chip.classList.toggle("active", filters.rooms.has(key));
        render();
      });
      chipsEl.appendChild(chip);
    }
    container.appendChild(group);
  }
}

function renderChips(containerId, values, filterKey) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  for (const v of values) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = v;
    chip.addEventListener("click", () => {
      if (filters[filterKey].has(v)) filters[filterKey].delete(v);
      else filters[filterKey].add(v);
      chip.classList.toggle("active", filters[filterKey].has(v));
      render();
    });
    el.appendChild(chip);
  }
}

function renderProfileChips() {
  const section = document.getElementById("profiles-section");
  const el = document.getElementById("profile-chips");
  el.innerHTML = "";
  // Hide the section unless there are 2+ profiles
  if (profiles.length < 2) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";
  for (const p of profiles) {
    const chip = document.createElement("button");
    chip.className = "chip profile-chip";
    chip.innerHTML = `<span class="profile-dot" style="background:${profileColor(p.profileId)}"></span>${esc(p.name)}`;
    chip.addEventListener("click", () => {
      if (filters.profileIds.has(p.profileId)) filters.profileIds.delete(p.profileId);
      else filters.profileIds.add(p.profileId);
      chip.classList.toggle("active", filters.profileIds.has(p.profileId));
      render();
    });
    el.appendChild(chip);
  }
}

// Hash a profileId to a stable hue.
function profileColor(profileId) {
  let h = 0;
  for (let i = 0; i < profileId.length; i++) h = (h * 31 + profileId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 60%)`;
}

// ── Filtering + Sorting ────────────────────────────────────────────────────
function applyFilters() {
  const q = filters.search.toLowerCase();
  return allSailings.filter((s) => {
    if (filters.favOnly && !favSet.has(s.rcSailingId)) return false;
    if (filters.bookedOnly && !bookedSet.has(s.rcSailingId)) return false;
    if (filters.matchOnly && (s.matchProfileIds || []).length < 2) return false;

    // Profile filter — sailing passes only if EVERY selected profile has an
    // offer for it (AND semantics). This is the Companion Match use case:
    // "show me what all of us can book together."
    if (filters.profileIds.size) {
      const sailingProfiles = new Set(s.matchProfileIds || []);
      for (const pid of filters.profileIds) {
        if (!sailingProfiles.has(pid)) return false;
      }
    }

    if (filters.ships.size && !filters.ships.has(s.ship)) return false;
    if (filters.regions.size && !filters.regions.has(s.region)) return false;
    if (filters.departurePorts.size && !filters.departurePorts.has(s.departurePort)) return false;

    // Per-profile room filter: each entry is "profileId|roomName". Group by
    // profile and require the sailing's matching profile entry's room to be
    // in that profile's selected set. AND across profiles.
    if (filters.rooms.size) {
      const allowedByProfile = new Map();
      for (const entry of filters.rooms) {
        const sep = entry.indexOf("|");
        if (sep < 0) continue;
        const pid = entry.slice(0, sep);
        const room = entry.slice(sep + 1);
        if (!allowedByProfile.has(pid)) allowedByProfile.set(pid, new Set());
        allowedByProfile.get(pid).add(room);
      }
      for (const [pid, allowed] of allowedByProfile) {
        const profileRoom = s.profiles?.[pid]?.stateroomCategory;
        if (!profileRoom || !allowed.has(profileRoom)) return false;
      }
    }

    if (filters.minNights > 0 && (s.nights || 0) < filters.minNights) return false;
    if (filters.sailFrom && s.sailDate < filters.sailFrom) return false;
    if (filters.sailTo && s.sailDate > filters.sailTo) return false;

    if (q) {
      const profileTexts = Object.values(s.profiles || {}).flatMap((p) => [
        p.offer?.title, p.offer?.description, p.stateroomCategory,
      ]).filter(Boolean);
      const hay = [s.ship, s.itineraryName, s.region, s.departurePort, ...(s.portsOfCall || []), ...profileTexts].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Earliest book-by across all profiles (for sort + urgency)
function earliestBookBy(s) {
  const dates = Object.values(s.profiles || {}).map((p) => p.offer?.bookByDate).filter(Boolean);
  if (!dates.length) return null;
  return dates.reduce((a, b) => (a < b ? a : b));
}

function applySorting(sailings) {
  return [...sailings].sort((a, b) => {
    switch (sortKey) {
      case "sailDate": return (a.sailDate || "").localeCompare(b.sailDate || "");
      case "sailDate-desc": return (b.sailDate || "").localeCompare(a.sailDate || "");
      case "bookBy": return (earliestBookBy(a) || "9999").localeCompare(earliestBookBy(b) || "9999");
      case "nights-desc": return (b.nights || 0) - (a.nights || 0);
      case "nights": return (a.nights || 0) - (b.nights || 0);
      default: return 0;
    }
  });
}

// ── Rendering ──────────────────────────────────────────────────────────────
function render() {
  const filtered = applyFilters();
  const sorted = applySorting(filtered);
  const matchCount = sorted.filter((s) => (s.matchProfileIds || []).length > 1).length;
  const summary = profiles.length > 1
    ? `${sorted.length} of ${counts.uniqueSailings} sailings · ${matchCount} match${matchCount !== 1 ? "es" : ""}`
    : `${sorted.length} sailing${sorted.length !== 1 ? "s" : ""} of ${counts.uniqueSailings}`;
  document.getElementById("result-count").textContent = view === "offers" ? "" : summary;
  if (view === "list") renderList(sorted);
  else if (view === "offers") renderOffers();
}

function renderList(sailings) {
  const el = document.getElementById("list-view");
  if (!sailings.length) {
    el.innerHTML = `<div class="empty-state"><h3>No sailings match</h3><p>Try adjusting your filters or syncing from the Club Royale offers page.</p></div>`;
    return;
  }
  el.innerHTML = "";
  for (const s of sailings) el.appendChild(buildCard(s));
}

function buildCard(s) {
  const card = document.createElement("div");
  card.className = "sailing-card";

  const bookByDate = earliestBookBy(s);
  const daysLeft = bookByDate ? daysUntil(bookByDate) : null;
  const urgencyBadge = daysLeft !== null && daysLeft <= 7
    ? `<span class="badge badge-warn">${daysLeft <= 0 ? "Expired" : `${daysLeft}d left`}</span>`
    : "";

  const isFav = favSet.has(s.rcSailingId);
  const isBooked = bookedSet.has(s.rcSailingId);
  const isMatch = (s.matchProfileIds || []).length > 1;

  // Profile dots in the header
  const profileDots = (s.matchProfileIds || []).map((pid) => {
    const p = profileById(pid);
    return `<span class="profile-dot" style="background:${profileColor(pid)}" title="${esc(p?.name || pid)}"></span>`;
  }).join("");

  const matchBadge = isMatch ? `<span class="badge badge-match">🔗 Match · ${s.matchProfileIds.length}</span>` : "";

  const itinUrl = buildItineraryUrl(s);
  const itinLink = itinUrl
    ? `<a class="card-itin-link" href="${esc(itinUrl)}" target="_blank" rel="noopener" title="View itinerary + ports of call on royalcaribbean.com">View on RC ↗</a>`
    : "";

  // Per-room badge with profile color dot(s). Merge identical rooms across
  // profiles into a single multi-dot badge so the card stays compact.
  const roomToProfiles = new Map();
  for (const pid of (s.matchProfileIds || [])) {
    const r = s.profiles?.[pid]?.stateroomCategory;
    if (!r) continue;
    if (!roomToProfiles.has(r)) roomToProfiles.set(r, []);
    roomToProfiles.get(r).push(pid);
  }
  const roomBadges = [...roomToProfiles.entries()].map(([room, pids]) => {
    const dots = pids.map((pid) => {
      const name = profileById(pid)?.name || pid;
      return `<span class="profile-dot" style="background:${profileColor(pid)}" title="${esc(name)}"></span>`;
    }).join("");
    return `<span class="badge badge-room">${dots}${esc(room)}</span>`;
  }).join("");

  // Unique offer codes across the profiles
  const offerCodes = [...new Set(
    (s.matchProfileIds || []).map((pid) => s.profiles?.[pid]?.offerId).filter(Boolean)
  )];
  const offerCodeTags = offerCodes.map((c) => `<span class="card-offer-code">${esc(c)}</span>`).join("");

  // Card row 1: ship · offer codes · profile dots · badges · view-on-rc · booked · star
  const row1 = `
    <div class="card-row1">
      <span class="card-ship">${esc(s.ship || "Unknown Ship")}</span>
      ${offerCodeTags}
      <span class="profile-dots">${profileDots}</span>
      <div class="card-badges">
        ${matchBadge}
        ${roomBadges}
        ${urgencyBadge}
        ${itinLink}
        <button class="card-booked${isBooked ? " active" : ""}" title="${isBooked ? "Unmark as booked" : "Mark as booked"}">${isBooked ? "✓ Booked" : "✓ Book"}</button>
        <button class="card-fav${isFav ? " active" : ""}" data-id="${esc(s.rcSailingId)}" title="${isFav ? "Remove from favorites" : "Add to favorites"}">${isFav ? "★" : "☆"}</button>
      </div>
    </div>`;

  // Row 2: canonical sailing info (date, nights, departure port, region, itinerary)
  const parts2 = [
    `<span class="card-date">${fmtShortDate(s.sailDate)}</span>`,
    `<span class="card-nights">${s.nights}n</span>`,
    s.departurePort ? `<span class="card-sep">·</span><span class="card-port">from ${esc(s.departurePort)}</span>` : "",
    s.region ? `<span class="card-sep">·</span><span class="card-port">${esc(s.region)}</span>` : "",
    s.itineraryName ? `<span class="card-sep">·</span><span class="card-itinerary">${esc(s.itineraryName)}</span>` : "",
  ].filter(Boolean).join("");
  const row2 = `<div class="card-row2">${parts2}</div>`;

  // Row 3: ports of call
  const portChips = (s.portsOfCall || []).map((p) => `<span class="port-chip">${esc(p)}</span>`).join("");
  const row3 = portChips ? `<div class="card-row3">${portChips}</div>` : "";

  // Per-profile rows: each profile's offer + room + book-by
  const profileRows = (s.matchProfileIds || []).map((pid) => {
    const pdata = s.profiles[pid] || {};
    const p = profileById(pid);
    const name = p?.name || pid;
    const bookBy = pdata.offer?.bookByDate;
    const bbDays = bookBy ? daysUntil(bookBy) : null;
    const bbStr = bookBy
      ? `<span class="profile-row-bookby${bbDays !== null && bbDays <= 14 ? " urgent" : ""}">book by ${fmtShortDate(bookBy)}${bbDays !== null ? ` · ${bbDays > 0 ? bbDays + "d" : "expired"}` : ""}</span>`
      : "";
    const desc = pdata.offer?.description ? `<span class="profile-row-desc">${esc(pdata.offer.description)}</span>` : "";
    const room = pdata.stateroomCategory ? `<span class="profile-row-room">${esc(pdata.stateroomCategory)}</span>` : "";
    const price = pdata.priceAfterOffer != null
      ? `<span class="profile-row-price">$${pdata.priceAfterOffer.toLocaleString()}${pdata.taxesFees != null ? ` <span class="card-price-taxes">+$${pdata.taxesFees}</span>` : ""}</span>`
      : "";
    return `
      <div class="profile-row">
        <span class="profile-row-name" style="color:${profileColor(pid)}">
          <span class="profile-dot" style="background:${profileColor(pid)}"></span>${esc(name)}
        </span>
        ${desc}${room}${price}${bbStr}
      </div>`;
  }).join("");

  // Booking detail panel — only shown when this sailing is booked. Contains
  // Add-to-Google-Calendar + .ics download buttons, plus a notes textarea.
  const bookingDetail = isBooked ? buildBookingDetailHtml(s) : "";

  card.innerHTML = row1 + row2 + row3 + profileRows + bookingDetail;
  card.dataset.sailingId = s.rcSailingId;

  attachBookedControl(card, s);
  attachFavControl(card, s);
  if (isBooked) attachBookingDetailControls(card, s);
  return card;
}

function buildBookingDetailHtml(s) {
  const notes = s.booking?.notes || "";
  const gcalUrl = buildGoogleCalendarUrl(s);
  return `
    <div class="booking-detail">
      <div class="booking-cal-row">
        <a class="cal-btn cal-btn-google" href="${esc(gcalUrl)}" target="_blank" rel="noopener" title="Add to Google Calendar">📅 Google Calendar</a>
        <button class="cal-btn cal-btn-ics" title="Download .ics file (works with Apple Calendar, Outlook, etc.)">↓ Download .ics</button>
      </div>
      <textarea class="booking-notes" placeholder="Confirmation #, room #, dining time, notes…" rows="2">${esc(notes)}</textarea>
    </div>`;
}

function attachBookedControl(card, s) {
  const btn = card.querySelector(".card-booked");
  if (!btn) return;
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = s.rcSailingId;
    const wasBooked = bookedSet.has(id);

    // Optimistic toggle
    if (wasBooked) bookedSet.delete(id);
    else bookedSet.add(id);
    s.booking = wasBooked ? null : { rcSailingId: id, bookedAt: new Date().toISOString(), notes: "" };
    updateBookedToggleLabel();

    // Rebuild this single card in place
    const replacement = buildCard(s);
    card.replaceWith(replacement);

    try {
      const resp = await chrome.runtime.sendMessage({ type: "BOOKING_TOGGLE", rcSailingId: id });
      if (!resp?.ok) throw new Error(resp?.error || "Toggle failed");
    } catch (err) {
      // Revert
      if (wasBooked) bookedSet.add(id);
      else bookedSet.delete(id);
      s.booking = wasBooked ? { rcSailingId: id, bookedAt: new Date().toISOString(), notes: "" } : null;
      updateBookedToggleLabel();
      const reverted = buildCard(s);
      replacement.replaceWith(reverted);
      setStatus("Booking update failed: " + err.message);
    }
  });
}

function attachBookingDetailControls(card, s) {
  // .ics download
  const icsBtn = card.querySelector(".cal-btn-ics");
  if (icsBtn) {
    icsBtn.addEventListener("click", () => {
      const blob = buildIcsBlob([s]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.ship || "cruise").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${s.sailDate}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  // Notes textarea — debounced save
  const notes = card.querySelector(".booking-notes");
  if (notes) {
    let timer = null;
    notes.addEventListener("input", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const resp = await chrome.runtime.sendMessage({
            type: "BOOKING_UPDATE_NOTES",
            rcSailingId: s.rcSailingId,
            notes: notes.value,
          });
          if (!resp?.ok) throw new Error(resp?.error || "Save failed");
          if (s.booking) s.booking.notes = notes.value;
        } catch (err) {
          setStatus("Notes save failed: " + err.message);
        }
      }, 500);
    });
  }
}

function updateBookedToggleLabel() {
  const btn = document.getElementById("booked-toggle");
  if (!btn) return;
  const n = bookedSet.size;
  btn.textContent = n > 0 ? `✓ Booked (${n})` : "✓ Booked";
}

function attachFavControl(card, s) {
  const favBtn = card.querySelector(".card-fav");
  if (!favBtn) return;
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const id = s.rcSailingId;
    const wasFav = favSet.has(id);
    if (wasFav) favSet.delete(id);
    else favSet.add(id);
    favBtn.classList.toggle("active", !wasFav);
    favBtn.textContent = wasFav ? "☆" : "★";
    favBtn.title = wasFav ? "Add to favorites" : "Remove from favorites";
    updateFavToggleLabel();
    if (filters.favOnly && wasFav) render();

    try {
      const resp = await chrome.runtime.sendMessage({ type: "FAV_TOGGLE", rcSailingId: id });
      if (!resp?.ok) throw new Error(resp?.error || "Toggle failed");
    } catch (err) {
      if (wasFav) favSet.add(id);
      else favSet.delete(id);
      favBtn.classList.toggle("active", wasFav);
      favBtn.textContent = wasFav ? "★" : "☆";
      updateFavToggleLabel();
      setStatus("Favorite update failed: " + err.message);
    }
  });
}

function updateFavToggleLabel() {
  const btn = document.getElementById("fav-toggle");
  if (!btn) return;
  const n = favSet.size;
  btn.textContent = n > 0 ? `★ Favorites (${n})` : "☆ Favorites";
}

function updateMatchToggleLabel() {
  const btn = document.getElementById("match-toggle");
  if (!btn) return;
  const n = counts.matches || 0;
  btn.textContent = n > 0 ? `🔗 Match (${n})` : "🔗 Match";
  btn.disabled = profiles.length < 2;
}

// ── Naming banner for unnamed profiles ─────────────────────────────────────
function renderNamingBanner() {
  const banner = document.getElementById("naming-banner");
  const unnamed = profiles.filter((p) => p.unnamed);
  if (!unnamed.length) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }
  const p = unnamed[0];
  banner.style.display = "";
  banner.innerHTML = `
    <span>New account detected (${esc(p.name)}). Name this profile:</span>
    <input type="text" class="banner-input" placeholder="e.g. Sarah" />
    <button class="banner-save">Save</button>
    <button class="banner-skip">Skip</button>
  `;
  const input = banner.querySelector(".banner-input");
  input.focus();
  banner.querySelector(".banner-save").addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const resp = await chrome.runtime.sendMessage({ type: "RENAME_PROFILE", profileId: p.profileId, name });
    if (resp?.ok) {
      await loadData();
    } else {
      setStatus("Rename failed: " + (resp?.error || "unknown"));
    }
  });
  banner.querySelector(".banner-skip").addEventListener("click", async () => {
    // Skip just clears `unnamed` flag without renaming
    const resp = await chrome.runtime.sendMessage({ type: "RENAME_PROFILE", profileId: p.profileId, name: p.name });
    if (resp?.ok) await loadData();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") banner.querySelector(".banner-save").click();
  });
}

// ── Profile manager modal ──────────────────────────────────────────────────
function openProfilesModal() {
  setModalStatus("");
  renderProfilesModal();
  document.getElementById("profiles-modal").style.display = "";
}

function closeProfilesModal() {
  document.getElementById("profiles-modal").style.display = "none";
}

function renderProfilesModal() {
  const body = document.getElementById("profiles-modal-body");
  body.innerHTML = "";
  if (!profiles.length) {
    body.innerHTML = `<p class="modal-empty">No profiles yet. Sync from RC to create your first profile.</p>`;
    return;
  }
  for (const p of profiles) {
    const profileOffers = allOffers.filter((o) => o.profileId === p.profileId);
    const offerCount = profileOffers.length;
    const sailingCount = countSailingsForProfile(p.profileId);
    const disabledCount = profileOffers.filter((o) => o.disabled).length;
    const lastSync = p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString() : "Never";
    const expanded = openOfferLists.has(p.profileId);

    const row = document.createElement("div");
    row.className = "profile-row-mgr";
    row.innerHTML = `
      <div class="profile-row-mgr-main">
        <span class="profile-dot" style="background:${profileColor(p.profileId)}"></span>
        <input class="profile-name-edit" value="${esc(p.name)}" data-id="${esc(p.profileId)}" />
        <span class="profile-source-badge">${p.source === "imported" ? "imported" : "live"}</span>
      </div>
      <div class="profile-row-mgr-meta">
        ${offerCount} offer${offerCount !== 1 ? "s" : ""} · ${sailingCount} sailing${sailingCount !== 1 ? "s" : ""}${disabledCount ? ` · ${disabledCount} excluded` : ""} · last sync: ${lastSync}
      </div>
      <div class="profile-row-mgr-actions">
        <button class="btn-secondary profile-action-export" data-id="${esc(p.profileId)}">Export</button>
        <button class="btn-secondary profile-action-delete" data-id="${esc(p.profileId)}" ${p.profileId === "me" ? "disabled" : ""}>Delete</button>
      </div>
      <div class="profile-row-mgr-offers">
        <button class="offers-toggle" data-id="${esc(p.profileId)}">${expanded ? "▾" : "▸"} ${offerCount} offer${offerCount !== 1 ? "s" : ""}</button>
        <div class="offers-list" data-id="${esc(p.profileId)}" style="display:${expanded ? "" : "none"}"></div>
      </div>
    `;
    body.appendChild(row);

    if (expanded) renderOffersList(row.querySelector(".offers-list"), p.profileId, profileOffers);
  }

  body.querySelectorAll(".profile-name-edit").forEach((input) => {
    let original = input.value;
    input.addEventListener("change", async () => {
      const name = input.value.trim();
      if (!name || name === original) { input.value = original; return; }
      const resp = await chrome.runtime.sendMessage({ type: "RENAME_PROFILE", profileId: input.dataset.id, name });
      if (resp?.ok) { original = name; await loadData(); renderProfilesModal(); }
    });
  });
  body.querySelectorAll(".profile-action-export").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const resp = await chrome.runtime.sendMessage({ type: "EXPORT_PROFILE", profileId: btn.dataset.id });
      if (!resp?.ok) { setStatus("Export failed: " + (resp?.error || "")); return; }
      const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `crf-profile-${(resp.data.profile?.name || "export").replace(/[^a-z0-9]+/gi, "-")}.json`;
      a.click();
    });
  });
  body.querySelectorAll(".profile-action-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this profile? Their offers and sailings will be removed.")) return;
      const resp = await chrome.runtime.sendMessage({ type: "DELETE_PROFILE", profileId: btn.dataset.id });
      if (resp?.ok) { await loadData(); renderProfilesModal(); }
      else setStatus("Delete failed: " + (resp?.error || ""));
    });
  });
  body.querySelectorAll(".offers-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (openOfferLists.has(id)) openOfferLists.delete(id);
      else openOfferLists.add(id);
      renderProfilesModal();
    });
  });
}

function renderOffersList(container, profileId, offers) {
  container.innerHTML = "";
  if (!offers.length) {
    container.innerHTML = `<div class="offers-empty">No offers yet for this profile.</div>`;
    return;
  }
  // Sort: enabled first, then by sailingCount desc, then by title
  const sorted = [...offers].sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    if (b.sailingCount !== a.sailingCount) return b.sailingCount - a.sailingCount;
    return (a.title || "").localeCompare(b.title || "");
  });
  for (const o of sorted) {
    const row = document.createElement("label");
    row.className = "offer-row";
    if (o.disabled) row.classList.add("disabled");
    row.innerHTML = `
      <input type="checkbox" ${o.disabled ? "" : "checked"} />
      <span class="offer-row-title">${esc(o.title || o.rcOfferId)}</span>
      <span class="offer-row-meta">${o.sailingCount} sailing${o.sailingCount !== 1 ? "s" : ""}${o.disabled ? " · excluded" : ""}</span>
    `;
    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      const resp = await chrome.runtime.sendMessage({
        type: "OFFER_TOGGLE_DISABLED",
        profileId,
        rcOfferId: o.rcOfferId,
      });
      if (!resp?.ok) {
        checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
        setStatus("Toggle failed: " + (resp?.error || ""));
        return;
      }
      await loadData();
      renderProfilesModal();
    });
    container.appendChild(row);
  }
}

function countSailingsForProfile(profileId) {
  return allSailings.filter((s) => s.profiles?.[profileId]).length;
}

async function handleImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  setModalStatus(`Reading ${file.name}…`, "info");
  console.log("[CRF] import: reading file", file.name, "size", file.size);
  try {
    const text = await file.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      throw new Error("File is not valid JSON: " + parseErr.message);
    }
    console.log("[CRF] import: parsed JSON, schema=", json?.schemaVersion, "offers=", json?.offers?.length, "sailings=", json?.sailings?.length, "profile=", json?.profile);
    if (!json?.schemaVersion) throw new Error("Missing schemaVersion — not a CRF export file");
    if (!Array.isArray(json.offers) || !Array.isArray(json.sailings)) {
      throw new Error("Export is missing offers/sailings");
    }

    setModalStatus("Importing…", "info");
    const resp = await chrome.runtime.sendMessage({ type: "IMPORT_PROFILE", json });
    console.log("[CRF] import: response", resp);
    if (!resp?.ok) throw new Error(resp?.error || "Import failed");

    // Detect re-import into existing profile vs new profile creation
    const incomingName = json.profile?.name || "Imported";
    const existedBefore = profiles.some((p) => p.profileId === resp.profileId);
    await loadData();
    renderProfilesModal();

    const verb = existedBefore ? "Re-imported into" : "Imported as new profile";
    setModalStatus(`✓ ${verb} "${resp.name || incomingName}" — ${json.offers.length} offers, ${json.sailings.length} sailings`, "ok");
  } catch (err) {
    console.error("[CRF] import error", err);
    setModalStatus("Import failed: " + err.message, "error");
  } finally {
    e.target.value = "";
  }
}

function exportAllBookings() {
  const bookedSailings = allSailings.filter((s) => bookedSet.has(s.rcSailingId));
  if (!bookedSailings.length) {
    setModalStatus("No bookings yet — mark a sailing as booked first.", "info");
    return;
  }
  const blob = buildIcsBlob(bookedSailings);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `offer-plus-bookings-${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setModalStatus(`✓ Exported ${bookedSailings.length} booking${bookedSailings.length !== 1 ? "s" : ""} as .ics`, "ok");
}

function setModalStatus(msg, kind) {
  const el = document.getElementById("modal-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "modal-status" + (kind ? " " + kind : "");
}

// ── Calendar export (ICS + Google Calendar) ────────────────────────────────
// All-day multi-day events: end date is EXCLUSIVE in both Google Calendar
// and the iCalendar spec, so we always add +1 day to the return date.

function buildGoogleCalendarUrl(s) {
  const startDate = (s.sailDate || "").replace(/-/g, "");
  const endIso = isoAddDays(s.returnDate || isoAddDays(s.sailDate, s.nights || 0), 1);
  const endDate = endIso.replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: buildEventTitle(s),
    dates: `${startDate}/${endDate}`,
    location: s.departurePort || "",
    details: buildEventDescription(s),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Returns a Blob (text/calendar) containing a VCALENDAR with one VEVENT per
// sailing — single .ics file works for both individual and bulk exports.
function buildIcsBlob(sailings) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Offer+//Cruise Bookings//EN", "CALSCALE:GREGORIAN"];
  for (const s of sailings) {
    const startCompact = (s.sailDate || "").replace(/-/g, "");
    const endIso = isoAddDays(s.returnDate || isoAddDays(s.sailDate, s.nights || 0), 1);
    const endCompact = endIso.replace(/-/g, "");
    const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:offer-plus-${s.rcSailingId}@offerplus.local`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${startCompact}`);
    lines.push(`DTEND;VALUE=DATE:${endCompact}`);
    lines.push(`SUMMARY:${icsEscape(buildEventTitle(s))}`);
    if (s.departurePort) lines.push(`LOCATION:${icsEscape(s.departurePort)}`);
    lines.push(`DESCRIPTION:${icsEscape(buildEventDescription(s))}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Blob([lines.join("\r\n")], { type: "text/calendar" });
}

function buildEventTitle(s) {
  return `🚢 ${s.ship || "Cruise"} — ${s.region || "Sailing"}`;
}

function buildEventDescription(s) {
  const lines = [];
  if (s.itineraryName) lines.push(s.itineraryName);
  if (s.nights) lines.push(`${s.nights} nights`);
  if (s.departurePort) lines.push(`Departs from ${s.departurePort}`);

  const profileLines = (s.matchProfileIds || []).map((pid) => {
    const p = profileById(pid);
    const pdata = s.profiles?.[pid] || {};
    const bits = [p?.name || pid];
    if (pdata.offerId) bits.push(`offer ${pdata.offerId}`);
    if (pdata.stateroomCategory) bits.push(pdata.stateroomCategory);
    return bits.join(" · ");
  });
  if (profileLines.length) lines.push("", "Travelers:", ...profileLines);

  const itinUrl = buildItineraryUrl(s);
  if (itinUrl) lines.push("", `RC itinerary: ${itinUrl}`);

  if (s.booking?.notes) lines.push("", "Notes:", s.booking.notes);

  return lines.join("\n");
}

function icsEscape(v) {
  return String(v || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function isoAddDays(iso, n) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ── Offers view ────────────────────────────────────────────────────────────
function renderOffers() {
  const el = document.getElementById("offers-view");
  const offerMap = new Map();
  allSailings.forEach(s => {
    (s.matchProfileIds || []).forEach(pid => {
      const pdata = s.profiles?.[pid] || {};
      const offerId = pdata.offerId;
      if (!offerId) return;
      const key = `${pid}:${offerId}`;
      if (!offerMap.has(key)) {
        offerMap.set(key, {
          pid, offerId,
          title: pdata.offer?.title || offerId,
          bookByDate: pdata.offer?.bookByDate || null,
          sailings: [],
        });
      }
      offerMap.get(key).sailings.push(s);
    });
  });
  const offers = [...offerMap.values()].sort((a, b) => {
    if (!a.bookByDate && !b.bookByDate) return 0;
    if (!a.bookByDate) return 1;
    if (!b.bookByDate) return -1;
    return a.bookByDate.localeCompare(b.bookByDate);
  });
  if (!offers.length) {
    el.innerHTML = `<div class="empty-state"><h3>No offers</h3><p>Sync from the Club Royale offers page to load offers.</p></div>`;
    return;
  }
  el.innerHTML = "";
  offers.forEach(offer => el.appendChild(buildOfferCard(offer)));
}

function buildOfferCard(offer) {
  const card = document.createElement("div");
  card.className = "offer-card";
  const p = profileById(offer.pid);
  const bbDays = offer.bookByDate ? daysUntil(offer.bookByDate) : null;
  const bbStr = offer.bookByDate
    ? `book by ${fmtShortDate(offer.bookByDate)}${bbDays !== null ? " · " + (bbDays > 0 ? bbDays + "d" : "expired") : ""}`
    : "";
  const urgent = bbDays !== null && bbDays <= 14;

  card.innerHTML = `
    <div class="offer-card-header">
      <div class="offer-card-left">
        <span class="profile-dot" style="background:${profileColor(offer.pid)}"></span>
        <span class="offer-profile-name" style="color:${profileColor(offer.pid)}">${esc(p?.name || offer.pid)}</span>
        <span class="offer-title">${esc(offer.title)}</span>
      </div>
      ${bbStr ? `<span class="offer-bookby${urgent ? " urgent" : ""}">${bbStr}</span>` : ""}
    </div>
    <div class="offer-sub">${offer.sailings.length} sailing${offer.sailings.length !== 1 ? "s" : ""}</div>
    <div class="offer-sailings" hidden></div>
    <button class="card-expand-btn" aria-expanded="false">&#8250; sailings</button>
  `;

  const sailingsEl = card.querySelector(".offer-sailings");
  const btn = card.querySelector(".card-expand-btn");
  btn.addEventListener("click", () => {
    const isOpen = !sailingsEl.hidden;
    sailingsEl.hidden = isOpen;
    btn.setAttribute("aria-expanded", String(!isOpen));
    btn.textContent = isOpen ? "› sailings" : "‹ sailings";
    if (!isOpen && !sailingsEl.children.length) {
      offer.sailings.forEach(s => sailingsEl.appendChild(buildCard(s)));
    }
  });
  return card;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtShortDate(iso) {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return new Date(+y, +m - 1, +d).toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

// Construct a Royal Caribbean itinerary deep-link URL.
// Pattern: /itinerary/{nights}-night-{region}-{itinerary}-from-{port}-on-{ship}-{itineraryCode}?sailDate=...
// We don't have packageCode/groupId from the casino API but the URL still
// resolves on RC's site with just sailDate + slug + country.
function buildItineraryUrl(s) {
  if (!s?.itineraryCode || !s?.sailDate) return null;
  const slugify = (v) => String(v || "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // RC ship URLs use the friendly first word ("Wonder of the Seas" → "wonder")
  const shipShort = (s.ship || "").split(" ")[0];
  const parts = [
    `${s.nights}-night`,
    slugify(s.region),
    slugify(s.itineraryName),
    "from", slugify(s.departurePort),
    "on", slugify(shipShort),
    s.itineraryCode,
  ].filter(Boolean);
  const slug = parts.join("-").replace(/-+/g, "-");
  return `https://www.royalcaribbean.com/itinerary/${slug}?sailDate=${encodeURIComponent(s.sailDate)}&country=USA`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso) {
  if (!iso) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const then = new Date(iso + "T00:00:00");
  return Math.round((then - now) / 86400000);
}

function setStatus(msg) {
  document.getElementById("sync-status").textContent = msg;
}

function restoreStateFromHash() {
  try {
    const h = location.hash.slice(1);
    if (!h) return;
    const p = new URLSearchParams(h);
    if (p.get("sort")) { sortKey = p.get("sort"); document.getElementById("sort-select").value = sortKey; }
    if (p.get("view")) { view = p.get("view"); }
  } catch (_) {}
}

init();
