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

showStatus();
showSites();
showNotificationSetting();
