// export-generator.js — generates a self-contained mobile HTML snapshot
// Loaded as a plain <script> (not a module) so generateMobileHtml is a global.

const MOBILE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0b0d10;
  --panel: #13161b;
  --panel2: #1a1f27;
  --border: #222831;
  --muted: #8a93a3;
  --text: #e8ecf2;
  --accent: #3b82f6;
  --warn: #f59e0b;
  --green: #22c55e;
  --red: #ef4444;
}

html { background: var(--bg); }
body {
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ── Topbar ── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.logo {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
  flex-shrink: 0;
}
#search {
  flex: 1;
  min-width: 0;
  background: var(--panel2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 0 10px;
  font: inherit;
  font-size: 14px;
  outline: none;
  height: 44px;
}
#search:focus { border-color: var(--accent); }
#sortSelect {
  background: var(--panel2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 0 6px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  height: 44px;
  flex-shrink: 0;
}
.topbar-toggles { display: flex; gap: 4px; flex-shrink: 0; }
.icon-btn {
  background: var(--panel2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  min-width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  padding: 0 8px;
  flex-shrink: 0;
  transition: border-color .15s;
}
.icon-btn:active { border-color: var(--accent); }
.icon-btn.active { background: rgba(59,130,246,.15); border-color: var(--accent); color: #93c5fd; }
#favBtn.active { background: rgba(251,191,36,.15); border-color: #fbbf24; color: #fbbf24; }
#bookedBtn.active { background: rgba(34,197,94,.15); border-color: #22c55e; color: #86efac; }

/* ── Drawer ── */
.drawer-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  z-index: 299;
}
.drawer-overlay.open { display: block; }
.drawer {
  position: fixed;
  left: 0;
  top: 0;
  width: 285px;
  height: 100vh;
  height: 100dvh;
  background: var(--panel);
  border-right: 1px solid var(--border);
  z-index: 300;
  overflow-y: auto;
  transform: translateX(-100%);
  transition: transform .25s ease;
  display: flex;
  flex-direction: column;
}
.drawer.open { transform: translateX(0); }
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  background: var(--panel);
  z-index: 1;
}
.drawer-title { font-size: 14px; font-weight: 600; }
.drawer-body { padding: 12px 14px; overflow-y: auto; flex: 1; }

/* ── Filter sections ── */
.filter-section { margin-bottom: 18px; }
.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted);
  margin-bottom: 8px;
  display: block;
}
.filter-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.filter-label-row .filter-label { margin-bottom: 0; }
.filter-action { background: none; border: none; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer; padding: 4px; }
.chip-group { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 99px;
  border: 1px solid var(--border);
  background: var(--panel2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  min-height: 36px;
  transition: border-color .15s;
}
.chip.active { border-color: var(--accent); background: rgba(59,130,246,.15); color: var(--accent); }
.date-inputs { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.date-inputs input {
  background: var(--panel2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  outline: none;
  height: 44px;
  width: 100%;
}
.date-inputs input:focus { border-color: var(--accent); }
.nights-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
.nights-row input[type=range] { flex: 1; accent-color: var(--accent); height: 20px; }
.rooms-profile-group { margin-bottom: 10px; }
.rooms-profile-group:last-child { margin-bottom: 0; }
.rooms-profile-label { font-size: 11px; color: var(--muted); margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
#reset-btn {
  width: 100%;
  background: var(--panel2);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 8px;
  padding: 0 10px;
  cursor: pointer;
  font: inherit;
  height: 44px;
  margin-top: 4px;
}

/* ── View bar ── */
.view-bar {
  display: flex;
  padding: 8px 10px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  gap: 0;
}
.view-btn {
  background: var(--panel2);
  border: 1px solid var(--border);
  color: var(--muted);
  padding: 6px 18px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  height: 36px;
}
.view-btn:first-child { border-radius: 8px 0 0 8px; }
.view-btn:last-child { border-radius: 0 8px 8px 0; border-left: none; }
.view-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* ── Content ── */
.content { flex: 1; padding: 10px 12px; }
.readonly-banner {
  background: rgba(59,130,246,.08);
  border: 1px solid rgba(59,130,246,.2);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 10px;
}
#result-count { font-size: 12px; color: var(--muted); margin-bottom: 10px; }

/* ── Sailing cards ── */
.sailing-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  margin-bottom: 8px;
  padding: 12px 14px;
}
.card-row1 { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
.card-ship { font-size: 15px; font-weight: 600; }
.card-offer-code {
  font-size: 11px;
  color: var(--muted);
  font-family: ui-monospace, monospace;
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
}
.card-badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; width: 100%; margin-top: 4px; }
.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 99px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.badge-warn { background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.3); color: #fca5a5; }
.badge-ok   { background: rgba(34,197,94,.12);  border-color: rgba(34,197,94,.3);  color: #86efac; }
.badge-match { background: rgba(59,130,246,.15); border-color: rgba(59,130,246,.4); color: #93c5fd; }
.badge-room {
  border-color: var(--border);
  color: var(--muted);
  background: var(--panel2);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.badge-fav { color: #fbbf24; font-size: 15px; line-height: 1; }
.card-itin-link {
  font-size: 11px;
  color: var(--muted);
  text-decoration: none;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 99px;
  background: var(--panel2);
  white-space: nowrap;
}
.card-row2 { display: flex; align-items: center; gap: 6px; font-size: 13px; flex-wrap: wrap; margin-bottom: 5px; }
.card-date { font-weight: 500; }
.card-nights { padding: 1px 7px; border-radius: 5px; background: var(--panel2); border: 1px solid var(--border); font-size: 12px; }
.card-sep { color: var(--border); }
.card-port { color: var(--muted); }
.card-itinerary { color: var(--muted); }
.card-row3 { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 4px; }
.port-chip { padding: 2px 7px; border-radius: 5px; background: var(--panel2); border: 1px solid var(--border); font-size: 11px; color: var(--muted); }
.profile-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; flex-shrink: 0; }
.profile-dots { display: inline-flex; gap: 2px; align-items: center; }
.profile-dots .profile-dot { margin-right: 0; }
.badge-room .profile-dot { width: 7px; height: 7px; margin-right: 0; }
.profile-chip .profile-dot { width: 7px; height: 7px; }
.profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 0 0;
  border-top: 1px dashed var(--border);
  margin-top: 6px;
  font-size: 12px;
}
.profile-row-name { font-weight: 600; display: inline-flex; align-items: center; }
.profile-row-room { color: var(--muted); font-style: italic; }
.profile-row-desc { color: var(--muted); }
.profile-row-price { font-weight: 600; margin-left: auto; }
.profile-row-bookby { color: var(--muted); white-space: nowrap; font-size: 11px; }
.profile-row-bookby.urgent { color: #fca5a5; }
.card-price-taxes { font-size: 11px; color: var(--muted); }

/* ── Calendar ── */
#calendar-view { display: flex; flex-direction: column; gap: 14px; }
.cal-month { border: 1px solid var(--border); border-radius: 12px; background: var(--panel); padding: 14px; }
.cal-month-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.cal-month-name { font-size: 15px; font-weight: 600; }
.cal-month-count { font-size: 12px; color: var(--muted); }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-dow { text-align: center; font-size: 10px; color: var(--muted); padding: 3px 0; }
.cal-day {
  aspect-ratio: 1;
  border-radius: 5px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.cal-day.has-sailings { cursor: pointer; }
.cal-day.cal-day-active { outline: 2px solid var(--accent); outline-offset: 1px; }
.cal-day-num { font-size: 10px; line-height: 1; }
.cal-day-count { font-size: 9px; font-weight: 700; line-height: 1; margin-top: 1px; color: #93c5fd; }
.cal-day-panel { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); display: none; }
.cal-day-panel.open { display: block; }
.cal-detail-header { font-size: 14px; font-weight: 600; color: var(--accent); margin-bottom: 10px; }

/* ── Empty state ── */
.empty-state { text-align: center; padding: 48px 20px; color: var(--muted); }
.empty-state h3 { font-size: 16px; margin-bottom: 6px; color: var(--text); }
`;

// MOBILE_JS contains no template-literal expressions (${}) or backticks —
// all dynamic HTML is built with string concatenation so this constant
// is safe to embed inside the outer template literal in generateMobileHtml.
const MOBILE_JS = `
(function () {
  var _d        = window.__DATA__;
  var allSailings = _d.sailings  || [];
  var profiles    = _d.profiles  || [];
  var counts      = _d.counts    || {};
  var bookings    = _d.bookings  || [];

  var favSet    = new Set(allSailings.filter(function(s){ return s.isFavorite; }).map(function(s){ return s.rcSailingId; }));
  var bookedSet = new Set(allSailings.filter(function(s){ return s.booking;    }).map(function(s){ return s.rcSailingId; }));
  bookings.forEach(function(b){ bookedSet.add(b.rcSailingId); });

  var filters = {
    search: '', profileIds: new Set(), ships: new Set(), regions: new Set(),
    departurePorts: new Set(), rooms: new Set(),
    minNights: 0, sailFrom: '', sailTo: '',
    favOnly: false, bookedOnly: false, matchOnly: false,
  };
  var sortKey = 'sailDate';
  var view    = 'list';

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function profileById(id) {
    return profiles.find(function(p){ return p.profileId === id; }) || null;
  }
  function profileColor(profileId) {
    var h = 0;
    for (var i = 0; i < profileId.length; i++) h = (h * 31 + profileId.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ' 70% 60%)';
  }
  function fmtShortDate(iso) {
    if (!iso) return '';
    try {
      var p = iso.slice(0,10).split('-');
      return new Date(+p[0], +p[1]-1, +p[2]).toLocaleDateString('default', { month:'short', day:'numeric', year:'numeric' });
    } catch(e){ return iso; }
  }
  function todayISO() { return new Date().toISOString().slice(0,10); }
  function addDaysISO(n) { var d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function isoAddDays(iso, n) {
    if (!iso) return '';
    var p = iso.slice(0,10).split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1]-1, p[2]));
    dt.setUTCDate(dt.getUTCDate()+n);
    return dt.toISOString().slice(0,10);
  }
  function daysUntil(iso) {
    if (!iso) return null;
    var now = new Date(); now.setHours(0,0,0,0);
    return Math.round((new Date(iso+'T00:00:00') - now) / 86400000);
  }
  function earliestBookBy(s) {
    var dates = Object.values(s.profiles || {})
      .map(function(p){ return p.offer && p.offer.bookByDate; }).filter(Boolean);
    return dates.length ? dates.reduce(function(a,b){ return a<b?a:b; }) : null;
  }
  function buildItineraryUrl(s) {
    if (!s || !s.itineraryCode || !s.sailDate) return null;
    function slugify(v) {
      return String(v||'').toLowerCase().replace(/'/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    }
    var parts = [
      s.nights+'-night', slugify(s.region), slugify(s.itineraryName),
      'from', slugify(s.departurePort), 'on', slugify((s.ship||'').split(' ')[0]), s.itineraryCode
    ].filter(Boolean);
    return 'https://www.royalcaribbean.com/itinerary/' + parts.join('-').replace(/-+/g,'-') +
      '?sailDate=' + encodeURIComponent(s.sailDate) + '&country=USA';
  }

  // ── Drawer ───────────────────────────────────────────────────────────────
  var drawer  = document.getElementById('filterDrawer');
  var overlay = document.getElementById('drawerOverlay');
  function openDrawer()  { drawer.classList.add('open'); overlay.classList.add('open'); document.body.style.overflow='hidden'; }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); document.body.style.overflow=''; }
  document.getElementById('filterToggle').addEventListener('click', openDrawer);
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // ── Facets ───────────────────────────────────────────────────────────────
  function renderChips(containerId, values, filterKey) {
    var el = document.getElementById(containerId);
    el.innerHTML = '';
    values.forEach(function(v) {
      var chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = v;
      chip.addEventListener('click', function() {
        if (filters[filterKey].has(v)) filters[filterKey].delete(v);
        else filters[filterKey].add(v);
        chip.classList.toggle('active', filters[filterKey].has(v));
        render();
      });
      el.appendChild(chip);
    });
  }
  function renderProfileRooms() {
    var container = document.getElementById('rooms-section');
    if (!container) return;
    container.innerHTML = '';
    var roomsByProfile = new Map();
    allSailings.forEach(function(s) {
      Object.keys(s.profiles || {}).forEach(function(pid) {
        var r = s.profiles[pid].stateroomCategory;
        if (!r) return;
        if (!roomsByProfile.has(pid)) roomsByProfile.set(pid, new Set());
        roomsByProfile.get(pid).add(r);
      });
    });
    profiles.forEach(function(profile) {
      var set = roomsByProfile.get(profile.profileId);
      if (!set || !set.size) return;
      var group = document.createElement('div');
      group.className = 'rooms-profile-group';
      var dot = '<span class="profile-dot" style="background:'+profileColor(profile.profileId)+'"></span>';
      group.innerHTML = '<div class="rooms-profile-label">' + dot + esc(profile.name) + (profiles.length > 1 ? "'s rooms" : ' Rooms') + '</div>';
      var chipsEl = document.createElement('div');
      chipsEl.className = 'chip-group';
      Array.from(set).sort().forEach(function(r) {
        var key = profile.profileId+'|'+r;
        var chip = document.createElement('button');
        chip.className = 'chip';
        chip.textContent = r;
        if (filters.rooms.has(key)) chip.classList.add('active');
        chip.addEventListener('click', function() {
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
    var section = document.getElementById('profiles-section');
    var el = document.getElementById('profile-chips');
    el.innerHTML = '';
    if (profiles.length < 2) { section.style.display = 'none'; return; }
    section.style.display = '';
    profiles.forEach(function(p) {
      var chip = document.createElement('button');
      chip.className = 'chip profile-chip';
      chip.innerHTML = '<span class="profile-dot" style="background:'+profileColor(p.profileId)+'"></span>' + esc(p.name);
      chip.addEventListener('click', function() {
        if (filters.profileIds.has(p.profileId)) filters.profileIds.delete(p.profileId);
        else filters.profileIds.add(p.profileId);
        chip.classList.toggle('active', filters.profileIds.has(p.profileId));
        render();
      });
      el.appendChild(chip);
    });
  }
  function populateFacets() {
    var ships  = Array.from(new Set(allSailings.map(function(s){ return s.ship; }).filter(Boolean))).sort();
    var regions = Array.from(new Set(allSailings.map(function(s){ return s.region; }).filter(Boolean))).sort();
    var ports  = Array.from(new Set(allSailings.map(function(s){ return s.departurePort; }).filter(Boolean))).sort();
    renderChips('ship-chips', ships, 'ships');
    renderChips('region-chips', regions, 'regions');
    renderChips('departure-chips', ports, 'departurePorts');
    renderProfileRooms();
    renderProfileChips();
    var maxNights = Math.max.apply(null, allSailings.map(function(s){ return s.nights||0; }).concat([0]));
    document.getElementById('nights-range').max = maxNights;
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  function bindControls() {
    document.getElementById('search').addEventListener('input', function(e){ filters.search = e.target.value; render(); });
    document.getElementById('sortSelect').addEventListener('change', function(e){ sortKey = e.target.value; render(); });
    document.getElementById('nights-range').addEventListener('input', function(e) {
      filters.minNights = +e.target.value;
      document.getElementById('nights-val').textContent = filters.minNights === 0 ? 'Any' : '>=' + filters.minNights + 'n';
      render();
    });
    document.getElementById('sail-from').addEventListener('input', function(e){ filters.sailFrom = e.target.value; render(); });
    document.getElementById('sail-to').addEventListener('input', function(e){ filters.sailTo = e.target.value; render(); });
    document.getElementById('sail-preset-chips').addEventListener('click', function(e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('#sail-preset-chips .chip').forEach(function(c){ c.classList.remove('active'); });
      chip.classList.add('active');
      var days = chip.dataset.days;
      var customInputs = document.getElementById('sail-custom-inputs');
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
    document.querySelectorAll('.filter-action').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var t = btn.dataset.target;
        var keyMap = { ships:'ships', regions:'regions', rooms:'rooms', profileIds:'profileIds', departurePorts:'departurePorts' };
        var idMap  = { ships:'ship-chips', regions:'region-chips', rooms:'rooms-section', profileIds:'profile-chips', departurePorts:'departure-chips' };
        if (!keyMap[t]) return;
        filters[keyMap[t]] = new Set();
        var c = document.getElementById(idMap[t]);
        if (c) c.querySelectorAll('.chip.active').forEach(function(ch){ ch.classList.remove('active'); });
        render();
      });
    });
    document.getElementById('reset-btn').addEventListener('click', resetFilters);

    var favBtn    = document.getElementById('favBtn');
    var bookedBtn = document.getElementById('bookedBtn');
    var matchBtn  = document.getElementById('matchBtn');

    favBtn.addEventListener('click', function() {
      filters.favOnly = !filters.favOnly;
      favBtn.classList.toggle('active', filters.favOnly);
      render();
    });
    bookedBtn.addEventListener('click', function() {
      filters.bookedOnly = !filters.bookedOnly;
      bookedBtn.classList.toggle('active', filters.bookedOnly);
      render();
    });
    matchBtn.addEventListener('click', function() {
      filters.matchOnly = !filters.matchOnly;
      matchBtn.classList.toggle('active', filters.matchOnly);
      render();
    });
    if (profiles.length < 2) matchBtn.disabled = true;

    document.querySelectorAll('.view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        view = btn.dataset.view;
        document.querySelectorAll('.view-btn').forEach(function(b){ b.classList.toggle('active', b===btn); });
        document.getElementById('list-view').style.display     = view === 'list'     ? '' : 'none';
        document.getElementById('calendar-view').style.display = view === 'calendar' ? '' : 'none';
        render();
      });
    });
  }
  function resetFilters() {
    filters = { search:'', profileIds:new Set(), ships:new Set(), regions:new Set(), departurePorts:new Set(), rooms:new Set(), minNights:0, sailFrom:'', sailTo:'', favOnly:false, bookedOnly:false, matchOnly:false };
    document.getElementById('search').value = '';
    document.getElementById('nights-range').value = 0;
    document.getElementById('nights-val').textContent = 'Any';
    document.getElementById('sail-from').value = '';
    document.getElementById('sail-to').value = '';
    document.querySelectorAll('.chip.active').forEach(function(c){ c.classList.remove('active'); });
    var anyChip = document.querySelector('#sail-preset-chips .chip[data-days="0"]');
    if (anyChip) anyChip.classList.add('active');
    document.getElementById('sail-custom-inputs').style.display = 'none';
    document.getElementById('favBtn').classList.remove('active');
    document.getElementById('bookedBtn').classList.remove('active');
    document.getElementById('matchBtn').classList.remove('active');
    render();
  }

  // ── Filtering + Sorting ──────────────────────────────────────────────────
  function applyFilters() {
    var q = filters.search.toLowerCase();
    return allSailings.filter(function(s) {
      if (filters.favOnly    && !favSet.has(s.rcSailingId))                    return false;
      if (filters.bookedOnly && !bookedSet.has(s.rcSailingId))                 return false;
      if (filters.matchOnly  && (s.matchProfileIds||[]).length < 2)            return false;
      if (filters.profileIds.size) {
        var sp = new Set(s.matchProfileIds||[]);
        var ok = true;
        filters.profileIds.forEach(function(pid){ if (!sp.has(pid)) ok = false; });
        if (!ok) return false;
      }
      if (filters.ships.size         && !filters.ships.has(s.ship))            return false;
      if (filters.regions.size       && !filters.regions.has(s.region))        return false;
      if (filters.departurePorts.size && !filters.departurePorts.has(s.departurePort)) return false;
      if (filters.rooms.size) {
        var allowedByProfile = new Map();
        filters.rooms.forEach(function(entry) {
          var sep = entry.indexOf('|');
          if (sep < 0) return;
          var pid = entry.slice(0, sep), room = entry.slice(sep+1);
          if (!allowedByProfile.has(pid)) allowedByProfile.set(pid, new Set());
          allowedByProfile.get(pid).add(room);
        });
        var roomOk = true;
        allowedByProfile.forEach(function(allowed, pid) {
          var profileRoom = s.profiles && s.profiles[pid] && s.profiles[pid].stateroomCategory;
          if (!profileRoom || !allowed.has(profileRoom)) roomOk = false;
        });
        if (!roomOk) return false;
      }
      if (filters.minNights > 0 && (s.nights||0) < filters.minNights)         return false;
      if (filters.sailFrom && s.sailDate < filters.sailFrom)                   return false;
      if (filters.sailTo   && s.sailDate > filters.sailTo)                     return false;
      if (q) {
        var profileTexts = Object.values(s.profiles||{}).reduce(function(acc, p) {
          if (p.offer && p.offer.title)       acc.push(p.offer.title);
          if (p.offer && p.offer.description) acc.push(p.offer.description);
          if (p.stateroomCategory)            acc.push(p.stateroomCategory);
          return acc;
        }, []);
        var hay = [s.ship, s.itineraryName, s.region, s.departurePort]
          .concat(s.portsOfCall||[]).concat(profileTexts).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function applySorting(sailings) {
    return sailings.slice().sort(function(a,b) {
      switch(sortKey) {
        case 'sailDate':      return (a.sailDate||'').localeCompare(b.sailDate||'');
        case 'sailDate-desc': return (b.sailDate||'').localeCompare(a.sailDate||'');
        case 'bookBy':        return (earliestBookBy(a)||'9999').localeCompare(earliestBookBy(b)||'9999');
        case 'nights-desc':   return (b.nights||0) - (a.nights||0);
        case 'nights':        return (a.nights||0) - (b.nights||0);
        default:              return 0;
      }
    });
  }

  // ── Card (read-only) ─────────────────────────────────────────────────────
  function buildCard(s) {
    var card = document.createElement('div');
    card.className = 'sailing-card';

    var bookByDate = earliestBookBy(s);
    var daysLeft   = bookByDate ? daysUntil(bookByDate) : null;
    var urgencyBadge = (daysLeft !== null && daysLeft <= 7)
      ? '<span class="badge badge-warn">'+(daysLeft<=0?'Expired':daysLeft+'d left')+'</span>' : '';

    var isFav    = favSet.has(s.rcSailingId);
    var isBooked = bookedSet.has(s.rcSailingId);
    var isMatch  = (s.matchProfileIds||[]).length > 1;

    var profileDots = (s.matchProfileIds||[]).map(function(pid) {
      var p = profileById(pid);
      return '<span class="profile-dot" style="background:'+profileColor(pid)+'" title="'+esc(p?p.name:pid)+'"></span>';
    }).join('');

    var matchBadge  = isMatch  ? '<span class="badge badge-match">&#128279; Match &middot; '+s.matchProfileIds.length+'</span>' : '';
    var bookedBadge = isBooked ? '<span class="badge badge-ok">&#10003; Booked</span>' : '';
    var favStar     = isFav    ? '<span class="badge-fav">&#9733;</span>' : '';

    var itinUrl  = buildItineraryUrl(s);
    var itinLink = itinUrl ? '<a class="card-itin-link" href="'+esc(itinUrl)+'" target="_blank" rel="noopener">View on RC &#8599;</a>' : '';

    var roomToProfiles = new Map();
    (s.matchProfileIds||[]).forEach(function(pid) {
      var r = s.profiles && s.profiles[pid] && s.profiles[pid].stateroomCategory;
      if (!r) return;
      if (!roomToProfiles.has(r)) roomToProfiles.set(r,[]);
      roomToProfiles.get(r).push(pid);
    });
    var roomBadges = Array.from(roomToProfiles.entries()).map(function(pair) {
      var dots = pair[1].map(function(pid) {
        var name = (profileById(pid)||{}).name || pid;
        return '<span class="profile-dot" style="background:'+profileColor(pid)+'" title="'+esc(name)+'"></span>';
      }).join('');
      return '<span class="badge badge-room">'+dots+esc(pair[0])+'</span>';
    }).join('');

    var offerCodes = Array.from(new Set((s.matchProfileIds||[]).map(function(pid) {
      return s.profiles && s.profiles[pid] && s.profiles[pid].offerId;
    }).filter(Boolean)));
    var offerCodeTags = offerCodes.map(function(c){ return '<span class="card-offer-code">'+esc(c)+'</span>'; }).join('');

    var row1 = '<div class="card-row1">' +
      '<span class="card-ship">'+esc(s.ship||'Unknown Ship')+'</span>' +
      offerCodeTags +
      (profileDots ? '<span class="profile-dots">'+profileDots+'</span>' : '') +
      '</div>' +
      '<div class="card-badges">' + matchBadge + roomBadges + urgencyBadge + bookedBadge + favStar + itinLink + '</div>';

    var parts2 = [
      '<span class="card-date">'+fmtShortDate(s.sailDate)+'</span>',
      s.nights ? '<span class="card-nights">'+s.nights+'n</span>' : '',
      s.departurePort ? '<span class="card-sep">&middot;</span><span class="card-port">from '+esc(s.departurePort)+'</span>' : '',
      s.region        ? '<span class="card-sep">&middot;</span><span class="card-port">'+esc(s.region)+'</span>' : '',
      s.itineraryName ? '<span class="card-sep">&middot;</span><span class="card-itinerary">'+esc(s.itineraryName)+'</span>' : '',
    ].filter(Boolean).join('');
    var row2 = '<div class="card-row2">'+parts2+'</div>';

    var portChips = (s.portsOfCall||[]).map(function(p){ return '<span class="port-chip">'+esc(p)+'</span>'; }).join('');
    var row3 = portChips ? '<div class="card-row3">'+portChips+'</div>' : '';

    var profileRows = (s.matchProfileIds||[]).map(function(pid) {
      var pdata = (s.profiles && s.profiles[pid]) || {};
      var p     = profileById(pid);
      var bookBy  = pdata.offer && pdata.offer.bookByDate;
      var bbDays  = bookBy ? daysUntil(bookBy) : null;
      var bbStr   = bookBy
        ? '<span class="profile-row-bookby'+(bbDays!==null&&bbDays<=14?' urgent':'')+'">book by '+fmtShortDate(bookBy)+(bbDays!==null?' &middot; '+(bbDays>0?bbDays+'d':'expired'):'')+' </span>'
        : '';
      var desc  = pdata.offer && pdata.offer.description ? '<span class="profile-row-desc">'+esc(pdata.offer.description)+'</span>' : '';
      var room  = pdata.stateroomCategory ? '<span class="profile-row-room">'+esc(pdata.stateroomCategory)+'</span>' : '';
      var price = pdata.priceAfterOffer != null
        ? '<span class="profile-row-price">$'+pdata.priceAfterOffer.toLocaleString()+(pdata.taxesFees!=null?' <span class="card-price-taxes">+$'+pdata.taxesFees+'</span>':'')+' </span>'
        : '';
      return '<div class="profile-row">' +
        '<span class="profile-row-name" style="color:'+profileColor(pid)+'">' +
        '<span class="profile-dot" style="background:'+profileColor(pid)+'"></span>' +
        esc((p&&p.name)||pid) + '</span>' +
        desc + room + price + bbStr +
        '</div>';
    }).join('');

    card.innerHTML = row1 + row2 + row3 + profileRows;
    return card;
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    var filtered = applyFilters();
    var sorted   = applySorting(filtered);
    var matchCount = sorted.filter(function(s){ return (s.matchProfileIds||[]).length > 1; }).length;
    var summary = profiles.length > 1
      ? sorted.length + ' of ' + (counts.uniqueSailings||0) + ' sailings · ' + matchCount + (matchCount!==1?' matches':' match')
      : sorted.length + ' sailing' + (sorted.length!==1?'s':'') + ' of ' + (counts.uniqueSailings||0);
    document.getElementById('result-count').textContent = summary;
    if (view === 'list') renderList(sorted);
    else renderCalendar(sorted);
  }
  function renderList(sailings) {
    var el = document.getElementById('list-view');
    if (!sailings.length) {
      el.innerHTML = '<div class="empty-state"><h3>No sailings match</h3><p>Try adjusting your filters.</p></div>';
      return;
    }
    el.innerHTML = '';
    sailings.forEach(function(s){ el.appendChild(buildCard(s)); });
  }

  // ── Calendar ─────────────────────────────────────────────────────────────
  function renderCalendar(sailings) {
    var el = document.getElementById('calendar-view');
    if (!sailings.length) {
      el.innerHTML = '<div class="empty-state"><h3>No sailings match</h3><p>Adjust filters to see sailings.</p></div>';
      return;
    }
    var byMonth = new Map();
    sailings.forEach(function(s) {
      if (!s.sailDate) return;
      var ym = s.sailDate.slice(0,7);
      if (!byMonth.has(ym)) byMonth.set(ym,[]);
      byMonth.get(ym).push(s);
    });
    el.innerHTML = '';
    Array.from(byMonth.entries())
      .sort(function(a,b){ return a[0].localeCompare(b[0]); })
      .forEach(function(pair){ el.appendChild(buildMonth(pair[0], pair[1])); });
  }
  function buildMonth(ym, sailings) {
    var parts = ym.split('-').map(Number);
    var year = parts[0], month = parts[1];
    var daysInMonth = new Date(year, month, 0).getDate();
    var firstDow    = new Date(year, month-1, 1).getDay();

    var byDay = new Map();
    sailings.forEach(function(s) {
      var day = +s.sailDate.slice(8,10);
      if (!byDay.has(day)) byDay.set(day,[]);
      byDay.get(day).push(s);
    });
    var maxCount = Math.max.apply(null, Array.from(byDay.values()).map(function(a){ return a.length; }).concat([1]));
    var monthName = new Date(year, month-1, 1).toLocaleString('default', { month:'long', year:'numeric' });

    var wrap = document.createElement('div');
    wrap.className = 'cal-month';
    wrap.innerHTML =
      '<div class="cal-month-header">' +
        '<span class="cal-month-name">'+monthName+'</span>' +
        '<span class="cal-month-count">'+sailings.length+' sailing'+(sailings.length!==1?'s':'')+'</span>' +
      '</div>' +
      '<div class="cal-grid">' +
        ['Su','Mo','Tu','We','Th','Fr','Sa'].map(function(d){ return '<div class="cal-dow">'+d+'</div>'; }).join('') +
      '</div>';

    var grid  = wrap.querySelector('.cal-grid');
    var panel = document.createElement('div');
    panel.className = 'cal-day-panel';
    var activeCell = null;

    for (var i = 0; i < firstDow; i++) {
      var empty = document.createElement('div');
      empty.className = 'cal-day'; empty.style.border = 'none';
      grid.appendChild(empty);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var cell = document.createElement('div');
      cell.className = 'cal-day';
      var ds = byDay.get(d);
      if (ds && ds.length) {
        cell.classList.add('has-sailings');
        var intensity = Math.round((ds.length / maxCount) * 100);
        cell.style.background   = 'rgba(59,130,246,'+(0.15 + intensity*0.006)+')';
        cell.style.borderColor  = 'rgba(59,130,246,'+(0.3  + intensity*0.005)+')';
        cell.innerHTML = '<span class="cal-day-num">'+d+'</span><span class="cal-day-count">'+ds.length+'</span>';
        (function(daySailings, dayCell, dayNum) {
          dayCell.addEventListener('click', function() {
            if (activeCell) activeCell.classList.remove('cal-day-active');
            dayCell.classList.add('cal-day-active');
            activeCell = dayCell;
            panel.classList.add('open');
            var dateStr = fmtShortDate(ym+'-'+(dayNum<10?'0':'')+dayNum);
            panel.innerHTML = '<div class="cal-detail-header">'+dateStr+' &mdash; '+daySailings.length+' sailing'+(daySailings.length!==1?'s':'')+'</div>';
            daySailings.forEach(function(s){ panel.appendChild(buildCard(s)); });
          });
        })(ds, cell, d);
      } else {
        cell.innerHTML = '<span class="cal-day-num" style="color:#4b5563">'+d+'</span>';
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
    var n = counts.matches || 0;
    document.getElementById('matchBtn').textContent = n > 0 ? ('🔗 '+n) : '🔗';
    var f = favSet.size;
    document.getElementById('favBtn').textContent = f > 0 ? ('★ '+f) : '☆';
    render();
  }
  init();
})();
`;

function generateMobileHtml(data) {
  const exportDate = new Date().toLocaleDateString("default", { month: "long", day: "numeric", year: "numeric" });
  const dataJson = JSON.stringify({
    sailings: data.sailings,
    profiles: data.profiles,
    counts:   data.counts,
    bookings: data.bookings || [],
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offer+ · ${exportDate}</title>
  <style>${MOBILE_CSS}</style>
</head>
<body>

<header class="topbar">
  <button id="filterToggle" class="icon-btn" aria-label="Filters">&#9776;</button>
  <span class="logo">&#9824; Offer+</span>
  <input id="search" type="search" placeholder="Search ships, ports…" autocomplete="off" />
  <select id="sortSelect">
    <option value="sailDate">Date &#8593;</option>
    <option value="sailDate-desc">Date &#8595;</option>
    <option value="bookBy">Expiring soon</option>
    <option value="nights-desc">Longest</option>
    <option value="nights">Shortest</option>
  </select>
  <div class="topbar-toggles">
    <button id="favBtn"    class="icon-btn" title="Favorites">&#9734;</button>
    <button id="bookedBtn" class="icon-btn" title="Booked">&#10003;</button>
    <button id="matchBtn"  class="icon-btn" title="Match">&#128279;</button>
  </div>
</header>

<div id="drawerOverlay" class="drawer-overlay"></div>
<aside id="filterDrawer" class="drawer">
  <div class="drawer-header">
    <span class="drawer-title">Filters</span>
    <button id="drawerClose" class="icon-btn" aria-label="Close">&#215;</button>
  </div>
  <div class="drawer-body">
    <div class="filter-section" id="profiles-section" style="display:none">
      <div class="filter-label-row">
        <span class="filter-label">Profiles</span>
        <button class="filter-action" data-target="profileIds">Clear</button>
      </div>
      <div class="chip-group" id="profile-chips"></div>
    </div>
    <div class="filter-section">
      <div class="filter-label-row">
        <span class="filter-label">Ship</span>
        <button class="filter-action" data-target="ships">Clear</button>
      </div>
      <div class="chip-group" id="ship-chips"></div>
    </div>
    <div class="filter-section">
      <div class="filter-label">Sailing Within</div>
      <div class="chip-group" id="sail-preset-chips">
        <button class="chip active" data-days="0">Any</button>
        <button class="chip" data-days="30">30d</button>
        <button class="chip" data-days="90">90d</button>
        <button class="chip" data-days="180">6mo</button>
        <button class="chip" data-days="365">1yr</button>
        <button class="chip" data-days="custom">Custom…</button>
      </div>
      <div class="date-inputs" id="sail-custom-inputs" style="display:none">
        <input type="date" id="sail-from" />
        <input type="date" id="sail-to" />
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-label-row">
        <span class="filter-label">Region</span>
        <button class="filter-action" data-target="regions">Clear</button>
      </div>
      <div class="chip-group" id="region-chips"></div>
    </div>
    <div class="filter-section">
      <div class="filter-label-row">
        <span class="filter-label">Departs From</span>
        <button class="filter-action" data-target="departurePorts">Clear</button>
      </div>
      <div class="chip-group" id="departure-chips"></div>
    </div>
    <div class="filter-section">
      <div class="filter-label-row">
        <span class="filter-label">Rooms</span>
        <button class="filter-action" data-target="rooms">Clear</button>
      </div>
      <div id="rooms-section"></div>
    </div>
    <div class="filter-section">
      <div class="filter-label">Nights</div>
      <div class="nights-row">
        <span id="nights-val">Any</span>
        <input type="range" id="nights-range" min="0" max="30" value="0" step="1" />
      </div>
    </div>
    <button id="reset-btn">Reset Filters</button>
  </div>
</aside>

<div class="view-bar">
  <button class="view-btn active" data-view="list">&#9776; List</button>
  <button class="view-btn" data-view="calendar">&#128197; Cal</button>
</div>

<main class="content">
  <div class="readonly-banner">&#128241; Read-only snapshot — open Offer+ on your computer to sync updates</div>
  <p id="result-count"></p>
  <div id="list-view"></div>
  <div id="calendar-view" style="display:none"></div>
</main>

<script>window.__DATA__ = ${dataJson};<\/script>
<script>${MOBILE_JS}<\/script>
</body>
</html>`;
}
