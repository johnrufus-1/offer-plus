// sync-to-mobile.js — animated QR transmission for Offer+ mobile PWA sync
// Loaded as a plain <script> (not a module). Globals: pako, qrcode (from vendor/).
// Exposes: window.startMobileSync(data), window.stopMobileSync()

(function () {
  'use strict';

  const PWA_URL    = 'https://johnrufus-1.github.io/offer-plus/';
  const SETUP_KEY  = 'offerPlusMobileSetupSeen';

  // ── Protocol constants ───────────────────────────────────────────────────
  const CHUNK_BYTES = 900;
  const FPS         = 8;
  const FRAME_MS    = Math.round(1000 / FPS);
  const B32         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  // ── Encoding helpers ─────────────────────────────────────────────────────
  function toBase32(bytes) {
    let bits = 0, val = 0, out = '';
    for (let i = 0; i < bytes.length; i++) {
      val = (val << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) { bits -= 5; out += B32[(val >>> bits) & 31]; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }

  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
    return crc;
  }

  async function sha256hex(bytes) {
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function hex4(n) { return (n & 0xFFFF).toString(16).padStart(4, '0').toUpperCase(); }
  function hex8(n) { return ((n >>> 0) & 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase(); }

  // ── QR renderer ─────────────────────────────────────────────────────────
  // ecLevel: 'L' for dense data frames, 'M' for the static install URL
  // mode: 'Alphanumeric' for OP1 frames, omit for auto (byte mode for URLs)
  function renderQR(canvas, text, { ecLevel = 'L', mode = null, sizePx = 480 } = {}) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width  = sizePx + 'px';
    canvas.style.height = sizePx + 'px';
    canvas.width  = sizePx * dpr;
    canvas.height = sizePx * dpr;

    const qr = qrcode(0, ecLevel);
    if (mode) qr.addData(text, mode);
    else       qr.addData(text);
    qr.make();

    const n      = qr.getModuleCount();
    const cellPx = Math.floor((sizePx * dpr) / (n + 8));
    const offX   = Math.floor((sizePx * dpr - cellPx * n) / 2);
    const offY   = Math.floor((sizePx * dpr - cellPx * n) / 2);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(offX + c * cellPx, offY + r * cellPx, cellPx, cellPx);
      }
    }
  }

  // ── Session state ────────────────────────────────────────────────────────
  let _timer      = null;
  let _frameIndex = 0;

  // ── Step 1 — Install onboarding ──────────────────────────────────────────
  function showSetupStep(data) {
    const modal = document.getElementById('sync-mobile-modal');
    document.getElementById('sync-modal-title').textContent = 'Get Offer+ on Your Phone';
    document.getElementById('sync-modal-body').innerHTML = `
      <p class="sync-modal-hint">Scan to open the Offer+ app on your phone, then add it to your home screen. You only need to do this once.</p>
      <canvas id="sync-setup-canvas" class="sync-setup-canvas"></canvas>
      <div class="sync-setup-url">${PWA_URL.replace('https://', '')}</div>
      <ol class="sync-setup-steps">
        <li>Scan the QR code with your phone camera</li>
        <li>Tap <strong>Share → Add to Home Screen</strong> (iOS) or <strong>Install app</strong> (Android)</li>
        <li>Come back here and click <strong>Ready →</strong></li>
      </ol>
      <div class="sync-setup-actions">
        <button class="sync-skip-btn" id="sync-skip-setup">Already installed</button>
        <button class="sync-ready-btn" id="sync-ready-setup">Ready →</button>
      </div>`;

    modal.style.display = 'flex';

    // Render static install QR — use M error correction for better scan reliability
    const canvas = document.getElementById('sync-setup-canvas');
    renderQR(canvas, PWA_URL, { ecLevel: 'M', sizePx: 280 });

    const proceed = () => {
      localStorage.setItem(SETUP_KEY, '1');
      showSyncStep(data);
    };
    document.getElementById('sync-skip-setup').addEventListener('click', proceed);
    document.getElementById('sync-ready-setup').addEventListener('click', proceed);
  }

  // ── Step 2 — Animated QR sync ────────────────────────────────────────────
  async function showSyncStep(data) {
    document.getElementById('sync-modal-title').textContent = 'Sync to Mobile';
    document.getElementById('sync-modal-body').innerHTML = `
      <p class="sync-modal-hint">Point your phone at this screen. The QR cycles automatically — keep it visible until the progress bar fills on your phone.</p>
      <canvas id="sync-mobile-canvas"></canvas>
      <div class="sync-progress-wrap">
        <div class="sync-progress-bar" id="sync-mobile-progress"></div>
      </div>
      <div class="sync-modal-label" id="sync-mobile-label">Compressing data…</div>`;

    const canvas = document.getElementById('sync-mobile-canvas');
    const label  = document.getElementById('sync-mobile-label');
    const prog   = document.getElementById('sync-mobile-progress');

    // Compress
    const jsonStr    = JSON.stringify({
      sailings: data.sailings,
      profiles: data.profiles,
      counts:   data.counts,
      bookings: data.bookings || [],
    });
    const compressed = pako.gzip(jsonStr);
    const sha256     = await sha256hex(compressed);

    // Chunk
    const chunks = [];
    for (let i = 0; i < compressed.length; i += CHUNK_BYTES) {
      chunks.push(compressed.slice(i, i + CHUNK_BYTES));
    }
    const dataFrameCount = chunks.length;
    const totalFrames    = dataFrameCount + 1;

    // Manifest frame
    const mBody  = hex8(compressed.length) + ':' + sha256.toUpperCase() + ':' + hex8(dataFrameCount);
    const mCrc   = hex4(crc16(mBody));
    const manifestFrame = 'OP1:' + hex4(totalFrames) + ':0000:' + mCrc + ':' + mBody;

    // Data frames
    const dataFrames = chunks.map((chunk, i) => {
      const body = toBase32(chunk);
      return 'OP1:' + hex4(totalFrames) + ':' + hex4(i + 1) + ':' + hex4(crc16(body)) + ':' + body;
    });

    const allFrames = [manifestFrame, ...dataFrames];

    console.log(
      '[Offer+ Sync] Session ready:',
      totalFrames, 'frames,',
      (compressed.length / 1024).toFixed(1) + 'KB compressed,',
      'sha256=' + sha256.slice(0, 16) + '…'
    );

    _frameIndex = 0;
    function tick() {
      if (!document.getElementById('sync-mobile-canvas')) { stopMobileSync(); return; }
      renderQR(canvas, allFrames[_frameIndex], { ecLevel: 'L', mode: 'Alphanumeric' });
      if (_frameIndex === 0) {
        label.textContent = 'Manifest · ' + dataFrameCount + ' data frames · ' +
          (compressed.length / 1024).toFixed(1) + 'KB';
      } else {
        label.textContent = 'Frame ' + _frameIndex + ' of ' + dataFrameCount;
      }
      prog.style.width = ((_frameIndex / (allFrames.length - 1)) * 100).toFixed(1) + '%';
      _frameIndex = (_frameIndex + 1) % allFrames.length;
    }
    tick();
    _timer = setInterval(tick, FRAME_MS);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  async function startMobileSync(data) {
    const modal = document.getElementById('sync-mobile-modal');
    modal.style.display = 'flex';

    if (!localStorage.getItem(SETUP_KEY)) {
      showSetupStep(data);
    } else {
      showSyncStep(data);
    }
  }

  function stopMobileSync() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    const modal = document.getElementById('sync-mobile-modal');
    if (modal) modal.style.display = 'none';
  }

  window.startMobileSync = startMobileSync;
  window.stopMobileSync  = stopMobileSync;
})();
