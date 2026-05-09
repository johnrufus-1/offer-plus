// dashboard.js — Offer+ full-tab dashboard

// ── State ──────────────────────────────────────────────────────────────────
let allSailings = [];           // aggregated by rcSailingId (post disabled-offer filter)
let profiles = [];              // [{ profileId, name, ... }]
let allOffers = [];             // raw offers, enriched with sailingCount + disabled
let counts = { profiles: 0, uniqueSailings: 0, totalOfferSailings: 0, matches: 0 };
let favSet = new Set();
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
    updateFavToggleLabel();
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
        ships: "ship-chips", regions: "region-chips", rooms: "room-chips",
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
  document.getElementById("sync-now-btn").addEventListener("click", syncNow);
  document.getElementById("fav-toggle").addEventListener("click", () => {
    filters.favOnly = !filters.favOnly;
    document.getElementById("fav-toggle").classList.toggle("active", filters.favOnly);
    render();
  });
  document.getElementById("match-toggle").addEventListener("click", () => {
    filters.matchOnly = !filters.matchOnly;
    document.getElementById("match-toggle").classList.toggle("active", filters.matchOnly);
    render();
  });
  document.getElementById("profiles-btn").addEventListener("click", openProfilesModal);
  document.getElementById("profiles-modal-close").addEventListener("click", closeProfilesModal);
  document.querySelector("#profiles-modal .modal-backdrop").addEventListener("click", closeProfilesModal);
  document.getElementById("import-file").addEventListener("change", handleImportFile);
  document.querySelectorAll("#view-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = btn.dataset.view;
      document.querySelectorAll("#view-toggle button").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("list-view").style.display = view === "list" ? "" : "none";
      document.getElementById("calendar-view").style.display = view === "calendar" ? "" : "none";
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
    favOnly: false, matchOnly: false,
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
  document.getElementById("match-toggle").classList.remove("active");
  render();
}

async function syncNow() {
  const btn = document.getElementById("sync-now-btn");
  btn.disabled = true;
  setStatus("Triggering sync…");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "TRIGGER_SYNC" });
    if (resp?.ok) {
      setStatus("Sync triggered — watch the RC page for progress");
      setTimeout(loadData, 8000);
    } else {
      setStatus("Sync failed: " + (resp?.error || "unknown error"));
    }
  } catch (e) {
    setStatus("Error: " + e.message);
  }
  btn.disabled = false;
}

