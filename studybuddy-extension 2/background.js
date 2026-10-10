// =========================================================
// StudyBuddy extension background script (the "brain").
// Receives messages from the web app and prompts the pixel
// dog on whatever tab you're on (see dog.js), or sends a
// system notification when you're in another app.
// =========================================================
import { parseIcs } from "./ics.js";

const isApp = url => !!url && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

const DEFAULT_BLOCKED = ["youtube.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "reddit.com", "netflix.com", "facebook.com"];

chrome.runtime.onInstalled.addListener(async () => {
  const { blocked } = await chrome.storage.local.get("blocked");
  if (!blocked) await chrome.storage.local.set({ blocked: DEFAULT_BLOCKED });
  chrome.alarms.create("canvas-refresh", { periodInMinutes: CANVAS_REFRESH_MINUTES });
  refreshCanvas();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, () => sendResponse(null));
  return true; // we answer asynchronously
});

async function handle(msg, sender) {
  // ----- From the web app (through relay.js) -----
  if (msg.source === "studybuddy-app") {
    if (msg.type === "session-start") {
      const { source, type, ...session } = msg;
      session.appTabId = sender.tab?.id;
      await chrome.storage.session.set({ session });
      await setDogActive(true);  // the dog comes in and naps in the corner of every tab
      await chrome.action.setBadgeBackgroundColor({ color: "#8a5a35" });
      await chrome.action.setBadgeText({ text: "ON" });
    }
    if (msg.type === "session-end") {
      await chrome.storage.session.remove("session");
      await setDogActive(false);
      await showDueBadge();
      await sendToAllTabs({ type: "hide" });
    }
    if (msg.type === "distracted") {
      await alertUser(msg, {
        state: "nudge",
        fullscreen: true,  // takes over the whole page, like the app's own alarm
        buttons: [
          { label: "I'm back on it", action: "dismiss" },
          { label: `Open ${msg.name ?? "StudyBuddy"}`, action: "go_to_app" },
        ],
      });
    }
    if (msg.type === "suggest-break") {
      await alertUser(msg, {
        state: "breakSuggestion",
        buttons: [
          { label: "Take a break", action: "take_break" },
          { label: "I'm good", action: "dismiss" },
        ],
      });
    }
    // Session finished: the dog celebrates (with a ding) on whatever tab you're on
    if (msg.type === "session-done") {
      await alertUser(msg, {
        state: "celebrate",
        fullscreen: true,
        buttons: [
          { label: "See how I did", action: "go_to_app" },
          { label: "Yay!", action: "dismiss" },
        ],
      });
    }
    if (msg.type === "focused") await sendToAllTabs({ type: "focused", message: msg.message });
    // The app started or ended a break itself; the dog on every tab follows along.
    if (msg.type === "break-start") await chrome.storage.local.set({ breakEndsAt: msg.endsAt });
    if (msg.type === "break-end") await chrome.storage.local.set({ breakEndsAt: null });
    // Canvas calendar: the Schedule screen sets the feed link and asks for due dates.
    if (msg.type === "canvas-set-feed") {
      await chrome.storage.local.set({ feedUrl: msg.url });
      await refreshCanvas();
    }
    if (msg.type === "canvas-refresh") await refreshCanvas();
    if (msg.type === "canvas-get") await sendCanvas(sender.tab?.id);
    return null;
  }

  // ----- From the dog, the site blocker, or the popup -----
  if (msg.type === "get-state") return getSession();
  if (msg.type === "go-to-app") return goToApp();
  if (msg.type === "CHARACTER_RESPONSE" && msg.action === "go_to_app") return goToApp();
  return null;
}

// The dog (dog.js) watches these keys on every tab.
function setDogActive(active) {
  return chrome.storage.local.set({ sessionActive: active, breakEndsAt: null });
}

// Breaks can start from the dog on any tab (it writes breakEndsAt). Tell the app so it
// pauses the timer and camera, and resumes when the break ends.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !("breakEndsAt" in changes)) return;
  const endsAt = changes.breakEndsAt.newValue;
  const { session } = await chrome.storage.session.get("session");
  if (!session) return;
  // While paused the session can't expire, and afterwards it ends that much later.
  // (The app also sends its exact new end time when it resumes.)
  const next = endsAt
    ? { ...session, paused: true, pausedAt: session.paused ? session.pausedAt : Date.now() }
    : { ...session, paused: false, endsAt: session.paused ? session.endsAt + (Date.now() - session.pausedAt) : session.endsAt };
  await chrome.storage.session.set({ session: next });
  await sendToApp(session, endsAt ? { type: "break-start", endsAt } : { type: "break-end" });
});

function sendToApp(session, message) {
  if (!session.appTabId) return;
  return chrome.tabs.sendMessage(session.appTabId, { source: "studybuddy-extension", ...message }).catch(() => {});
}

