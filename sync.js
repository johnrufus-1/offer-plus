// Phase 3 placeholder — QR camera scanner will live here.
// startSync() opens the camera, collects OP1 frames, decompresses, writes IndexedDB.
// stopSync() tears down the camera stream.

import { saveData } from './db.js';

let stream = null;
let rafId  = null;

export async function startSync(callbacks) {
  const { onProgress, onComplete, onError } = callbacks;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    onError('Camera permission denied. Please allow camera access and try again.');
    return;
  }

  const video = document.getElementById('sync-video');
  video.srcObject = stream;
  await video.play();

  // Frame collector state
  const frames = {};
  let totalFrames = null;

  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');

  async function scanFrame() {
    if (!stream) return;
    if (video.readyState >= 2) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      // jsQR is loaded in Phase 3 — skip decode for now
    }
    rafId = requestAnimationFrame(scanFrame);
  }
  rafId = requestAnimationFrame(scanFrame);

  // Placeholder: simulate nothing received yet
  onProgress(0, 0);
}

export function stopSync() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  const video = document.getElementById('sync-video');
  if (video) { video.srcObject = null; }
}
