// =========================================================
// Runs on every website. Shows the full-screen mascot alarm
// when the app says you're distracted, and blocks distracting
// sites while a focus session is running.
// The overlay lives in a "shadow root" so website styles can't break it.
// =========================================================
(() => {
  if (window.top !== window) return; // only in the main page, not inside iframes
  if (window.__studybuddyOverlay) return; // already running on this page
  window.__studybuddyOverlay = true;

  let host = null, root = null, hideTimer = null, snoozeTimer = null;
  let blockedHere = false;

  const CSS = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
      background: rgba(255, 77, 109, .9); font-family: "DM Sans", system-ui, sans-serif; animation: flash 1.2s ease-in-out infinite; }
    .backdrop.happy { background: rgba(34, 168, 106, .92); animation: none; }
    .backdrop.block { background: rgba(35, 22, 74, .94); animation: none; }
    @keyframes flash { 0%, 100% { background: rgba(255, 77, 109, .9); } 50% { background: rgba(214, 40, 80, .94); } }
    .card { background: #fff; color: #23164a; border-radius: 36px; padding: 32px 40px 36px; max-width: 520px; width: 100%;
      text-align: center; box-sizing: border-box; animation: pop .35s cubic-bezier(.2, 1.5, .4, 1); }
    @keyframes pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .mascot { width: 200px; height: 200px; margin: 0 auto; animation: shake .45s ease-in-out infinite; font-size: 140px; line-height: 200px; }
    .happy .mascot, .block .mascot { animation: bob 2s ease-in-out infinite; }
    .mascot svg, .mascot img { width: 100%; height: 100%; display: block; }
    @keyframes shake { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-7deg) scale(1.04); } 75% { transform: rotate(7deg) scale(1.04); } }
    @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .label { margin: 8px 0 4px; font-weight: 700; font-size: 16px; color: #ff4d6d; }
    .happy .label { color: #22a86a; }
    .block .label { color: #6c4cf1; }
    h2 { margin: 0 0 20px; font: 600 30px/1.2 "Fredoka", "Trebuchet MS", sans-serif; }
    .buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    button { border: none; border-radius: 999px; padding: 14px 26px; font: 600 18px "Fredoka", "Trebuchet MS", sans-serif;
      background: #6c4cf1; color: #fff; cursor: pointer; }
    button.quiet { background: #e9e3ff; color: #23164a; }
    button:focus-visible { outline: 3px solid #23164a; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  function show({ mood, mascot, label, message, buttons }) {
    clearTimeout(hideTimer);
    if (!host) {
      host = document.createElement("studybuddy-overlay");
      root = host.attachShadow({ mode: "closed" });
    }
    if (!host.isConnected) document.documentElement.appendChild(host);

    root.innerHTML = `<style>${CSS}</style>
      <div class="backdrop ${mood}" role="alertdialog">
        <div class="card">
          <div class="mascot"></div>
          <p class="label"></p>
          <h2></h2>
          <div class="buttons"></div>
        </div>
      </div>`;
    const box = root.querySelector(".mascot");
    if (mascot) box.innerHTML = mascot; else box.textContent = "🦉";
    root.querySelector(".label").textContent = label;
    root.querySelector(".backdrop").setAttribute("aria-label", label);
    root.querySelector("h2").textContent = message;
    const row = root.querySelector(".buttons");
    for (const b of buttons) {
      const el = document.createElement("button");
      el.textContent = b.text;
      if (b.quiet) el.className = "quiet";
      el.addEventListener("click", b.onClick);
      row.appendChild(el);
    }
    row.querySelector("button")?.focus();
  }

  function hide() {
    clearTimeout(hideTimer);
    host?.remove();
  }

  const goToApp = () => { hide(); chrome.runtime.sendMessage({ type: "go-to-app" }); };

  // ----- Messages from the extension -----
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "alarm") {
      show({
        mood: "alert",
        mascot: msg.mascot,
        label: msg.label,
        message: msg.message,
        buttons: [{ text: "I'm back on it", onClick: hide }, { text: "Open StudyBuddy", quiet: true, onClick: goToApp }],
      });
    }
    if (msg.type === "focused" && host?.isConnected && !blockedHere) {
      chrome.runtime.sendMessage({ type: "get-state" }).then(session => {
        show({ mood: "happy", mascot: session?.mascotHappy, label: "Focused again", message: msg.message, buttons: [] });
        hideTimer = setTimeout(hide, 1600);
      });
    }
    if (msg.type === "hide") { hide(); blockedHere = false; clearTimeout(snoozeTimer); }
  });

  // ----- Block distracting sites during a session -----

  async function checkSite() {
    const session = await chrome.runtime.sendMessage({ type: "get-state" });
    if (!session) return;
    const { blocked = [] } = await chrome.storage.local.get("blocked");
    const here = location.hostname.replace(/^www\./, "");
    const match = blocked.find(site => here === site || here.endsWith("." + site));
    if (!match) return;

    blockedHere = true;
    const minsLeft = Math.max(1, Math.round((session.endsAt - Date.now()) / 60000));
    show({
      mood: "block",
      mascot: session.mascotAlert,
      label: `${match} is on your distraction list`,
      message: `You're focusing on ${session.task}. ${minsLeft} minute${minsLeft === 1 ? "" : "s"} to go, and this can wait!`,
      buttons: [
        { text: "Back to studying", onClick: () => { blockedHere = false; goToApp(); } },
        { text: "Give me 2 minutes", quiet: true, onClick: () => { hide(); snoozeTimer = setTimeout(checkSite, 2 * 60 * 1000); } },
      ],
    });
  }

  checkSite().catch(() => {});
})();
