// Isolated-world content script: bridges messages between
// the page context (recorder.js, MAIN world) and the background service worker.

(function () {
  // Trigger sync from popup/background
  chrome.runtime.onMessage.addListener((msg) => {
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
          setStatus(`Error: ${e}`, "#ef4444");
        }
      })();
      return;
    }

    // dev-mode recording
    try { chrome.runtime.sendMessage({ type: "RECORDED_CALL", entry: data.entry }); } catch (_) {}
  });

  function setStatus(msg, color) {
    chrome.storage.local.set({ syncStatus: { msg, color, ts: Date.now() } });
  }
})();
