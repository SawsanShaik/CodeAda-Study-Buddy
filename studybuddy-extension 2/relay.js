// Runs on the StudyBuddy web app (localhost).
// Passes messages from the app (which runs the camera) to the extension.

// Let the app know the extension is installed
document.documentElement.dataset.studybuddyExtension = "installed";

window.addEventListener("message", event => {
  if (event.source !== window || event.data?.source !== "studybuddy-app") return;
  chrome.runtime.sendMessage(event.data).catch(() => { /* extension reloaded; ignore */ });
});
