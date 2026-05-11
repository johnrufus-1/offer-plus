import {
  upsertOffers, getAllData, getLastSync,
  toggleFavorite,
  toggleBooking, updateBookingNotes,
  ensureProfile, listProfiles, renameProfile, deleteProfile,
  exportProfileJson, importProfileJson,
  toggleOfferDisabled, getAllBookings,
} from "./db.js";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ recording: false, recordedCalls: [], lastSync: null });
  // Clean up any leftover reminder-* alarms from the previous version. Wrapped
  // in try/catch because chrome.alarms is gone once the permission is dropped
  // from the manifest — this is best-effort.
  try {
    if (chrome.alarms) {
      const alarms = await chrome.alarms.getAll();
      for (const a of alarms) {
        if (a.name.startsWith("reminder-")) chrome.alarms.clear(a.name);
      }
    }
  } catch (_) {}
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

      case "GET_EXPORT_DATA": {
        try {
          const [allData, bookings] = await Promise.all([getAllData(), getAllBookings()]);
          sendResponse({ ok: true, data: { ...allData, bookings } });
        } catch (e) {
          console.error("[CRF background] GET_EXPORT_DATA error:", e);
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

      case "BOOKING_TOGGLE": {
        try {
          const booked = await toggleBooking(msg.rcSailingId);
          sendResponse({ ok: true, booked });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      case "BOOKING_UPDATE_NOTES": {
        try {
          await updateBookingNotes(msg.rcSailingId, msg.notes || "");
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
        try {
          // Find any RC offers tab across all windows (not just the active one).
          const allTabs = await chrome.tabs.query({});
          const rcTabs = allTabs.filter((t) => t.url?.includes("royalcaribbean.com/club-royale"));
          console.log("[CRF bg] TRIGGER_SYNC — found", rcTabs.length, "RC tab(s)");
          if (!rcTabs.length) {
            sendResponse({ ok: false, error: "Open royalcaribbean.com/club-royale/offers in a tab first" });
            break;
          }
          // Prefer the active RC tab if there is one
          const tab = rcTabs.find((t) => t.active) || rcTabs[0];
          console.log("[CRF bg] TRIGGER_SYNC — sending to tab", tab.id, tab.url);

          // Verify content.js is listening (it may be missing if the tab was
          // open before the extension was reloaded). Try to send the message;
          // if no listener, inject content scripts and retry.
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SYNC" });
          } catch (firstErr) {
            console.warn("[CRF bg] content.js not responding, injecting scripts:", firstErr.message);
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content.js"],
              });
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                files: ["recorder.js"],
              });
              // Retry after injection
              await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SYNC" });
            } catch (retryErr) {
              sendResponse({ ok: false, error: `RC tab needs a refresh — ${retryErr.message}` });
              break;
            }
          }
          sendResponse({ ok: true, tabId: tab.id });
        } catch (e) {
          console.error("[CRF bg] TRIGGER_SYNC failed:", e);
          sendResponse({ ok: false, error: String(e) });
        }
        break;
      }

      default:
        sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
    }
  })();
  return true; // keep channel open for async response
});
