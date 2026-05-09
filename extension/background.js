import {
  upsertOffers, getAllData, getLastSync,
  toggleFavorite,
  setReminder, clearReminder, getAllReminders,
  ensureProfile, listProfiles, renameProfile, deleteProfile,
  exportProfileJson, importProfileJson,
  toggleOfferDisabled,
} from "./db.js";

const ALARM_PREFIX = "reminder-";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ recording: false, recordedCalls: [], lastSync: null });
  await rescheduleAllAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await rescheduleAllAlarms();
});

async function rescheduleAllAlarms() {
  try {
    const reminders = await getAllReminders();
    const existing = await chrome.alarms.getAll();
    const wanted = new Set(reminders.map((r) => ALARM_PREFIX + r.rcSailingId));
    // Clear stale alarms
    for (const a of existing) {
      if (a.name.startsWith(ALARM_PREFIX) && !wanted.has(a.name)) {
        chrome.alarms.clear(a.name);
      }
    }
    // (Re)create alarms for current reminders
    const now = Date.now();
    for (const r of reminders) {
      const when = Date.parse(r.fireAt);
      if (Number.isFinite(when) && when > now) {
        chrome.alarms.create(ALARM_PREFIX + r.rcSailingId, { when });
      } else {
        // Past-due: fire immediately and clean up
        await fireReminder(r);
      }
    }
  } catch (e) {
    console.error("[CRF] rescheduleAllAlarms failed:", e);
  }
}

async function fireReminder(reminder) {
  const s = reminder.snapshot || {};
  const ship = s.ship || "Sailing";
  const sailDate = s.sailDate ? formatShortDate(s.sailDate) : "";
  const bookByDate = s.bookByDate ? formatShortDate(s.bookByDate) : "";
  const titleDate = bookByDate || "soon";
  // Tiny 1x1 blue PNG so notifications don't reject for missing iconUrl.
  // Replace with chrome.runtime.getURL("icon128.png") if you add a real icon.
  const iconUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12NggIQwAAAOAAFCNbARAAAAAElFTkSuQmCC";
  chrome.notifications.create(`crf-reminder-${reminder.rcSailingId}`, {
    type: "basic",
    iconUrl,
    title: `Book by ${titleDate} — ${ship}`,
    message: [s.itineraryName, s.nights ? `${s.nights}n` : "", sailDate ? `sails ${sailDate}` : ""].filter(Boolean).join(" · ") || "Reminder",
    requireInteraction: true,
  }, () => {
    if (chrome.runtime.lastError) console.warn("[CRF] notification:", chrome.runtime.lastError.message);
  });
  await clearReminder(reminder.rcSailingId);
  chrome.alarms.clear(ALARM_PREFIX + reminder.rcSailingId);
}

function formatShortDate(iso) {
  try {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return new Date(+y, +m - 1, +d).toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const rcSailingId = alarm.name.slice(ALARM_PREFIX.length);
  const reminders = await getAllReminders();
  const reminder = reminders.find((r) => r.rcSailingId === rcSailingId);
  if (reminder) await fireReminder(reminder);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith("crf-reminder-")) return;
  const rcSailingId = notificationId.slice("crf-reminder-".length);
  const url = chrome.runtime.getURL(`dashboard.html#sailing=${encodeURIComponent(rcSailingId)}`);
  chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "SYNC": {
        try {
          const { loyaltyId } = msg.payload || {};
          if (!loyaltyId) {
            sendResponse({ ok: false, error: "Couldn't identify your account — refresh the RC page and try again" });
            break;
          }
          const profile = await ensureProfile(loyaltyId);
          const result = await upsertOffers(msg.payload, profile.profileId);
          await chrome.storage.local.set({ lastSync: result.syncedAt });
          sendResponse({
            ok: true,
            body: {
              offers: result.offerCount,
              sailings: result.sailingCount,
              profile: { id: profile.profileId, name: profile.name, unnamed: !!profile.unnamed },
            },
          });
        } catch (e) {
          console.error("[CRF background] sync error:", e);
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "GET_ALL": {
        try {
          const data = await getAllData();
          sendResponse({ ok: true, data });
        } catch (e) {
          console.error("[CRF background] GET_ALL error:", e);
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "GET_LAST_SYNC": {
        const ts = await getLastSync();
        sendResponse({ ok: true, lastSync: ts });
        break;
      }

      case "FAV_TOGGLE": {
        try {
          const isFavorite = await toggleFavorite(msg.rcSailingId);
          sendResponse({ ok: true, isFavorite });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "REMINDER_SET": {
        try {
          const { rcSailingId, fireAt, offset, snapshot } = msg;
          const when = Date.parse(fireAt);
          if (!Number.isFinite(when) || when <= Date.now()) {
            sendResponse({ ok: false, error: "Reminder time must be in the future" });
            break;
          }
          await setReminder(rcSailingId, fireAt, offset, snapshot);
          chrome.alarms.create(ALARM_PREFIX + rcSailingId, { when });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "REMINDER_CLEAR": {
        try {
          await clearReminder(msg.rcSailingId);
          await chrome.alarms.clear(ALARM_PREFIX + msg.rcSailingId);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "LIST_PROFILES": {
        try {
          const profiles = await listProfiles();
          sendResponse({ ok: true, profiles });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "RENAME_PROFILE": {
        try {
          const profile = await renameProfile(msg.profileId, msg.name);
          sendResponse({ ok: true, profile });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "DELETE_PROFILE": {
        try {
          if (msg.profileId === "me") {
            sendResponse({ ok: false, error: "Cannot delete your primary profile" });
            break;
          }
          await deleteProfile(msg.profileId);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "EXPORT_PROFILE": {
        try {
          const data = await exportProfileJson(msg.profileId);
          sendResponse({ ok: true, data });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "IMPORT_PROFILE": {
        try {
          const result = await importProfileJson(msg.json);
          sendResponse({ ok: true, ...result });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "OFFER_TOGGLE_DISABLED": {
        try {
          const disabled = await toggleOfferDisabled(msg.profileId, msg.rcOfferId);
          sendResponse({ ok: true, disabled });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "RECORDED_CALL": {
        const { recording, recordedCalls = [] } = await chrome.storage.local.get(["recording", "recordedCalls"]);
        if (recording) {
          recordedCalls.push(msg.entry);
          await chrome.storage.local.set({ recordedCalls });
        }
        sendResponse({ ok: true });
        break;
      }

      case "TRIGGER_SYNC": {
        // Called from popup — injects a sync trigger into the active RC tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url?.includes("royalcaribbean.com/club-royale")) {
          sendResponse({ ok: false, error: "Not on a Club Royale page. Open royalcaribbean.com/club-royale/offers first." });
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SYNC" }).catch(() => {});
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
    }
  })();
  return true; // keep channel open for async response
});
