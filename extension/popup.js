const syncMsg = document.getElementById("sync-msg");

function showStatus(msg, color) {
  syncMsg.textContent = msg;
  syncMsg.style.color = color || "#8a93a3";
}

document.getElementById("open-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("sync-now").addEventListener("click", async () => {
  showStatus("Triggering sync…", "#3b82f6");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "TRIGGER_SYNC" });
    if (!resp?.ok) {
      showStatus(resp?.error || "Failed — are you on the Club Royale offers page?", "#ef4444");
    }
    // On success, status updates will arrive via storage listener below
  } catch (e) {
    showStatus("Error: " + e.message, "#ef4444");
  }
});

// Listen for live status updates written by content.js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.syncStatus) {
    const { msg, color } = changes.syncStatus.newValue;
    showStatus(msg, color);
    // Refresh last-sync display when sync completes
    if (msg.startsWith("✓")) loadLastSync();
  }
});

async function loadLastSync() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_LAST_SYNC" });
    const el = document.getElementById("last-sync");
    if (resp?.lastSync) {
      el.textContent = new Date(resp.lastSync).toLocaleString();
      el.style.color = "#22c55e";
    } else {
      el.textContent = "never";
    }
  } catch (_) {}
}

// On open: restore any in-progress status
chrome.storage.local.get("syncStatus", ({ syncStatus }) => {
  if (syncStatus) showStatus(syncStatus.msg, syncStatus.color);
});

loadLastSync();
