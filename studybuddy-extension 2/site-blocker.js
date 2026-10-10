// =========================================================
// Runs on every website. Blocks distracting sites while a
// focus session is running, with the pixel dog guarding the page.
// (Distraction alerts are handled by the dog itself: see dog.js.)
// The overlay lives in a "shadow root" so website styles can't break it.
// =========================================================
(() => {
  if (window.top !== window) return; // only in the main page, not inside iframes
  if (window.__studybuddyBlocker) return; // already running on this page
  window.__studybuddyBlocker = true;

  let host = null, root = null, snoozeTimer = null;

  const CSS = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
      background: rgba(24, 16, 10, .9); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .card { background: #fffaf2; color: #3b2a1e; border: 4px solid #5a3a22; border-radius: 10px; box-shadow: 6px 6px 0 rgba(0, 0, 0, .3);
      padding: 28px 40px 32px; max-width: 520px; width: 100%; text-align: center; box-sizing: border-box; animation: pop .3s ease-out; }
    @keyframes pop { from { transform: scale(.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .mascot { width: 200px; height: 130px; margin: 0 auto; font-size: 100px; line-height: 130px; animation: bob 2s ease-in-out infinite; }
    .mascot svg, .mascot img { width: 100%; height: 100%; display: block; }
    @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .label { margin: 12px 0 4px; font-weight: 700; font-size: 15px; color: #c94f3d; }
    h2 { margin: 0 0 20px; font-size: 26px; line-height: 1.25; }
    .buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    button { border: 2px solid #5a3a22; border-radius: 6px; padding: 10px 20px; font: 600 16px system-ui, sans-serif;
      background: #5a3a22; color: #fff; cursor: pointer; }
    button.quiet { background: #fff; color: #5a3a22; }
    button:focus-visible { outline: 3px solid #4fa3a5; outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  `;

  function show({ mascot, label, message, buttons }) {
    if (!host) {
      host = document.createElement("studybuddy-blocker");
      root = host.attachShadow({ mode: "closed" });
    }
    if (!host.isConnected) document.documentElement.appendChild(host);

    root.innerHTML = `<style>${CSS}</style>
      <div class="backdrop" role="alertdialog">
        <div class="card">
          <div class="mascot"></div>
          <p class="label"></p>
          <h2></h2>
          <div class="buttons"></div>
        </div>
      </div>`;
    const box = root.querySelector(".mascot");
    if (mascot) box.innerHTML = mascot; else box.textContent = "🐶";
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
    host?.remove();
  }

  const goToApp = () => { hide(); chrome.runtime.sendMessage({ type: "go-to-app" }); };

  // ----- Messages from the extension -----
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "hide") { hide(); clearTimeout(snoozeTimer); }
  });

  // ----- Block distracting sites during a session -----

  async function checkSite() {
    const session = await chrome.runtime.sendMessage({ type: "get-state" });
    if (!session) return;
    const { blocked = [] } = await chrome.storage.local.get("blocked");
    const here = location.hostname.replace(/^www\./, "");
    const match = blocked.find(site => here === site || here.endsWith("." + site));
    if (!match) return;

    const minsLeft = Math.max(1, Math.round((session.endsAt - Date.now()) / 60000));
    show({
      mascot: session.mascotAlert,
      label: `${match} is on your distraction list`,
      message: `You're focusing on ${session.task}. ${minsLeft} minute${minsLeft === 1 ? "" : "s"} to go, and this can wait!`,
      buttons: [
        { text: "Back to studying", onClick: goToApp },
        { text: "Give me 2 minutes", quiet: true, onClick: () => { hide(); snoozeTimer = setTimeout(checkSite, 2 * 60 * 1000); } },
      ],
    });
  }

  checkSite().catch(() => {});
})();
