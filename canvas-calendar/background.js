import { parseIcs } from "./ics.js";

const REFRESH_MINUTES = 30;

async function refresh() {
  const { feedUrl } = await chrome.storage.local.get("feedUrl");
  if (!feedUrl) return { ok: false, error: "No feed URL set." };
  try {
    const res = await fetch(feedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Canvas returned ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That URL didn't return a calendar feed.");
    const events = parseIcs(text);
    await chrome.storage.local.set({ events, lastUpdated: Date.now(), lastError: null });
    await updateBadge(events);
    return { ok: true, count: events.length };
  } catch (err) {
    await chrome.storage.local.set({ lastError: err.message });
    return { ok: false, error: err.message };
  }
}

// Badge shows how many things are due in the next 24 hours.
async function updateBadge(events) {
  const now = Date.now();
  const soon = events.filter((e) => {
    const t = new Date(e.start).getTime();
    return t >= now && t - now <= 24 * 60 * 60 * 1000;
  }).length;
  await chrome.action.setBadgeText({ text: soon ? String(soon) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#E84A27" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refresh", { periodInMinutes: REFRESH_MINUTES });
  refresh();
});

chrome.runtime.onStartup.addListener(refresh);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh") refresh();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "refresh") {
    refresh().then(sendResponse);
    return true; // keep the channel open for the async response
  }
});
