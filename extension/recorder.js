// MAIN world content script — runs at document_start before any page JS.
// Patches fetch/XHR to capture calls, and exposes crfBuildPayload().

(function () {
  if (window.__crfInstalled) return;
  window.__crfInstalled = true;

  const recorded = [];
  window.__crfRecorded = recorded;

  function post(entry) {
    window.postMessage({ __crf: true, entry }, "*");
    recorded.push(entry);
  }

  // ---- patch fetch ----
  let capturedAuthHeaders = null; // saved from the page's own offers/merged call

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const method = (init?.method || (input instanceof Request ? input.method : null) || "GET").toUpperCase();
    const start = performance.now();

    // Capture auth headers from the page's own API calls so we can reuse them
    if (url.includes("royalcaribbean.com/api/") && init?.headers) {
      const h = init.headers;
      const auth = h instanceof Headers ? Object.fromEntries(h.entries())
        : typeof h === "object" ? h : {};
      if (auth.authorization || auth.Authorization) {
        capturedAuthHeaders = auth;
        window.__crfAuthHeaders = auth;
        console.log("[CRF] Captured auth headers from page");
      }
    }

    const res = await origFetch(input, init);
    try {
      const clone = res.clone();
      const ct = clone.headers.get("content-type") || "";
      let body = null;
      if (ct.includes("application/json")) body = await clone.json().catch(() => null);
      post({ kind: "fetch", url, method, status: res.status, ms: Math.round(performance.now() - start), responseJson: body });
    } catch (_) {}
    return res;
  };

  // ---- patch XHR ----
  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let _url, _method;
    const open = xhr.open;
    xhr.open = function (method, url) { _method = method; _url = url; return open.apply(xhr, arguments); };
    xhr.addEventListener("loadend", () => {
      let body = null;
      try { const ct = xhr.getResponseHeader("content-type") || ""; if (ct.includes("json")) body = JSON.parse(xhr.responseText); } catch (_) {}
      post({ kind: "xhr", url: _url, method: _method, status: xhr.status, responseJson: body });
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  // ---- respond to sync trigger from content.js (isolated world) ----
  window.addEventListener("crf-sync-request", async () => {
    window.postMessage({ __crf: true, type: "STATUS", msg: "Fetching offers…" }, "*");
    const payload = await window.crfBuildPayload();
    window.postMessage({ __crf: true, type: "PAYLOAD", payload }, "*");
  });

  // ---- helpers ----
  function detectRegion(desc, name) {
    const s = ((desc || "") + " " + (name || "")).toUpperCase();
    if (s.includes("ALASKA")) return "Alaska";
    if (s.includes("HAWAII")) return "Hawaii";
    if (s.includes("MEDITERRANEAN") || s.includes("GREEK") || s.includes("ADRIATIC") || s.includes("CANARY")) return "Europe";
    if (s.includes("BERMUDA")) return "Bermuda";
    if (s.includes("BAHAMAS")) return "Bahamas";
    if (s.includes("PACIFIC") || s.includes("ENSENADA") || s.includes("CABO")) return "Pacific Coast";
    if (s.includes("MEXICO") && !s.includes("CARIBBEAN")) return "Mexico";
    if (s.includes("SOUTHERN CARIBBEAN")) return "Southern Caribbean";
    if (s.includes("EASTERN CARIBBEAN")) return "Eastern Caribbean";
    if (s.includes("WESTERN CARIBBEAN")) return "Western Caribbean";
    if (s.includes("CARIBBEAN")) return "Caribbean";
    if (s.includes("CANADA") || s.includes("NEW ENGLAND")) return "Canada & New England";
    return null;
  }

  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function mapCompType(co, s) {
    if (s?.isFREEPLAY && s.FREEPLAY_AMT > 0) return "Casino Cash";
    if (s?.isDOLLARSOFF && s.DOLLARSOFF_AMT > 0) return "Discount";
    if (s?.isCOMP) return "Free Cruise";
    const t = co?.offerType?.name || "";
    return t === "Complimentary" ? "Free Cruise" : (t || "Offer");
  }

  // ---- main payload builder ----
  window.crfBuildPayload = async function () {
    console.log("[CRF] Building payload…");

    // Use the response that RC's own page already fetched on load (most reliable)
    let data = null;
    const hit = recorded.find((e) => e.url?.includes("offers/merged") && e.responseJson?.offers);
    if (hit) {
      console.log("[CRF] Found captured page-load response:", hit.responseJson.offers.length, "offers");
      data = hit.responseJson;
    } else {
      // Fallback: make a fresh call using the page's own fetch (cookies auto-included)
      console.log("[CRF] No capture yet — making fresh API call…");
      try {
        const authHeaders = capturedAuthHeaders || window.__crfAuthHeaders || {};
        const r = await origFetch("https://www.royalcaribbean.com/api/casino/v2/offers/merged", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", ...authHeaders },
          body: "{}",
        });
        if (!r.ok) {
          console.error("[CRF] RC API returned", r.status);
          return null;
        }
        data = await r.json();
      } catch (e) {
        console.error("[CRF] fetch error:", e);
        return null;
      }
    }

    const rcOffers = data?.offers;
    if (!Array.isArray(rcOffers) || !rcOffers.length) {
      console.warn("[CRF] No offers in response. Full response:", data);
      return null;
    }

    // For offers where sailings aren't embedded, fetch them from /offers/facets
    const facetsCache = new Map();
    async function fetchSailings(o) {
      const co = o.campaignOffer;
      // Already have sailings
      if (co?.sailings?.length) return co.sailings;

      // Try the facets endpoint — called once per offer when "View Sailings" is clicked
      const cacheKey = o.campaignCode;
      if (facetsCache.has(cacheKey)) return facetsCache.get(cacheKey);

      // First check if recorder already captured a facets response for this offer
      const captured = recorded.find((e) =>
        e.url?.includes("offers/facets") && e.responseJson?.sailings?.length
      );
      if (captured) {
        console.log(`[CRF] Using captured facets for ${o.campaignCode}`);
        facetsCache.set(cacheKey, captured.responseJson.sailings);
        return captured.responseJson.sailings;
      }

      // The detail page calls offers/merged with pagination params to get sailings for one offer.
      // Retry up to 3 times on 5xx errors (RC backend is occasionally flaky).
      const raw = capturedAuthHeaders || window.__crfAuthHeaders || {};
      const authHeaders = Object.fromEntries(
        Object.entries(raw).filter(([k]) => k.toLowerCase() !== "content-type")
      );
      const body = JSON.stringify({
        offerCode: co?.offerCode,
        playerOfferId: o.playerOfferId,
        limit: 200,
        page: 1,
        sortBy: "sailDate",
        sortDirection: "asc",
      });

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[CRF] Fetching sailings for ${o.campaignCode} (attempt ${attempt})`);
          const r = await origFetch("https://www.royalcaribbean.com/api/casino/v2/offers/merged", {
            method: "POST",
            credentials: "include",
            headers: { ...authHeaders, "content-type": "application/json" },
            body,
          });
          const text = await r.text();
          if (r.status >= 500) {
            console.warn(`[CRF] ${r.status} for ${o.campaignCode} (attempt ${attempt}) — ${attempt < 3 ? "retrying…" : "giving up"}`);
            if (attempt < 3) { await sleep(3000 * attempt); continue; }
            return [];
          }
          if (!r.ok) {
            console.error(`[CRF] ${r.status} for ${o.campaignCode}:`, text.slice(0, 200));
            return [];
          }
          const json = JSON.parse(text);
          const matchedOffer = json?.offers?.find(
            (x) => x.campaignCode === o.campaignCode || x.campaignOffer?.offerCode === co?.offerCode
          ) ?? json?.offers?.[0];
          const sailings = matchedOffer?.campaignOffer?.sailings || [];
          console.log(`[CRF] Got ${sailings.length} sailings for ${o.campaignCode}`);
          facetsCache.set(cacheKey, sailings);
          return sailings;
        } catch (e) {
          console.error(`[CRF] fetch error (attempt ${attempt}):`, e);
          if (attempt < 3) { await sleep(3000 * attempt); continue; }
          return [];
        }
      }
      return [];
    }

    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    const offers = [];
    for (const o of rcOffers) {
      const co = o.campaignOffer;
      if (!co) continue;

      if (offers.length > 0) await sleep(2000); // respect rate limit between per-offer calls
      window.postMessage({ __crf: true, type: "STATUS", msg: `Fetching ${offers.length + 1}/${rcOffers.length}: ${co.name || o.campaignCode}…` }, "*");
      const rawSailings = await fetchSailings(o);
      console.log(`[CRF] Offer ${o.campaignCode} (${co.sailingInclusionMode}): ${rawSailings.length} sailings`);

      const sailings = (rawSailings || []).map((s) => ({
        rcSailingId: s.id,
        ship: s.shipName,
        sailDate: s.sailDate,
        returnDate: addDays(s.sailDate, s.totalNights),
        nights: s.totalNights,
        itineraryName: s.itineraryName || null,
        region: detectRegion(s.itineraryDescription, s.itineraryName),
        departurePort: s.departurePort?.name || null,
        portsOfCall: null,
        stateroomCategory: s.roomType || null,
        priceAfterOffer: null,
        taxesFees: null,
        raw: s,
      }));
      offers.push({
        rcOfferId: o.campaignCode,
        title: co.name || o.campaignName,
        description: co.description || null,
        compType: mapCompType(co, co.sailings?.[0]),
        bookByDate: co.reserveByDate ? co.reserveByDate.slice(0, 10) : null,
        terms: null,
        raw: o,
        sailings,
      });
    }

    console.log(`[CRF] Mapped ${offers.length} offers, ${offers.reduce((a, o) => a + o.sailings.length, 0)} sailings`);
    return { offers };
  };
})();
