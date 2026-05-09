// Isolated-world content script: bridges messages between
// the page context (recorder.js, MAIN world) and the background service worker.

(function () {
  if (window.__crfContentInstalled) return;
  window.__crfContentInstalled = true;

  // Returns true while the extension context is still valid. Goes false if
  // the extension is reloaded while this tab is still open — at which point
  // any chrome.* call would throw "Extension context invalidated". The
  // background's TRIGGER_SYNC handler injects a fresh content.js to take
  // over, so this stale instance silently steps aside.
  function contextValid() {
    try { return !!chrome.runtime?.id; } catch { return false; }
  }

  // Trigger sync from popup/background
  chrome.runtime.onMessage.addListener((msg) => {
    if (!contextValid()) return;
    if (msg.type === "TRIGGER_SYNC") {
      setStatus("Fetching offers…", "#3b82f6");
      window.dispatchEvent(new CustomEvent("crf-sync-request"));
    }
  });

  // Bridge postMessages from page context to background
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__crf !== true) return;
    if (!contextValid()) return; // stale instance — let the fresh one handle it

    if (data.type === "STATUS") {
      setStatus(data.msg, "#3b82f6");
      return;
    }

    if (data.type === "PAYLOAD") {
      (async () => {
        const payload = data.payload;
        if (!payload) {
          setStatus("No offers returned", "#f59e0b");
          return;
        }
        setStatus("Syncing…", "#3b82f6");
        try {
          const resp = await chrome.runtime.sendMessage({ type: "SYNC", payload });
          if (resp?.ok) {
            setStatus(`✓ Synced ${resp.body.offers} offers / ${resp.body.sailings} sailings`, "#22c55e");
          } else {
            setStatus(`Sync failed: ${resp?.status ?? "?"} ${JSON.stringify(resp?.body ?? "")}`, "#ef4444");
          }
        } catch (e) {
          if (String(e).includes("Extension context invalidated")) return;
          setStatus(`Error: ${e}`, "#ef4444");
        }
      })();
      return;
    }

    // dev-mode recording
    try { chrome.runtime.sendMessage({ type: "RECORDED_CALL", entry: data.entry }); } catch (_) {}
  });

  function setStatus(msg, color) {
    if (!contextValid()) return;
    try {
      chrome.storage.local.set({ syncStatus: { msg, color, ts: Date.now() } });
    } catch (_) {
      // context invalidated mid-call — silently no-op
    }
  }
})();
