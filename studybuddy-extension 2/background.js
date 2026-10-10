// =========================================================
// StudyBuddy extension background script (the "brain").
// Receives messages from the web app and prompts the pixel
// dog on whatever tab you're on (see dog.js), or sends a
// system notification when you're in another app.
// =========================================================

const isApp = url => !!url && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

const DEFAULT_BLOCKED = ["youtube.com", "instagram.com", "tiktok.com", "x.com", "twitter.com", "reddit.com", "netflix.com", "facebook.com"];

chrome.runtime.onInstalled.addListener(async () => {
  const { blocked } = await chrome.storage.local.get("blocked");
  if (!blocked) await chrome.storage.local.set({ blocked: DEFAULT_BLOCKED });
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
      await chrome.action.setBadgeText({ text: "" });
      await sendToAllTabs({ type: "hide" });
    }
    if (msg.type === "distracted") await alertUser(msg);
    if (msg.type === "focused") await sendToAllTabs({ type: "focused", message: msg.message });
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

async function getSession() {
  const { session } = await chrome.storage.session.get("session");
  if (session && Date.now() > session.endsAt) {
    await chrome.storage.session.remove("session");
    await setDogActive(false);
    await chrome.action.setBadgeText({ text: "" });
    return null;
  }
  return session || null;
}

let lastNoteId = null;

async function alertUser(msg) {
  const session = await getSession();
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const win = tab ? await chrome.windows.get(tab.windowId).catch(() => null) : null;
  const chromeInFront = !!win?.focused;

  // Looking at the StudyBuddy tab: the app shows its own full-screen alarm
  if (chromeInFront && isApp(tab.url)) return;

  // On another website: the dog wakes up in the corner of that page and says something
  let shown = false;
  if (chromeInFront) {
    shown = await showOverlay(tab.id, {
      type: "SHOW_CHARACTER",
      state: "nudge",
      heading: msg.label,
      text: msg.message,
      buttons: [
        { label: "I'm back on it", action: "dismiss" },
        { label: `Open ${session?.name ?? "StudyBuddy"}`, action: "go_to_app" },
      ],
    });
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
