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
        document.getElementById('list-view').style.display     = view === 'list'     ? '' : 'none';
        document.getElementById('calendar-view').style.display = view === 'calendar' ? '' : 'none';
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

    const bookByDate = earliestBookBy(s);
    const daysLeft   = bookByDate ? daysUntil(bookByDate) : null;
    const urgencyBadge = (daysLeft !== null && daysLeft <= 7)
      ? `<span class="badge badge-warn">${daysLeft <= 0 ? 'Expired' : daysLeft + 'd left'}</span>` : '';

    const isFav    = favSet.has(s.rcSailingId);
    const isBooked = bookedSet.has(s.rcSailingId);
    const isMatch  = (s.matchProfileIds || []).length > 1;

    const profileDots = (s.matchProfileIds || []).map(pid => {
      const p = profileById(pid);
      return `<span class="profile-dot" style="background:${profileColor(pid)}" title="${esc(p ? p.name : pid)}"></span>`;
    }).join('');

    const matchBadge  = isMatch  ? `<span class="badge badge-match">&#128279; Match &middot; ${s.matchProfileIds.length}</span>` : '';
    const bookedBadge = isBooked ? `<span class="badge badge-ok">&#10003; Booked</span>` : '';
    const favStar     = isFav    ? `<span class="badge-fav">&#9733;</span>` : '';

    const itinUrl  = buildItineraryUrl(s);
    const itinLink = itinUrl ? `<a class="card-itin-link" href="${esc(itinUrl)}" target="_blank" rel="noopener">View on RC &#8599;</a>` : '';

    const roomToProfiles = new Map();
    (s.matchProfileIds || []).forEach(pid => {
      const r = s.profiles?.[pid]?.stateroomCategory;
      if (!r) return;
      if (!roomToProfiles.has(r)) roomToProfiles.set(r, []);
      roomToProfiles.get(r).push(pid);
    });
    const roomBadges = [...roomToProfiles.entries()].map(([room, pids]) => {
      const dots = pids.map(pid => {
        const name = (profileById(pid) || {}).name || pid;
        return `<span class="profile-dot" style="background:${profileColor(pid)}" title="${esc(name)}"></span>`;
      }).join('');
      return `<span class="badge badge-room">${dots}${esc(room)}</span>`;
    }).join('');

    const offerCodes = [...new Set((s.matchProfileIds || []).map(pid => s.profiles?.[pid]?.offerId).filter(Boolean))];
    const offerCodeTags = offerCodes.map(c => `<span class="card-offer-code">${esc(c)}</span>`).join('');

    const row1 = `<div class="card-row1">
      <span class="card-ship">${esc(s.ship || 'Unknown Ship')}</span>
      ${offerCodeTags}
      ${profileDots ? `<span class="profile-dots">${profileDots}</span>` : ''}
    </div>
    <div class="card-badges">${matchBadge}${roomBadges}${urgencyBadge}${bookedBadge}${favStar}${itinLink}</div>`;

    const parts2 = [
      `<span class="card-date">${fmtShortDate(s.sailDate)}</span>`,
      s.nights ? `<span class="card-nights">${s.nights}n</span>` : '',
      s.departurePort ? `<span class="card-sep">&middot;</span><span class="card-port">from ${esc(s.departurePort)}</span>` : '',
      s.region        ? `<span class="card-sep">&middot;</span><span class="card-port">${esc(s.region)}</span>` : '',
      s.itineraryName ? `<span class="card-sep">&middot;</span><span class="card-itinerary">${esc(s.itineraryName)}</span>` : '',
    ].filter(Boolean).join('');
    const row2 = `<div class="card-row2">${parts2}</div>`;

    const portChips = (s.portsOfCall || []).map(p => `<span class="port-chip">${esc(p)}</span>`).join('');
    const row3 = portChips ? `<div class="card-row3">${portChips}</div>` : '';

    const profileRows = (s.matchProfileIds || []).map(pid => {
      const pdata = s.profiles?.[pid] || {};
      const p     = profileById(pid);
      const bookBy = pdata.offer?.bookByDate;
      const bbDays = bookBy ? daysUntil(bookBy) : null;
      const bbStr  = bookBy
        ? `<span class="profile-row-bookby${bbDays !== null && bbDays <= 14 ? ' urgent' : ''}">book by ${fmtShortDate(bookBy)}${bbDays !== null ? ' &middot; ' + (bbDays > 0 ? bbDays + 'd' : 'expired') : ''}</span>`
        : '';
      const desc  = pdata.offer?.description ? `<span class="profile-row-desc">${esc(pdata.offer.description)}</span>` : '';
      const room  = pdata.stateroomCategory  ? `<span class="profile-row-room">${esc(pdata.stateroomCategory)}</span>` : '';
      const price = pdata.priceAfterOffer != null
        ? `<span class="profile-row-price">$${pdata.priceAfterOffer.toLocaleString()}${pdata.taxesFees != null ? ` <span class="card-price-taxes">+$${pdata.taxesFees}</span>` : ''}</span>`
        : '';
      return `<div class="profile-row">
        <span class="profile-row-name" style="color:${profileColor(pid)}">
          <span class="profile-dot" style="background:${profileColor(pid)}"></span>${esc((p?.name) || pid)}
        </span>
        ${desc}${room}${price}${bbStr}
      </div>`;
    }).join('');

    card.innerHTML = row1 + row2 + row3 + profileRows;
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
    document.getElementById('result-count').textContent = summary;
    if (view === 'list') renderList(sorted);
    else renderCalendar(sorted);
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

  // ── Calendar ─────────────────────────────────────────────────────────────
  function renderCalendar(sailings) {
    const el = document.getElementById('calendar-view');
    if (!sailings.length) {
      el.innerHTML = '<div class="empty-state"><h3>No sailings match</h3><p>Adjust filters to see sailings.</p></div>';
      return;
    }
    const byMonth = new Map();
    sailings.forEach(s => {
      if (!s.sailDate) return;
      const ym = s.sailDate.slice(0, 7);
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym).push(s);
    });
    el.innerHTML = '';
    [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([ym, sails]) => el.appendChild(buildMonth(ym, sails)));
  }
  function buildMonth(ym, sailings) {
    const [year, month] = ym.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDow    = new Date(year, month - 1, 1).getDay();

    const byDay = new Map();
    sailings.forEach(s => {
      const day = +s.sailDate.slice(8, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(s);
    });
    const maxCount = Math.max(...[...byDay.values()].map(a => a.length), 1);
    const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const wrap = document.createElement('div');
    wrap.className = 'cal-month';
    wrap.innerHTML = `
      <div class="cal-month-header">
        <span class="cal-month-name">${monthName}</span>
        <span class="cal-month-count">${sailings.length} sailing${sailings.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="cal-grid">
        ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
      </div>`;

    const grid  = wrap.querySelector('.cal-grid');
    const panel = document.createElement('div');
    panel.className = 'cal-day-panel';
    let activeCell = null;

    for (let i = 0; i < firstDow; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day'; empty.style.border = 'none';
      grid.appendChild(empty);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      const ds = byDay.get(d);
      if (ds?.length) {
        cell.classList.add('has-sailings');
        const intensity = Math.round((ds.length / maxCount) * 100);
        cell.style.background  = `rgba(59,130,246,${0.15 + intensity * 0.006})`;
        cell.style.borderColor = `rgba(59,130,246,${0.3  + intensity * 0.005})`;
        cell.innerHTML = `<span class="cal-day-num">${d}</span><span class="cal-day-count">${ds.length}</span>`;
        cell.addEventListener('click', () => {
          if (activeCell) activeCell.classList.remove('cal-day-active');
          cell.classList.add('cal-day-active');
          activeCell = cell;
          panel.classList.add('open');
          const dateStr = fmtShortDate(ym + '-' + String(d).padStart(2, '0'));
          panel.innerHTML = `<div class="cal-detail-header">${dateStr} &mdash; ${ds.length} sailing${ds.length !== 1 ? 's' : ''}</div>`;
          ds.forEach(s => panel.appendChild(buildCard(s)));
        });
      } else {
        cell.innerHTML = `<span class="cal-day-num" style="color:#4b5563">${d}</span>`;
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(panel);
    return wrap;
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