// ── Facets ─────────────────────────────────────────────────────────────────
function populateFacets() {
  // Ship/Region/Departure are canonical (top-level on the aggregated row)
  const ships = [...new Set(allSailings.map((s) => s.ship).filter(Boolean))].sort();
  const regions = [...new Set(allSailings.map((s) => s.region).filter(Boolean))].sort();
  const departurePorts = [...new Set(allSailings.map((s) => s.departurePort).filter(Boolean))].sort();

  // Room types come from any profile's offering for a sailing
  const roomSet = new Set();
  for (const s of allSailings) {
    for (const pid of Object.keys(s.profiles || {})) {
      const r = s.profiles[pid].stateroomCategory;
      if (r) roomSet.add(r);
    }
  }
  const rooms = [...roomSet].sort();

  renderChips("ship-chips", ships, "ships");
  renderChips("region-chips", regions, "regions");
  renderChips("departure-chips", departurePorts, "departurePorts");
  renderChips("room-chips", rooms, "rooms");
  renderProfileChips();

  const maxNights = Math.max(...allSailings.map((s) => s.nights || 0), 0);
  document.getElementById("nights-range").max = maxNights;
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
    chip.style.setProperty("--profile-color", profileColor(p.profileId));
    chip.innerHTML = `<span class="profile-dot"></span>${esc(p.name)}`;
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
    if (filters.matchOnly && (s.matchProfileIds || []).length < 2) return false;

    // Profile filter — sailing passes if any selected profile has it
    if (filters.profileIds.size) {
      const hasOne = s.matchProfileIds.some((pid) => filters.profileIds.has(pid));
      if (!hasOne) return false;
    }

    if (filters.ships.size && !filters.ships.has(s.ship)) return false;
    if (filters.regions.size && !filters.regions.has(s.region)) return false;
    if (filters.departurePorts.size && !filters.departurePorts.has(s.departurePort)) return false;

    // Room filter checks any profile's stateroom for this sailing
    if (filters.rooms.size) {
      const profileRooms = Object.values(s.profiles || {}).map((p) => p.stateroomCategory).filter(Boolean);
      const match = profileRooms.some((r) => filters.rooms.has(r));
      if (!match) return false;
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
  document.getElementById("result-count").textContent = summary;
  if (view === "list") renderList(sorted);
  else renderCalendar(sorted);
  focusSailingFromHash();
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
  const reminderLabel = s.reminder ? formatReminderShort(s.reminder.fireAt) : "Remind me";
  const reminderActive = !!s.reminder;
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

  // Unique stateroom categories across the profiles that have this sailing
  const rooms = [...new Set(
    (s.matchProfileIds || []).map((pid) => s.profiles?.[pid]?.stateroomCategory).filter(Boolean)
  )];
  const roomBadges = rooms.map((r) => `<span class="badge badge-room">${esc(r)}</span>`).join("");

  // Unique offer codes across the profiles
  const offerCodes = [...new Set(
    (s.matchProfileIds || []).map((pid) => s.profiles?.[pid]?.offerId).filter(Boolean)
  )];
  const offerCodeTags = offerCodes.map((c) => `<span class="card-offer-code">${esc(c)}</span>`).join("");

  // Card row 1: ship · offer codes · profile dots · badges · view-on-rc · reminder · star
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
        <button class="card-remind${reminderActive ? " active" : ""}" title="${reminderActive ? "Cancel reminder" : "Set a reminder"}">🔔 ${esc(reminderLabel)}</button>
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

  card.innerHTML = row1 + row2 + row3 + profileRows;
  card.dataset.sailingId = s.rcSailingId;

  attachReminderControls(card, s);
  attachFavControl(card, s);
  return card;
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

function setModalStatus(msg, kind) {
  const el = document.getElementById("modal-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "modal-status" + (kind ? " " + kind : "");
}

// ── Reminders ──────────────────────────────────────────────────────────────
function attachReminderControls(card, s) {
  const btn = card.querySelector(".card-remind");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeOpenPopovers();
    if (s.reminder) {
      cancelReminder(card, s);
    } else {
      openReminderPopover(btn, card, s);
    }
  });
}

function closeOpenPopovers() {
  document.querySelectorAll(".remind-popover").forEach((p) => p.remove());
}

function openReminderPopover(anchor, card, s) {
  const pop = document.createElement("div");
  pop.className = "remind-popover";

  const bookByDate = earliestBookBy(s);
  const bookBy = bookByDate ? new Date(bookByDate + "T09:00:00") : null;
  const now = new Date();

  const presets = [
    { label: "7 days before book-by", days: 7 },
    { label: "3 days before book-by", days: 3 },
    { label: "1 day before book-by", days: 1 },
  ];

  for (const p of presets) {
    const opt = document.createElement("button");
    opt.className = "remind-option";
    opt.textContent = p.label;
    let fireAt = null;
    let disabled = false;
    if (!bookBy) {
      disabled = true;
      opt.title = "No book-by date for this sailing";
    } else {
      const t = new Date(bookBy);
      t.setDate(t.getDate() - p.days);
      t.setHours(9, 0, 0, 0);
      if (t.getTime() <= now.getTime()) {
        disabled = true;
        opt.title = "Already passed";
      }
      fireAt = t.toISOString();
    }
    if (disabled) opt.classList.add("disabled");
    else opt.addEventListener("click", () => saveReminder(card, s, fireAt, `${p.days}d`));
    pop.appendChild(opt);
  }

  const customRow = document.createElement("div");
  customRow.className = "remind-custom-row";
  customRow.innerHTML = `
    <label>Custom date:</label>
    <input type="date" class="remind-custom-date" />
    <button class="remind-custom-save">Set</button>
  `;
  pop.appendChild(customRow);

  const dateInput = customRow.querySelector(".remind-custom-date");
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 1);
  dateInput.min = minDate.toISOString().slice(0, 10);

  const errEl = document.createElement("div");
  errEl.className = "remind-error";
  pop.appendChild(errEl);

  customRow.querySelector(".remind-custom-save").addEventListener("click", () => {
    const v = dateInput.value;
    if (!v) { errEl.textContent = "Pick a date"; return; }
    const fire = new Date(v + "T09:00:00");
    if (fire.getTime() <= Date.now()) { errEl.textContent = "Date must be in the future"; return; }
    saveReminder(card, s, fire.toISOString(), "custom");
  });

  document.body.appendChild(pop);
  positionPopover(pop, anchor);

  setTimeout(() => {
    document.addEventListener("click", function onDocClick(ev) {
      if (!pop.contains(ev.target)) {
        pop.remove();
        document.removeEventListener("click", onDocClick);
      }
    });
  }, 0);
}

function positionPopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  pop.style.position = "fixed";
  pop.style.top = `${r.bottom + 6}px`;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, r.left))}px`;
  pop.style.zIndex = "1000";
}

async function saveReminder(card, s, fireAtIso, offset) {
  closeOpenPopovers();
  const snapshot = {
    ship: s.ship,
    sailDate: s.sailDate,
    nights: s.nights,
    itineraryName: s.itineraryName,
    bookByDate: earliestBookBy(s),
  };
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "REMINDER_SET",
      rcSailingId: s.rcSailingId,
      fireAt: fireAtIso,
      offset,
      snapshot,
    });
    if (!resp?.ok) throw new Error(resp?.error || "Failed");
    s.reminder = { rcSailingId: s.rcSailingId, fireAt: fireAtIso, offset, snapshot };
    refreshReminderButton(card, s);
  } catch (e) {
    setStatus("Reminder failed: " + e.message);
  }
}

async function cancelReminder(card, s) {
  if (!s.reminder) return;
  const wasReminder = s.reminder;
  s.reminder = null;
  refreshReminderButton(card, s);
  try {
    const resp = await chrome.runtime.sendMessage({ type: "REMINDER_CLEAR", rcSailingId: s.rcSailingId });
    if (!resp?.ok) throw new Error(resp?.error || "Failed");
  } catch (e) {
    s.reminder = wasReminder;
    refreshReminderButton(card, s);
    setStatus("Cancel failed: " + e.message);
  }
}

function refreshReminderButton(card, s) {
  const btn = card.querySelector(".card-remind");
  if (!btn) return;
  const active = !!s.reminder;
  btn.classList.toggle("active", active);
  btn.title = active ? "Cancel reminder" : "Set a reminder";
  btn.textContent = `🔔 ${active ? formatReminderShort(s.reminder.fireAt) : "Remind me"}`;
}

function formatReminderShort(fireAtIso) {
  const fire = new Date(fireAtIso);
  const diffMs = fire.getTime() - Date.now();
  if (diffMs <= 0) return "due";
  const days = Math.round(diffMs / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "in 1d";
  if (days < 30) return `in ${days}d`;
  return fire.toLocaleDateString("default", { month: "short", day: "numeric" });
}

// ── Hash deep-link ─────────────────────────────────────────────────────────
function focusSailingFromHash() {
  const m = location.hash.match(/sailing=([^&]+)/);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  setTimeout(() => {
    const card = document.querySelector(`.sailing-card[data-sailing-id="${CSS.escape(id)}"]`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("pulse");
      setTimeout(() => card.classList.remove("pulse"), 2000);
    }
  }, 100);
}

// ── Calendar view ──────────────────────────────────────────────────────────
function renderCalendar(sailings) {
  const el = document.getElementById("calendar-view");
  if (!sailings.length) {
    el.innerHTML = `<div class="empty-state"><h3>No sailings match</h3><p>Adjust your filters to see sailings on the calendar.</p></div>`;
    return;
  }

  const byMonth = new Map();
  for (const s of sailings) {
    if (!s.sailDate) continue;
    const ym = s.sailDate.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(s);
  }

  el.innerHTML = "";
  const months = document.createElement("div");
  months.className = "cal-months";

  const panel = document.createElement("div");
  panel.className = "cal-side-panel";
  panel.innerHTML = `<div class="cal-side-empty">Click a highlighted day to see sailings</div>`;

  const sorted = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [ym, ms] of sorted) months.appendChild(buildMonth(ym, ms, panel));

  el.appendChild(months);
  el.appendChild(panel);
}

function buildMonth(ym, sailings, panel) {
  const [year, month] = ym.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();

  const byDay = new Map();
  for (const s of sailings) {
    const day = +s.sailDate.slice(8, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(s);
  }

  const maxCount = Math.max(...[...byDay.values()].map((a) => a.length), 1);

  const wrap = document.createElement("div");
  wrap.className = "cal-month";
  const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  wrap.innerHTML = `
    <div class="cal-month-header">
      <span class="cal-month-name">${monthName}</span>
      <span class="cal-month-count">${sailings.length} sailing${sailings.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="cal-grid">
      ${["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
    </div>`;

  const grid = wrap.querySelector(".cal-grid");

  for (let i = 0; i < firstDow; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.style.border = "none";
    grid.appendChild(cell);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement("div");
    cell.className = "cal-day";
    const daySailings = byDay.get(d);
    if (daySailings?.length) {
      cell.classList.add("has-sailings");
      const intensity = Math.round((daySailings.length / maxCount) * 100);
      cell.style.background = `rgba(59,130,246,${0.15 + intensity * 0.006})`;
      cell.style.borderColor = `rgba(59,130,246,${0.3 + intensity * 0.005})`;
      cell.innerHTML = `<span class="cal-day-num">${d}</span><span class="cal-day-count" style="color:#93c5fd">${daySailings.length}</span>`;

      cell.addEventListener("click", () => {
        document.querySelectorAll(".cal-day-active").forEach((c) => c.classList.remove("cal-day-active"));
        cell.classList.add("cal-day-active");

        const dateStr = fmtShortDate(`${ym}-${String(d).padStart(2, "0")}`);
        panel.innerHTML = `<div class="cal-detail-header">${dateStr} — ${daySailings.length} sailing${daySailings.length !== 1 ? "s" : ""}</div>`;
        for (const s of daySailings) panel.appendChild(buildCard(s));
      });
    } else {
      cell.innerHTML = `<span class="cal-day-num" style="color:#4b5563">${d}</span>`;
    }
    grid.appendChild(cell);
  }

  return wrap;
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