async function getSession() {
  const { session } = await chrome.storage.session.get("session");
  if (session && !session.paused && Date.now() > session.endsAt) {
    await chrome.storage.session.remove("session");
    await setDogActive(false);
    await showDueBadge();
    return null;
  }
  return session || null;
}

let lastNoteId = null;

// Get the user's attention: the dog says `msg.message` on the tab they're on
// (prompt sets the dog's state and buttons), plus a system notification.
async function alertUser(msg, prompt) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const win = tab ? await chrome.windows.get(tab.windowId).catch(() => null) : null;
  const chromeInFront = !!win?.focused;

  // Looking at the StudyBuddy tab: the app shows the alert itself
  if (chromeInFront && isApp(tab.url)) return;

  // On another website: the dog wakes up in the corner of that page and says something
  let shown = false;
  if (chromeInFront) {
    shown = await showOverlay(tab.id, { type: "SHOW_CHARACTER", heading: msg.label, text: msg.message, ...prompt });
  }

  // Also send a Mac notification (always when Chrome isn't in front,
  // or every time if "Mac notifications too" is on in the popup)
  const { systemNotifications = true } = await chrome.storage.local.get("systemNotifications");
  if (!shown || systemNotifications) {
    if (lastNoteId) await chrome.notifications.clear(lastNoteId);
    lastNoteId = `studybuddy-alert-${Date.now()}`;  // a fresh ID so macOS shows it again
    chrome.notifications.create(lastNoteId, {
      type: "basic",
      iconUrl: "icon128.png",
      title: `${msg.name}: ${msg.label}`,
      message: msg.message,
      priority: 2,
    });
  }
}

// Send a prompt to the dog on a tab. If the tab was open before the extension
// was installed, add the dog to it first.
async function showOverlay(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch { /* the dog isn't on this page yet */ }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["dog.js", "site-blocker.js"] });
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false; // pages like chrome:// can't show overlays
  }
}

async function sendToAllTabs(message) {
  if (lastNoteId) chrome.notifications.clear(lastNoteId);
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(t => chrome.tabs.sendMessage(t.id, message).catch(() => {})));
}

async function goToApp() {
  const session = await getSession();
  if (session?.appTabId) {
    try {
      const tab = await chrome.tabs.update(session.appTabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return true;
    } catch { /* app tab was closed */ }
  }
  await chrome.tabs.create({ url: "http://localhost:8000/" });
  return true;
}

chrome.notifications.onClicked.addListener(() => goToApp());

// =========================================================
// Canvas calendar: downloads your Canvas feed (.ics) every
// 30 minutes. The extension can fetch it without CORS errors,
// which the web app can't, so the app asks us for the events.
// =========================================================
const CANVAS_REFRESH_MINUTES = 30;

chrome.runtime.onStartup.addListener(refreshCanvas);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "canvas-refresh") refreshCanvas(); });

async function refreshCanvas() {
  const { feedUrl } = await chrome.storage.local.get("feedUrl");
  if (!feedUrl) {
    await chrome.storage.local.set({ canvasError: null });
  } else {
    try {
      const res = await fetch(feedUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Canvas returned ${res.status}`);
      const text = await res.text();
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return a calendar feed.");
      await chrome.storage.local.set({ events: parseIcs(text), lastUpdated: Date.now(), canvasError: null });
    } catch (err) {
      await chrome.storage.local.set({ canvasError: err.message });
    }
  }
  await showDueBadge();
  // Send the new events to every open StudyBuddy tab
  const tabs = await chrome.tabs.query({ url: ["http://localhost/*", "http://127.0.0.1/*"] });
  await Promise.all(tabs.map(t => sendCanvas(t.id)));
}

async function sendCanvas(tabId) {
  if (!tabId) return;
  const { feedUrl = "", events = [], lastUpdated = null, canvasError = null } =
    await chrome.storage.local.get(["feedUrl", "events", "lastUpdated", "canvasError"]);
  await chrome.tabs.sendMessage(tabId, { source: "studybuddy-extension", type: "canvas-data", feedUrl, events, lastUpdated, error: canvasError })
    .catch(() => {});
}

// The dog icon's badge shows how many things are due in the next 24 hours.
// During a focus session it says "ON" instead.
async function showDueBadge() {
  const { session } = await chrome.storage.session.get("session");
  if (session) return;
  const { events = [] } = await chrome.storage.local.get("events");
  const now = Date.now();
  const soon = events.filter(e => {
    const t = new Date(e.start).getTime();
    return t >= now && t - now <= 24 * 60 * 60 * 1000;
  }).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#c94f3d" });
  await chrome.action.setBadgeText({ text: soon ? String(soon) : "" });
}
