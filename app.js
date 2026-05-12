import { loadData } from './db.js';

(async function () {
  const stored = await loadData();

  if (!stored) {
    showNoData();
    wireSync();
    return;
  }

  const allSailings = stored.sailings  || [];
  const profiles    = stored.profiles  || [];
  const counts      = stored.counts    || {};
  const bookings    = stored.bookings  || [];

  const favSet    = new Set(allSailings.filter(s => s.isFavorite).map(s => s.rcSailingId));
  const bookedSet = new Set(allSailings.filter(s => s.booking).map(s => s.rcSailingId));
  bookings.forEach(b => bookedSet.add(b.rcSailingId));

  let filters = {
    search: '', profileIds: new Set(), ships: new Set(), regions: new Set(),
    departurePorts: new Set(), rooms: new Set(),
    minNights: 0, sailFrom: '', sailTo: '',
    favOnly: false, bookedOnly: false, matchOnly: false,
  };
  let sortKey = 'sailDate';
  let view    = 'list';

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function profileById(id) {
    return profiles.find(p => p.profileId === id) || null;
  }
  function profileColor(profileId) {
    let h = 0;
    for (let i = 0; i < profileId.length; i++) h = (h * 31 + profileId.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 70% 60%)`;
  }
  function fmtShortDate(iso) {
    if (!iso) return '';
    try {
      const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return iso; }
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addDaysISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function daysUntil(iso) {
    if (!iso) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((new Date(iso + 'T00:00:00') - now) / 86400000);
  }
  function earliestBookBy(s) {
    const dates = Object.values(s.profiles || {})
      .map(p => p.offer && p.offer.bookByDate).filter(Boolean);
    return dates.length ? dates.reduce((a, b) => a < b ? a : b) : null;
  }
  function buildItineraryUrl(s) {
    if (!s || !s.itineraryCode || !s.sailDate) return null;
    const slugify = v => String(v || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const parts = [
      s.nights + '-night', slugify(s.region), slugify(s.itineraryName),
      'from', slugify(s.departurePort), 'on', slugify((s.ship || '').split(' ')[0]), s.itineraryCode,
    ].filter(Boolean);
    return 'https://www.royalcaribbean.com/itinerary/' + parts.join('-').replace(/-+/g, '-') +
      '?sailDate=' + encodeURIComponent(s.sailDate) + '&country=USA';
  }

  // ── Drawer ───────────────────────────────────────────────────────────────
  const drawer  = document.getElementById('filterDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const openDrawer  = () => { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
  const closeDrawer = () => { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow = ''; };
  document.getElementById('filterToggle').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // ── Facets ───────────────────────────────────────────────────────────────
  function renderChips(containerId, values, filterKey) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    values.forEach(v => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = v;
      chip.addEventListener('click', () => {
        if (filters[filterKey].has(v)) filters[filterKey].delete(v);
        else filters[filterKey].add(v);
        chip.classList.toggle('active', filters[filterKey].has(v));
        render();
      });
      el.appendChild(chip);
    });
  }
  function renderProfileRooms() {
    const container = document.getElementById('rooms-section');
    if (!container) return;
    container.innerHTML = '';
    const roomsByProfile = new Map();
    allSailings.forEach(s => {
      Object.keys(s.profiles || {}).forEach(pid => {
        const r = s.profiles[pid].stateroomCategory;
        if (!r) return;
        if (!roomsByProfile.has(pid)) roomsByProfile.set(pid, new Set());
        roomsByProfile.get(pid).add(r);
      });
    });
    profiles.forEach(profile => {
      const set = roomsByProfile.get(profile.profileId);
      if (!set || !set.size) return;
      const group = document.createElement('div');
      group.className = 'rooms-profile-group';
      const dot = `<span class="profile-dot" style="background:${profileColor(profile.profileId)}"></span>`;
      group.innerHTML = `<div class="rooms-profile-label">${dot}${esc(profile.name)}${profiles.length > 1 ? "'s rooms" : ' Rooms'}</div>`;
      const chipsEl = document.createElement('div');
      chipsEl.className = 'chip-group';
      Array.from(set).sort().forEach(r => {
        const key = profile.profileId + '|' + r;
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = r;
        if (filters.rooms.has(key)) chip.classList.add('active');
        chip.addEventListener('click', () => {
          if (filters.rooms.has(key)) filters.rooms.delete(key);
          else filters.rooms.add(key);
          chip.classList.toggle('active', filters.rooms.has(key));
          render();
        });
        chipsEl.appendChild(chip);
      });
      group.appendChild(chipsEl);
      container.appendChild(group);
    });
  }
  function renderProfileChips() {
    const section = document.getElementById('profiles-section');
    const el = document.getElementById('profile-chips');
    el.innerHTML = '';
    if (profiles.length < 2) { section.style.display = 'none'; return; }
    section.style.display = '';
    profiles.forEach(p => {
      const chip = document.createElement('button');
      chip.className = 'chip profile-chip';
      chip.innerHTML = `<span class="profile-dot" style="background:${profileColor(p.profileId)}"></span>${esc(p.name)}`;
      chip.addEventListener('click', () => {
        if (filters.profileIds.has(p.profileId)) filters.profileIds.delete(p.profileId);
        else filters.profileIds.add(p.profileId);
        chip.classList.toggle('active', filters.profileIds.has(p.profileId));
        render();
      });
      el.appendChild(chip);
    });
  }
  function populateFacets() {
    const ships   = [...new Set(allSailings.map(s => s.ship).filter(Boolean))].sort();
    const regions = [...new Set(allSailings.map(s => s.region).filter(Boolean))].sort();
    const ports   = [...new Set(allSailings.map(s => s.departurePort).filter(Boolean))].sort();
    renderChips('ship-chips', ships, 'ships');
    renderChips('region-chips', regions, 'regions');
    renderChips('departure-chips', ports, 'departurePorts');
    renderProfileRooms();
    renderProfileChips();
    const maxNights = Math.max(...allSailings.map(s => s.nights || 0), 0);
    document.getElementById('nights-range').max = maxNights;
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  function bindControls() {
    document.getElementById('search').addEventListener('input', e => { filters.search = e.target.value; render(); });
    document.getElementById('sortSelect').addEventListener('change', e => { sortKey = e.target.value; render(); });
    document.getElementById('nights-range').addEventListener('input', e => {
      filters.minNights = +e.target.value;
      document.getElementById('nights-val').textContent = filters.minNights === 0 ? 'Any' : '>=' + filters.minNights + 'n';
      render();
    });
    document.getElementById('sail-from').addEventListener('input', e => { filters.sailFrom = e.target.value; render(); });
    document.getElementById('sail-to').addEventListener('input', e => { filters.sailTo = e.target.value; render(); });
    document.getElementById('sail-preset-chips').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#sail-preset-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const days = chip.dataset.days;
      const customInputs = document.getElementById('sail-custom-inputs');
      if (days === 'custom') {
        customInputs.style.display = '';
      } else if (days === '0') {
        filters.sailFrom = ''; filters.sailTo = '';
        document.getElementById('sail-from').value = '';
        document.getElementById('sail-to').value = '';
        customInputs.style.display = 'none';
        render();
      } else {
        filters.sailFrom = todayISO();
        filters.sailTo   = addDaysISO(+days);
        document.getElementById('sail-from').value = filters.sailFrom;
        document.getElementById('sail-to').value   = filters.sailTo;
        customInputs.style.display = 'none';
        render();
      }
    });
    document.querySelectorAll('.filter-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.target;
        const keyMap = { ships: 'ships', regions: 'regions', rooms: 'rooms', profileIds: 'profileIds', departurePorts: 'departurePorts' };
        const idMap  = { ships: 'ship-chips', regions: 'region-chips', rooms: 'rooms-section', profileIds: 'profile-chips', departurePorts: 'departure-chips' };
        if (!keyMap[t]) return;
        filters[keyMap[t]] = new Set();
        const c = document.getElementById(idMap[t]);
        if (c) c.querySelectorAll('.chip.active').forEach(ch => ch.classList.remove('active'));
        render();
      });
    });
    document.getElementById('reset-btn').addEventListener('click', resetFilters);

    const favBtn    = document.getElementById('favBtn');
    const bookedBtn = document.getElementById('bookedBtn');
    const matchBtn  = document.getElementById('matchBtn');

    favBtn.addEventListener('click', () => { filters.favOnly = !filters.favOnly; favBtn.classList.toggle('active', filters.favOnly); render(); });
    bookedBtn.addEventListener('click', () => { filters.bookedOnly = !filters.bookedOnly; bookedBtn.classList.toggle('active', filters.bookedOnly); render(); });
    matchBtn.addEventListener('click', () => { filters.matchOnly = !filters.matchOnly; matchBtn.classList.toggle('active', filters.matchOnly); render(); });
    if (profiles.length < 2) matchBtn.disabled = true;

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        view = btn.dataset.view;
        document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.getElementById('list-view').style.display   = view === 'list'   ? '' : 'none';
        document.getElementById('offers-view').style.display = view === 'offers' ? '' : 'none';
        document.getElementById('b2b-view').style.display    = view === 'b2b'    ? '' : 'none';
        // hide sail-date filter preset when in B2B (B2B owns the date range)
        const sailPreset = document.getElementById('sail-preset-chips')?.closest('.filter-section');
        if (sailPreset) sailPreset.style.display = view === 'b2b' ? 'none' : '';
        render();
      });
    });
  }
  function resetFilters() {
    filters = { search: '', profileIds: new Set(), ships: new Set(), regions: new Set(), departurePorts: new Set(), rooms: new Set(), minNights: 0, sailFrom: '', sailTo: '', favOnly: false, bookedOnly: false, matchOnly: false };
    document.getElementById('search').value = '';
    document.getElementById('nights-range').value = 0;
    document.getElementById('nights-val').textContent = 'Any';
    document.getElementById('sail-from').value = '';
    document.getElementById('sail-to').value = '';
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    const anyChip = document.querySelector('#sail-preset-chips .chip[data-days="0"]');
    if (anyChip) anyChip.classList.add('active');
    document.getElementById('sail-custom-inputs').style.display = 'none';
    document.getElementById('favBtn').classList.remove('active');
    document.getElementById('bookedBtn').classList.remove('active');
    document.getElementById('matchBtn').classList.remove('active');
    render();
  }

  // ── Filtering + Sorting ──────────────────────────────────────────────────
  function applyFilters() {
    const q = filters.search.toLowerCase();
    return allSailings.filter(s => {
      if (filters.favOnly    && !favSet.has(s.rcSailingId))         return false;
      if (filters.bookedOnly && !bookedSet.has(s.rcSailingId))      return false;
      if (filters.matchOnly  && (s.matchProfileIds || []).length < 2) return false;
      if (filters.profileIds.size) {
        const sp = new Set(s.matchProfileIds || []);
        if (![...filters.profileIds].every(pid => sp.has(pid))) return false;
      }
      if (filters.ships.size          && !filters.ships.has(s.ship))            return false;
      if (filters.regions.size        && !filters.regions.has(s.region))        return false;
      if (filters.departurePorts.size && !filters.departurePorts.has(s.departurePort)) return false;
      if (filters.rooms.size) {
        const allowedByProfile = new Map();
        filters.rooms.forEach(entry => {
          const sep = entry.indexOf('|');
          if (sep < 0) return;
          const pid = entry.slice(0, sep), room = entry.slice(sep + 1);
          if (!allowedByProfile.has(pid)) allowedByProfile.set(pid, new Set());
          allowedByProfile.get(pid).add(room);
        });
        for (const [pid, allowed] of allowedByProfile) {
          const profileRoom = s.profiles && s.profiles[pid] && s.profiles[pid].stateroomCategory;
          if (!profileRoom || !allowed.has(profileRoom)) return false;
        }
      }
      if (filters.minNights > 0 && (s.nights || 0) < filters.minNights) return false;
      if (filters.sailFrom && s.sailDate < filters.sailFrom)              return false;
      if (filters.sailTo   && s.sailDate > filters.sailTo)                return false;
      if (q) {
        const profileTexts = Object.values(s.profiles || {}).reduce((acc, p) => {
          if (p.offer?.title)       acc.push(p.offer.title);
          if (p.offer?.description) acc.push(p.offer.description);
          if (p.stateroomCategory)  acc.push(p.stateroomCategory);
          return acc;
        }, []);
        const hay = [s.ship, s.itineraryName, s.region, s.departurePort]
          .concat(s.portsOfCall || []).concat(profileTexts).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function applySorting(sailings) {
    return [...sailings].sort((a, b) => {
      switch (sortKey) {
        case 'sailDate':      return (a.sailDate || '').localeCompare(b.sailDate || '');
        case 'sailDate-desc': return (b.sailDate || '').localeCompare(a.sailDate || '');
        case 'bookBy':        return (earliestBookBy(a) || '9999').localeCompare(earliestBookBy(b) || '9999');
        case 'nights-desc':   return (b.nights || 0) - (a.nights || 0);
        case 'nights':        return (a.nights || 0) - (b.nights || 0);
        default: return 0;
      }
    });
  }

  // ── Card ─────────────────────────────────────────────────────────────────
  function buildCard(s) {
    const card = document.createElement('div');
    card.className = 'sailing-card';

    const isFav    = favSet.has(s.rcSailingId);
    const isBooked = bookedSet.has(s.rcSailingId);
    if (isFav)    card.classList.add('is-fav');
    if (isBooked) card.classList.add('is-booked');

    // -- Urgency (≤7 days) --
    const bookByDate = earliestBookBy(s);
    const daysLeft   = bookByDate ? daysUntil(bookByDate) : null;
    const urgencyBadge = (daysLeft !== null && daysLeft <= 7)
      ? `<span class="badge badge-warn">${daysLeft <= 0 ? 'Expired' : daysLeft + 'd left'}</span>` : '';
    const favIcon    = isFav    ? `<span class="card-fav-icon">&#9733;</span>` : '';
    const bookedIcon = isBooked ? `<span class="card-booked-icon">&#10003;</span>` : '';
    const nightsBadge = s.nights ? `<span class="card-nights">${s.nights}n</span>` : '';

    // -- Sub line --
    const subParts = [
      fmtShortDate(s.sailDate),
      s.departurePort ? `from ${esc(s.departurePort)}` : null,
      s.region || null,
    ].filter(Boolean).join(' &middot; ');

    // -- Collapsed profile rows: name + offer title | book-by --
    const profileRows = (s.matchProfileIds || []).map(pid => {
      const pdata  = s.profiles?.[pid] || {};
      const p      = profileById(pid);
      const room   = pdata.stateroomCategory ? `<span class="profile-row-desc">${esc(pdata.stateroomCategory)}</span>` : '';
      const bookBy = pdata.offer?.bookByDate;
      const bbDays = bookBy ? daysUntil(bookBy) : null;
      const bbStr  = bookBy
        ? `<span class="profile-row-bookby${bbDays !== null && bbDays <= 14 ? ' urgent' : ''}">book by ${fmtShortDate(bookBy)}</span>`
        : '';
      return `<div class="profile-row">
        <div class="profile-row-left">
          <span class="profile-dot" style="background:${profileColor(pid)}"></span>
          <span class="profile-row-name" style="color:${profileColor(pid)}">${esc(p?.name || pid)}</span>
          ${room}
        </div>
        <div class="profile-row-right">
          ${bbStr}
        </div>
      </div>`;
    }).join('');

    // -- Extras: ports, badges, offer descriptions + book-by --
    const portChips = (s.portsOfCall || []).map(p => `<span class="port-chip">${esc(p)}</span>`).join('');
    const isMatch   = (s.matchProfileIds || []).length > 1;
    const matchBadge  = isMatch  ? `<span class="badge badge-match">&#128279; Match &middot; ${s.matchProfileIds.length}</span>` : '';
    const bookedBadge = isBooked ? `<span class="badge badge-ok">&#10003; Booked</span>` : '';
    const itinUrl   = buildItineraryUrl(s);
    const itinLink  = itinUrl ? `<a class="card-itin-link" href="${esc(itinUrl)}" target="_blank" rel="noopener">View on RC &#8599;</a>` : '';
    const offerCodes = [...new Set((s.matchProfileIds || []).map(pid => s.profiles?.[pid]?.offerId).filter(Boolean))];
    const offerCodeTags = offerCodes.map(c => `<span class="card-offer-code">${esc(c)}</span>`).join('');
    const offerDescs = (s.matchProfileIds || []).map(pid => {
      const pdata  = s.profiles?.[pid] || {};
      const p      = profileById(pid);
      const desc   = pdata.offer?.description;
      const bookBy = pdata.offer?.bookByDate;
      const bbDays = bookBy ? daysUntil(bookBy) : null;
      const bbStr  = bookBy
        ? `book by ${fmtShortDate(bookBy)}${bbDays !== null ? ' &middot; ' + (bbDays > 0 ? bbDays + 'd' : 'expired') : ''}`
        : '';
      if (!desc && !bbStr) return '';
      return `<div class="card-offer-desc">
        <span class="profile-dot" style="background:${profileColor(pid)}"></span>
        <span class="card-offer-desc-name" style="color:${profileColor(pid)}">${esc(p?.name || pid)}</span>
        ${desc ? `<span>${esc(desc)}</span>` : ''}
        ${bbStr ? `<span class="card-offer-bookby${bbDays !== null && bbDays <= 14 ? ' urgent' : ''}">${bbStr}</span>` : ''}
      </div>`;
    }).filter(Boolean).join('');

    const hasExtras = portChips || matchBadge || bookedBadge || itinLink || offerCodeTags || offerDescs;
    const extrasBadges = (matchBadge || bookedBadge || itinLink)
      ? `<div class="card-extras-badges">${matchBadge}${bookedBadge}${itinLink}</div>` : '';
    const extrasHTML = hasExtras ? `
      <div class="card-extras" hidden>
        ${portChips    ? `<div class="card-extras-ports">${portChips}</div>` : ''}
        ${offerCodeTags ? `<div class="card-extras-badges">${offerCodeTags}</div>` : ''}
        ${extrasBadges}
        ${offerDescs}
      </div>
      <button class="card-expand-btn" aria-expanded="false">&#8250; more</button>
    ` : '';

    card.innerHTML = `
      <div class="card-top">
        <div class="card-top-left">
          <span class="card-ship">${esc(s.ship || 'Unknown Ship')}</span>
          ${nightsBadge}
        </div>
        <div class="card-top-right">
          ${urgencyBadge}${bookedIcon}${favIcon}
        </div>
      </div>
      <div class="card-sub">${subParts}</div>
      ${profileRows}
      ${extrasHTML}
    `;

    if (hasExtras) {
      card.querySelector('.card-expand-btn').addEventListener('click', e => {
        const extras = card.querySelector('.card-extras');
        const btn    = e.currentTarget;
        const isOpen = !extras.hidden;
        extras.hidden = isOpen;
        btn.setAttribute('aria-expanded', String(!isOpen));
        btn.textContent = isOpen ? '› more' : '‹ less';
      });
    }

    return card;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    const filtered = applyFilters();
    const sorted   = applySorting(filtered);
    const matchCount = sorted.filter(s => (s.matchProfileIds || []).length > 1).length;
    const summary = profiles.length > 1
      ? `${sorted.length} of ${counts.uniqueSailings || 0} sailings · ${matchCount} ${matchCount !== 1 ? 'matches' : 'match'}`
      : `${sorted.length} sailing${sorted.length !== 1 ? 's' : ''} of ${counts.uniqueSailings || 0}`;
    document.getElementById('result-count').textContent = view === 'b2b' || view === 'offers' ? '' : summary;
    if (view === 'list') renderList(sorted);
    else if (view === 'b2b') renderB2B();
    else if (view === 'offers') renderOffers();
  }
  function renderList(sailings) {
    const el = document.getElementById('list-view');
    if (!sailings.length) {
      el.innerHTML = '<div class="empty-state"><h3>No sailings match</h3><p>Try adjusting your filters.</p></div>';
      return;
    }
    el.innerHTML = '';
    sailings.forEach(s => el.appendChild(buildCard(s)));
  }

  // ── Offers ───────────────────────────────────────────────────────────────
  function renderOffers() {
    const el = document.getElementById('offers-view');
    const offerMap = new Map();
    allSailings.forEach(s => {
      (s.matchProfileIds || []).forEach(pid => {
        const pdata = s.profiles?.[pid] || {};
        const offerId = pdata.offerId;
        if (!offerId) return;
        const title = pdata.offer?.title || offerId;
        if (!offerMap.has(title)) {
          offerMap.set(title, {
            title,
            bookByDate: pdata.offer?.bookByDate || null,
            offerIdProfiles: new Map(),
            sailingIds: new Set(),
            sailings: [],
          });
        }
        const entry = offerMap.get(title);
        if (!entry.offerIdProfiles.has(offerId)) entry.offerIdProfiles.set(offerId, new Set());
        entry.offerIdProfiles.get(offerId).add(pid);
        if (!entry.sailingIds.has(s.rcSailingId)) {
          entry.sailingIds.add(s.rcSailingId);
          entry.sailings.push(s);
        }
      });
    });
    const offers = [...offerMap.values()].sort((a, b) => {
      if (!a.bookByDate && !b.bookByDate) return 0;
      if (!a.bookByDate) return 1;
      if (!b.bookByDate) return -1;
      return a.bookByDate.localeCompare(b.bookByDate);
    });
    if (!offers.length) {
      el.innerHTML = '<div class="empty-state"><h3>No offers</h3><p>Sync from the extension to load offers.</p></div>';
      return;
    }
    el.innerHTML = '';
    offers.forEach(offer => el.appendChild(buildOfferCard(offer)));
  }

  function buildOfferCard(offer) {
    const card = document.createElement('div');
    card.className = 'offer-card';
    const bbDays = offer.bookByDate ? daysUntil(offer.bookByDate) : null;
    const bbStr = offer.bookByDate
      ? `book by ${fmtShortDate(offer.bookByDate)}${bbDays !== null ? ' &middot; ' + (bbDays >= 0 ? bbDays + 'd' : 'expired') : ''}`
      : '';
    const urgent = bbDays !== null && bbDays >= 0 && bbDays <= 14;
    const codeBadges = [...offer.offerIdProfiles.keys()].map(id => `<span class="offer-code">${esc(id)}</span>`).join('');
    const profileChips = [...new Set([...(offer.offerIdProfiles?.values() ?? [])].flatMap(s => [...s]))].map(pid => {
      const p = profileById(pid);
      return `<span class="offer-profile-chip"><span class="profile-dot" style="background:${profileColor(pid)}"></span><span class="offer-profile-name" style="color:${profileColor(pid)}">${esc(p?.name || 'Unknown')}</span></span>`;
    }).join('');

    card.innerHTML = `
      <div class="offer-card-header">
        <div class="offer-card-left">
          <span class="offer-title">${esc(offer.title)}</span>
          ${codeBadges}
        </div>
        ${bbStr ? `<span class="offer-bookby${urgent ? ' urgent' : ''}">${bbStr}</span>` : ''}
      </div>
      <div class="offer-sub">
        <span class="offer-profiles">${profileChips}</span>
        <span class="offer-sailing-count">${offer.sailings.length} sailing${offer.sailings.length !== 1 ? 's' : ''}</span>
      </div>
      <button class="card-expand-btn" aria-expanded="false">&#8250; sailings</button>
      <div class="offer-sailings" hidden></div>
    `;

    const sailingsEl = card.querySelector('.offer-sailings');
    const btn = card.querySelector('.card-expand-btn');
    btn.addEventListener('click', () => {
      const isOpen = !sailingsEl.hidden;
      sailingsEl.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
      btn.textContent = isOpen ? '› sailings' : '‹ sailings';
      if (!isOpen && !sailingsEl.children.length) {
        offer.sailings.forEach(s => sailingsEl.appendChild(buildCard(s)));
      }
    });
    return card;
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    populateFacets();
    bindControls();
    wireSync();
    const n = counts.matches || 0;
    document.getElementById('matchBtn').textContent = n > 0 ? ('🔗 ' + n) : '🔗';
    const f = favSet.size;
    document.getElementById('favBtn').textContent = f > 0 ? ('★ ' + f) : '☆';
    render();
  }
  init();

  // ── B2B Planner ─────────────────────────────────────────────────────────────
  let b2bState = { rangeStart: '', rangeEnd: '', maxGap: 1, samePort: true, sameShip: false };

  function renderB2B() {
    const el = document.getElementById('b2b-view');
    if (!el.querySelector('.b2b-controls')) {
      el.innerHTML = `
        <div class="b2b-controls">
          <div class="b2b-controls-title">Vacation window</div>
          <div class="b2b-inputs">
            <label class="b2b-label">From<input type="date" id="b2b-from" /></label>
            <label class="b2b-label">To<input type="date" id="b2b-to" /></label>
          </div>
          <div class="b2b-gap-row">
            <span id="b2b-gap-label">Max gap · ${b2bState.maxGap}d</span>
            <input type="range" id="b2b-gap" min="0" max="7" value="${b2bState.maxGap}" />
          </div>
          <div class="b2b-toggles">
            <label class="b2b-toggle-label${b2bState.sameShip ? ' disabled' : ''}" id="b2b-same-port-label">
              <input type="checkbox" id="b2b-same-port" ${b2bState.samePort ? 'checked' : ''} ${b2bState.sameShip ? 'disabled' : ''} />
              Same departure port
            </label>
            <label class="b2b-toggle-label">
              <input type="checkbox" id="b2b-same-ship" ${b2bState.sameShip ? 'checked' : ''} />
              Same ship
            </label>
          </div>
        </div>
        <div id="b2b-count"></div>
        <div id="b2b-results"></div>`;
      el.querySelector('#b2b-from').value = b2bState.rangeStart;
      el.querySelector('#b2b-to').value   = b2bState.rangeEnd;
      el.querySelector('#b2b-from').addEventListener('input', e => { b2bState.rangeStart = e.target.value; renderB2BResults(); });
      el.querySelector('#b2b-to').addEventListener('input',   e => { b2bState.rangeEnd   = e.target.value; renderB2BResults(); });
      el.querySelector('#b2b-gap').addEventListener('input',  e => {
        b2bState.maxGap = +e.target.value;
        el.querySelector('#b2b-gap-label').textContent = `Max gap · ${b2bState.maxGap}d`;
        renderB2BResults();
      });
      el.querySelector('#b2b-same-port').addEventListener('change', e => { b2bState.samePort = e.target.checked; renderB2BResults(); });
      el.querySelector('#b2b-same-ship').addEventListener('change', e => {
        b2bState.sameShip = e.target.checked;
        const portLabel = el.querySelector('#b2b-same-port-label');
        const portCb    = el.querySelector('#b2b-same-port');
        portCb.disabled = b2bState.sameShip;
        portLabel.classList.toggle('disabled', b2bState.sameShip);
        renderB2BResults();
      });
    }
    renderB2BResults();
  }

  function renderB2BResults() {
    const res = document.getElementById('b2b-results');
    const countEl = document.getElementById('b2b-count');
    if (!res) return;
    // get fresh pool from filters, but let B2B own the date range
    const savedFrom = filters.sailFrom, savedTo = filters.sailTo, savedMin = filters.minNights;
    filters.sailFrom = ''; filters.sailTo = ''; filters.minNights = 0;
    const pool = applyFilters();
    filters.sailFrom = savedFrom; filters.sailTo = savedTo; filters.minNights = savedMin;
    const { rangeStart, rangeEnd, maxGap } = b2bState;
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
      countEl.textContent = '';
      res.innerHTML = '<div class="empty-state"><p>Set a vacation window to find back-to-back combinations.</p></div>';
      return;
    }
    const chains = findB2BChains(pool, rangeStart, rangeEnd, maxGap, b2bState.samePort, b2bState.sameShip);
    if (!chains.length) {
      countEl.textContent = '';
      res.innerHTML = '<div class="empty-state"><p>No combinations found — try widening your dates or increasing the max gap.</p></div>';
      return;
    }
    const cap = chains.length === 100;
    countEl.textContent = cap ? 'Showing top 100 combinations' : `${chains.length} combination${chains.length === 1 ? '' : 's'} found`;
    res.innerHTML = '';
    chains.forEach(chain => res.appendChild(buildChainCard(chain)));
  }

  function buildChainCard(chain) {
    const wrap = document.createElement('div');
    wrap.className = 'b2b-chain-card';
    chain.legs.forEach((leg, i) => {
      wrap.appendChild(buildCard(leg));
      if (i < chain.legs.length - 1) {
        const gap = chain.gaps[i];
        const div = document.createElement('div');
        div.className = 'b2b-gap-divider';
        div.innerHTML = `
          <div class="b2b-connector-line"></div>
          <div class="b2b-connector-arrow">&#8595; ${gap === 0 ? 'same-day turnaround' : gap + '-day gap'}</div>
          <div class="b2b-connector-line"></div>`;
        wrap.appendChild(div);
      }
    });
    const commonDots = [...(chain.commonProfiles || [])].map(pid => {
      const p = profileById(pid);
      return `<span class="profile-dot" style="background:${profileColor(pid)}" title="${esc(p?.name || pid)}"></span>`;
    }).join('');
    const bookableBy = profiles.length > 1 && commonDots
      ? `<span class="b2b-bookable">Bookable by ${commonDots}</span>` : '';
    const footer = document.createElement('div');
    footer.className = 'b2b-chain-footer';
    footer.innerHTML = `
      <span class="card-nights">${chain.totalNights}n total</span>
      ${chain.totalGapDays === 0
        ? '<span class="badge badge-ok">True B2B</span>'
        : `<span class="badge" style="border-color:var(--border);color:var(--muted)">${chain.totalGapDays} gap day${chain.totalGapDays === 1 ? '' : 's'}</span>`}
      ${bookableBy}`;
    wrap.appendChild(footer);
    return wrap;
  }

  function findB2BChains(sailings, rangeStart, rangeEnd, maxGapDays, samePort, sameShip) {
    const pool = sailings
      .map(s => ({ s, ret: s.returnDate || isoAddDays(s.sailDate, s.nights || 0) }))
      .filter(({ s, ret }) => s.sailDate >= rangeStart && ret <= rangeEnd)
      .sort((a, b) => a.s.sailDate.localeCompare(b.s.sailDate));
    if (!pool.length) return [];
    const chainsEndingAt = pool.map(({ s }) => [{
      legs: [s], gaps: [], totalGapDays: 0, totalNights: s.nights || 0,
      offerIds: sailingOfferIds(s),
      commonProfiles: new Set(s.matchProfileIds || []),
    }]);
    const result = [];
    for (let i = 1; i < pool.length; i++) {
      const { s: si } = pool[i];
      const siOfferIds = sailingOfferIds(si);
      for (let j = 0; j < i; j++) {
        const gap = daysBetweenISO(pool[j].ret, si.sailDate);
        if (gap < 0 || gap > maxGapDays) continue;
        for (const prev of chainsEndingAt[j]) {
          if (prev.legs.some(l => l.rcSailingId === si.rcSailingId)) continue;
          if ([...siOfferIds].some(id => prev.offerIds.has(id))) continue;
          const siProfiles = new Set(si.matchProfileIds || []);
          const newCommon = new Set([...prev.commonProfiles].filter(pid => siProfiles.has(pid)));
          if (newCommon.size === 0) continue;
          if (samePort && si.departurePort !== prev.legs[0].departurePort) continue;
          if (sameShip && si.ship !== prev.legs[0].ship) continue;
          chainsEndingAt[i].push({
            legs: [...prev.legs, si], gaps: [...prev.gaps, gap],
            totalGapDays: prev.totalGapDays + gap,
            totalNights: prev.totalNights + (si.nights || 0),
            offerIds: new Set([...prev.offerIds, ...siOfferIds]),
            commonProfiles: newCommon,
          });
        }
      }
      chainsEndingAt[i].forEach(c => { if (c.legs.length >= 2) result.push(c); });
    }
    result.sort((a, b) => a.totalGapDays !== b.totalGapDays ? a.totalGapDays - b.totalGapDays : a.totalNights - b.totalNights);
    return result.slice(0, 100);
  }

  function sailingOfferIds(s) {
    return new Set((s.matchProfileIds || []).map(pid => s.profiles?.[pid]?.offerId).filter(Boolean));
  }

  function daysBetweenISO(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  function isoAddDays(iso, n) {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  // ── No-data state ─────────────────────────────────────────────────────────
  function showNoData() {
    document.getElementById('main-content').innerHTML = `
      <div class="no-data-state">
        <div class="spade">&#9824;</div>
        <h2>No offers yet</h2>
        <p>Sync from the Offer+ extension to see your Club Royale offers here, offline, anytime.</p>
        <div class="no-data-steps">
          <div class="no-data-step">
            <div class="no-data-step-num">1</div>
            <div class="no-data-step-text"><strong>Add to Home Screen</strong>You only need to do this once</div>
          </div>
          <div class="no-data-step">
            <div class="no-data-step-num">2</div>
            <div class="no-data-step-text"><strong>Open Offer+ extension</strong>Click &#8635; Sync to Mobile in the dashboard</div>
          </div>
          <div class="no-data-step">
            <div class="no-data-step-num">3</div>
            <div class="no-data-step-text"><strong>Tap Sync here</strong>Point your camera at the QR code for ~15 seconds</div>
          </div>
        </div>
        <button id="syncBtn-nodata" class="icon-btn" style="margin-top:8px;padding:0 20px;font-size:15px;height:48px;">&#8635; Sync now</button>
      </div>`;
    document.getElementById('syncBtn-nodata')?.addEventListener('click', openSyncModal);
  }

  // ── Sync modal wiring ────────────────────────────────────────────────────
  function wireSync() {
    document.getElementById('syncBtn')?.addEventListener('click', openSyncModal);
  }
  function openSyncModal() {
    import('./sync.js').then(m => m.startSync({
      onProgress(received, total) {
        const pct = total ? Math.round((received / total) * 100) : 0;
        document.getElementById('syncProgressBar').style.width = pct + '%';
        document.getElementById('sync-status-text').textContent =
          total ? `Frame ${received} of ${total}` : 'Waiting for QR frames…';
      },
      onComplete() {
        document.getElementById('syncModal').classList.remove('open');
        window.location.reload();
      },
      onError(msg) {
        document.getElementById('sync-status-text').textContent = '⚠ ' + msg;
      },
    }));
    document.getElementById('syncModal').classList.add('open');
    document.getElementById('sync-cancel-btn').onclick = () => {
      import('./sync.js').then(m => m.stopSync());
      document.getElementById('syncModal').classList.remove('open');
    };
  }

  // ── Service worker registration ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
