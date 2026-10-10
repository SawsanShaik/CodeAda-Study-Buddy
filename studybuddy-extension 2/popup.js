const $ = id => document.getElementById(id);

async function showStatus() {
  const session = await chrome.runtime.sendMessage({ type: "get-state" });
  const status = $("status");
  status.textContent = "";
  if (session) {
    const mins = Math.max(1, Math.round((session.endsAt - Date.now()) / 60000));
    const title = document.createElement("b");
    title.textContent = `Focusing on ${session.task}`;
    status.append(title, `${mins} minute${mins === 1 ? "" : "s"} left. ${session.name} is watching out for distractions.`);
  } else {
    status.textContent = "No focus session running. Open StudyBuddy to start one.";
  }
}

async function showSites() {
  const { blocked = [] } = await chrome.storage.local.get("blocked");
  $("sites").value = blocked.join("\n");
}

$("open").addEventListener("click", () => chrome.runtime.sendMessage({ type: "go-to-app" }));

$("save").addEventListener("click", async () => {
  const blocked = $("sites").value
    .split("\n")
    .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  await chrome.storage.local.set({ blocked });
  $("saved").textContent = "Saved!";
});

async function showNotificationSetting() {
  const { systemNotifications = true } = await chrome.storage.local.get("systemNotifications");
  $("systemNotifications").checked = systemNotifications;
}
$("systemNotifications").addEventListener("change", e => chrome.storage.local.set({ systemNotifications: e.target.checked }));

$("testNote").addEventListener("click", () => {
  chrome.notifications.getPermissionLevel(level => {
    if (level !== "granted") {
      $("testResult").textContent = "Chrome is blocking notifications for this extension.";
      return;
    }
    chrome.notifications.create(`studybuddy-test-${Date.now()}`, {
      type: "basic", iconUrl: "icon128.png",
      title: "StudyBuddy test", message: "If you can see this, notifications work!", priority: 2,
    }, () => {
      $("testResult").textContent = chrome.runtime.lastError
        ? `Couldn't send: ${chrome.runtime.lastError.message}`
        : "Sent! If nothing appeared, your Mac is hiding Chrome's notifications (see System Settings → Notifications → Google Chrome, and turn off Focus).";
    });
  });
});

// ----- Breaks -----
// Setting breakEndsAt starts the break everywhere: the dog on every tab shows the
// countdown, and background.js tells the app to pause the timer and camera.

const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
let breakTick = null;

async function showBreak() {
  const session = await chrome.runtime.sendMessage({ type: "get-state" });
  const { breakEndsAt } = await chrome.storage.local.get("breakEndsAt");
  clearInterval(breakTick);
  $("breakPicker").hidden = !session || !!breakEndsAt;
  $("onBreak").hidden = !session || !breakEndsAt;
  if (session && breakEndsAt) {
    const update = () => { $("breakLeft").textContent = Date.now() < breakEndsAt ? clock(breakEndsAt - Date.now()) : "Time's up!"; };
    update();
    breakTick = setInterval(update, 1000);
  }
}

const syncChips = () => document.querySelectorAll("#breakChips .chip")
  .forEach(c => c.setAttribute("aria-pressed", String(Number(c.dataset.min) === Number($("breakMinutes").value))));
$("breakChips").addEventListener("click", e => {
  if (!e.target.dataset.min) return;
  $("breakMinutes").value = e.target.dataset.min;
  syncChips();
});
$("breakMinutes").addEventListener("input", syncChips);
syncChips();

$("startBreak").addEventListener("click", async () => {
  const minutes = Math.min(60, Math.max(1, Math.round(Number($("breakMinutes").value)) || 5));
  await chrome.storage.local.set({ breakEndsAt: Date.now() + minutes * 60000 });
  showBreak();
});
$("endBreak").addEventListener("click", async () => {
  await chrome.storage.local.set({ breakEndsAt: null });
  showBreak();
});

showStatus();
showBreak();
showSites();
showNotificationSetting();
