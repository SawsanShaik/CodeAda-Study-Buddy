// Runs on the StudyBuddy web app (localhost).
// Passes messages from the app (which runs the camera) to the extension,
// and from the extension back to the app (e.g. a break started on another tab).

// Let the app know the extension is installed
document.documentElement.dataset.studybuddyExtension = "installed";

window.addEventListener("message", event => {
  if (event.source !== window || event.data?.source !== "studybuddy-app") return;
  chrome.runtime.sendMessage(event.data).catch(() => { /* extension reloaded; ignore */ });
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg?.source === "studybuddy-extension") window.postMessage(msg, location.origin);
});
