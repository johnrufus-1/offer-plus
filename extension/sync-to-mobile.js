// sync-to-mobile.js — animated QR transmission for Offer+ mobile PWA sync
// Loaded as a plain <script> (not a module). Globals: pako, qrcode (from vendor/).
// Exposes: window.startMobileSync(data), window.stopMobileSync()

(function () {
  'use strict';

  // ── Protocol constants ───────────────────────────────────────────────────
  // Each data frame encodes CHUNK_BYTES of compressed payload as base32.
  // Base32 gives 8/5 = 1.6 chars per byte → 900 bytes → 1440 chars + 19-char header = ~1459 chars.
  // QR alphanumeric mode V14 L holds ~1914 chars — fits comfortably, gives a ~73-module QR.
  const CHUNK_BYTES = 900;
  const FPS         = 8;
  const FRAME_MS    = Math.round(1000 / FPS); // 125ms

  // RFC 4648 base32 — all chars are in QR alphanumeric charset (A-Z, 2-7)
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

  // CRC-16/CCITT-FALSE — detects corrupt frames without breaking the stream
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
  function renderQR(canvas, text) {
    const dpr = window.devicePixelRatio || 1;
    const SIZE = 480; // logical CSS pixels
    if (canvas.style.width !== SIZE + 'px') {
      canvas.style.width  = SIZE + 'px';
      canvas.style.height = SIZE + 'px';
      canvas.width  = SIZE * dpr;
      canvas.height = SIZE * dpr;
    }

    // qrcode-generator: typeNumber 0 = auto, 'L' = lowest error correction
    // (L maximises data capacity per QR version — we rely on CRC for integrity)
    const qr = qrcode(0, 'L');
    qr.addData(text, 'Alphanumeric');
    qr.make();

    const n       = qr.getModuleCount();
    const cellPx  = Math.floor((SIZE * dpr) / (n + 8)); // 4-module quiet zone each side
    const offsetX = Math.floor((SIZE * dpr - cellPx * n) / 2);
    const offsetY = Math.floor((SIZE * dpr - cellPx * n) / 2);

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(offsetX + c * cellPx, offsetY + r * cellPx, cellPx, cellPx);
      }
    }
  }

  // ── Session state ────────────────────────────────────────────────────────
  let _timer      = null;
  let _frameIndex = 0;

  // ── Public API ───────────────────────────────────────────────────────────
  async function startMobileSync(data) {
    const modal  = document.getElementById('sync-mobile-modal');
    const canvas = document.getElementById('sync-mobile-canvas');
    const label  = document.getElementById('sync-mobile-label');
    const prog   = document.getElementById('sync-mobile-progress');

    label.textContent = 'Compressing data…';
    modal.style.display = 'flex';

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
    const totalFrames    = dataFrameCount + 1; // +1 for manifest (index 0)

    // Build manifest frame (index 0)
    // Format: OP1:{TTTT}:0000:{CRC}:{SIZE8}:{SHA256_64}:{FRAMES8}
    const mBody  = hex8(compressed.length) + ':' + sha256.toUpperCase() + ':' + hex8(dataFrameCount);
    const mCrc   = hex4(crc16(mBody));
    const manifestFrame = 'OP1:' + hex4(totalFrames) + ':0000:' + mCrc + ':' + mBody;

    // Build data frames (index 1..N)
    // Format: OP1:{TTTT}:{IIII}:{CRC}:{BASE32}
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

    // Cycle frames
    _frameIndex = 0;
    function tick() {
      const frame = allFrames[_frameIndex];
      renderQR(canvas, frame);

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

  function stopMobileSync() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    const modal = document.getElementById('sync-mobile-modal');
    if (modal) modal.style.display = 'none';
  }

  window.startMobileSync = startMobileSync;
  window.stopMobileSync  = stopMobileSync;
})();
