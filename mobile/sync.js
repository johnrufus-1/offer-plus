// QR camera scanner — OP1 protocol receiver
// Depends on window.jsQR (from vendor/jsQR.js) and window.pako (from vendor/pako.min.js),
// both loaded as plain <script> tags before this module.

import { saveData } from './db.js';

// ── Codec helpers ────────────────────────────────────────────────────────────
const B32_VAL = {};
'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('').forEach((c, i) => { B32_VAL[c] = i; });

function fromBase32(str) {
  const bytes = [];
  let bits = 0, val = 0;
  for (let i = 0; i < str.length; i++) {
    const v = B32_VAL[str[i]];
    if (v === undefined) continue; // skip padding/unknown chars
    val = (val << 5) | v;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((val >>> bits) & 0xFF); }
  }
  return new Uint8Array(bytes);
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

// ── Session state ────────────────────────────────────────────────────────────
let stream       = null;
let scanInterval = null;

// ── Public API ───────────────────────────────────────────────────────────────
export async function startSync(callbacks) {
  const { onProgress, onComplete, onError } = callbacks;

  // Camera
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    });
  } catch (e) {
    onError('Camera access denied — please allow camera and try again.');
    return;
  }

  const video = document.getElementById('sync-video');
  video.srcObject = stream;
  try { await video.play(); } catch (_) {}

  // Frame collector
  const frames = {}; // frameIndex (1-based) → Uint8Array chunk
  let manifest = null; // { totalBytes, sha256, dataFrameCount }
  let received = 0;

  const offscreen = document.createElement('canvas');
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });

  async function checkComplete() {
    stopScanLoop();

    // Concatenate chunks in order
    let totalLen = 0;
    for (let i = 1; i <= manifest.dataFrameCount; i++) {
      if (!frames[i]) {
        onError('Missing frame ' + i + ' — try syncing again.');
        return;
      }
      totalLen += frames[i].length;
    }
    const compressed = new Uint8Array(totalLen);
    let offset = 0;
    for (let i = 1; i <= manifest.dataFrameCount; i++) {
      compressed.set(frames[i], offset);
      offset += frames[i].length;
    }

    // Trim to declared size (guards against base32 fringe byte)
    const trimmed = compressed.slice(0, manifest.totalBytes);

    // sha-256 integrity check
    const hash = await sha256hex(trimmed);
    if (hash !== manifest.sha256) {
      onError('Checksum mismatch — data may be from mixed cycles. Try again.');
      return;
    }

    // Decompress
    let data;
    try {
      const json = window.pako.ungzip(trimmed, { to: 'string' });
      data = JSON.parse(json);
    } catch (e) {
      onError('Decompression failed: ' + e.message);
      return;
    }

    // Persist
    try {
      await saveData(data);
    } catch (e) {
      onError('Could not save data: ' + e.message);
      return;
    }

    stopSync();
    onComplete(data);
  }

  function processQRData(text) {
    if (!text.startsWith('OP1:')) return;

    // Frame format: OP1:{TTTT}:{IIII}:{CRC4}:{body}
    // Split only first 4 colons to isolate the body (body may contain ':' in manifest)
    const firstColon  = 4; // after 'OP1'
    const p1 = text.indexOf(':', firstColon);
    const p2 = text.indexOf(':', p1 + 1);
    const p3 = text.indexOf(':', p2 + 1);
    const p4 = text.indexOf(':', p3 + 1);
    if (p4 < 0) return;

    const frameIndex = parseInt(text.slice(p1 + 1, p2), 16);
    const frameCrc   = parseInt(text.slice(p3 + 1, p4), 16);
    const body       = text.slice(p4 + 1);

    if (isNaN(frameIndex) || isNaN(frameCrc)) return;

    // CRC check — silently drop corrupt frames
    if (crc16(body) !== frameCrc) return;

    if (frameIndex === 0) {
      // Manifest: {SIZE8}:{SHA256_64}:{FRAMES8}
      const mp = body.split(':');
      if (mp.length < 3) return;
      const totalBytes     = parseInt(mp[0], 16);
      const payloadSha256  = mp[1].toLowerCase();
      const dataFrameCount = parseInt(mp[2], 16);
      if (isNaN(totalBytes) || isNaN(dataFrameCount) || payloadSha256.length !== 64) return;

      if (!manifest) {
        manifest = { totalBytes, sha256: payloadSha256, dataFrameCount };
      }
      // If we already have all data frames, complete now
      if (manifest && received >= manifest.dataFrameCount) checkComplete();
    } else {
      // Data frame
      if (frames[frameIndex]) return; // deduplicate
      frames[frameIndex] = fromBase32(body);
      received++;

      if (manifest) {
        onProgress(received, manifest.dataFrameCount);
        if (received >= manifest.dataFrameCount) checkComplete();
      } else {
        onProgress(received, 0); // total unknown until manifest arrives
      }
    }
  }

  function scanTick() {
    if (!stream || video.readyState < 2 || !video.videoWidth) return;
    offscreen.width  = video.videoWidth;
    offscreen.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const result    = window.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert', // QR codes are black-on-white
    });
    if (result?.data) processQRData(result.data);
  }

  onProgress(0, 0);
  scanInterval = setInterval(scanTick, 100); // 10 scans/sec
}

function stopScanLoop() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
}

export function stopSync() {
  stopScanLoop();
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  const video = document.getElementById('sync-video');
  if (video) { video.srcObject = null; }
}
