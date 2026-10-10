// =========================================================
// StudyBuddy app: screens, to-do list, schedule, sessions,
// the full-screen mascot alarm, and the mascot studio.
// =========================================================
import { Detector } from "./detector.js";
import {
  loadMascot, saveMascot, defaultMascot, renderMascot, pickMessage, mascotMarkup,
  PROBLEM_LABELS, MESSAGE_LABELS, DEFAULT_MESSAGES,
} from "./mascots.js";

// ---------- Talking to the StudyBuddy Chrome extension ----------
// The extension's relay script marks the page when it's installed.
const extensionInstalled = () => document.documentElement.dataset.studybuddyExtension === "installed";
function tellExtension(type, data = {}) {
  window.postMessage({ source: "studybuddy-app", type, ...data }, location.origin);
}
// Without the extension, fall back to a system notification when this tab is hidden
function notifyIfHidden(title, body) {
  if (!document.hidden || extensionInstalled()) return;
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body, tag: "studybuddy", renotify: true });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

// ---------- Small helpers ----------
const $ = id => document.getElementById(id);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const clock = secs => `${Math.floor(secs / 60)}:${pad(secs % 60)}`;
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysFromToday = s => Math.round((parseDay(s) - parseDay(todayStr())) / 864e5);
const niceTime = t => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const dayName = s => {
  const n = daysFromToday(s);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return parseDay(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

// ---------- Saved data ----------
let todos = store.get("studybuddy-todos", []);          // { id, text, due, done }
let blocks = store.get("studybuddy-blocks", []);        // { id, task, date, time, minutes }
let history = store.get("studybuddy-history", []);      // { date, task, seconds, focusPct, distractions, phone }
let mascot = loadMascot();
const saveTodos = () => store.set("studybuddy-todos", todos);
const saveBlocks = () => store.set("studybuddy-blocks", blocks);
const saveHistory = () => store.set("studybuddy-history", history);

// =========================================================
// Navigation between screens
// =========================================================
let currentScreen = "home";

function go(name, options = {}) {
  if (currentScreen === "session" && session && name !== "summary") {
    if (!confirm("End your focus session?")) return;
    endSession(false);
    return;
  }
  currentScreen = name;
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === `screen-${name}`));
  document.querySelectorAll(".topbar nav button").forEach(b => b.classList.toggle("current", b.dataset.go === name));
  const renderers = { home: renderHome, todo: renderTodos, schedule: renderSchedule, setup: () => renderSetup(options), summary: renderHistory, studio: renderStudio };
  renderers[name]?.();
  window.scrollTo(0, 0);
}

document.addEventListener("click", e => {
  const target = e.target.closest("[data-go]");
  if (target) go(target.dataset.go);
});

// =========================================================
// Home
// =========================================================
function renderHome() {
  renderMascot($("homeMascot"), mascot, "calm");
  $("homeHello").textContent = `Hi! I'm ${mascot.name}.`;

  const open = todos.filter(t => !t.done);
  const dueToday = open.filter(t => t.due && daysFromToday(t.due) <= 0).length;
  $("homeTodoInfo").textContent = open.length
    ? `${open.length} task${open.length > 1 ? "s" : ""} left${dueToday ? `, ${dueToday} due today` : ""}.`
    : "Add what you need to get done.";

  const next = upcomingBlocks()[0];
  $("homeScheduleInfo").textContent = next
    ? `Next: ${next.task}, ${dayName(next.date).toLowerCase()} at ${niceTime(next.time)}.`
    : "Plan when you'll study.";

  const today = history.filter(h => h.date === todayStr());
  const mins = Math.round(today.reduce((sum, h) => sum + h.seconds, 0) / 60);
  $("homeToday").textContent = today.length
    ? `You've studied ${mins} minute${mins === 1 ? "" : "s"} today across ${today.length} session${today.length > 1 ? "s" : ""}.`
    : "";
}

// =========================================================
// To-do list
// =========================================================
$("todoForm").addEventListener("submit", e => {
  e.preventDefault();
  const text = $("todoText").value.trim();
  if (!text) return;
  todos.push({ id: uid(), text, due: $("todoDue").value || null, done: false });
  saveTodos();
  $("todoText").value = ""; $("todoDue").value = "";
  renderTodos();
});

function dueLabel(due) {
  if (!due) return { text: "", urgent: false };
  const n = daysFromToday(due);
  if (n < 0) return { text: "Overdue", urgent: true };
  if (n === 0) return { text: "Due today", urgent: true };
  if (n === 1) return { text: "Due tomorrow", urgent: true };
  if (n < 7) return { text: `Due in ${n} days`, urgent: false };
  return { text: `Due ${dayName(due)}`, urgent: false };
}

function renderTodos() {
  const sorted = [...todos].sort((a, b) => (a.done - b.done) || ((a.due || "9999") > (b.due || "9999") ? 1 : -1));
  $("todoList").innerHTML = sorted.map(t => {
    const due = dueLabel(t.due);
    return `<li class="item ${t.done ? "done" : ""}">
      <input type="checkbox" data-toggle="${t.id}" ${t.done ? "checked" : ""} aria-label="Mark done" />
      <div class="item-main">
        <div class="item-title">${esc(t.text)}</div>
        ${due.text ? `<div class="item-meta ${due.urgent && !t.done ? "urgent" : ""}">${due.text}</div>` : ""}
      </div>
      ${t.done ? "" : `<button class="btn" data-focus="${t.id}">Focus on this</button>`}
      <button class="icon-btn" data-delete="${t.id}" aria-label="Delete task">×</button>
    </li>`;
  }).join("");
  $("todoEmpty").hidden = todos.length > 0;
}

$("todoList").addEventListener("click", e => {
  const { toggle, focus, delete: del } = e.target.dataset;
  if (toggle) { const t = todos.find(x => x.id === toggle); t.done = !t.done; saveTodos(); renderTodos(); }
  if (focus) { const t = todos.find(x => x.id === focus); go("setup", { task: t.text, todoId: t.id }); }
  if (del) { todos = todos.filter(x => x.id !== del); saveTodos(); renderTodos(); }
});

// =========================================================
// Schedule
// =========================================================
$("blockDate").value = todayStr();

$("blockForm").addEventListener("submit", e => {
  e.preventDefault();
  blocks.push({
    id: uid(),
    task: $("blockTask").value.trim(),
    date: $("blockDate").value,
    time: $("blockTime").value,
    minutes: Math.min(240, Math.max(5, Number($("blockMinutes").value) || 45)),
  });
  saveBlocks();
  $("blockTask").value = "";
  renderSchedule();
});

function upcomingBlocks() {
  return blocks
    .filter(b => daysFromToday(b.date) >= 0)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function renderSchedule() {
  $("todoOptions").innerHTML = todos.filter(t => !t.done).map(t => `<option value="${esc(t.text)}"></option>`).join("");
  const list = upcomingBlocks();
  $("blockList").innerHTML = list.map(b => `<li class="item">
      <div class="when">${dayName(b.date)}<br />${niceTime(b.time)}</div>
      <div class="item-main">
        <div class="item-title">${esc(b.task)}</div>
        <div class="item-meta">${b.minutes} minutes</div>
      </div>
      ${daysFromToday(b.date) === 0 ? `<button class="btn" data-start="${b.id}">Start now</button>` : ""}
      <button class="icon-btn" data-delete="${b.id}" aria-label="Delete">×</button>
    </li>`).join("");
  $("blockEmpty").hidden = list.length > 0;
}

$("blockList").addEventListener("click", e => {
  const { start, delete: del } = e.target.dataset;
  if (start) {
    const b = blocks.find(x => x.id === start);
    const todo = todos.find(t => !t.done && t.text === b.task);
    go("setup", { task: b.task, minutes: b.minutes, todoId: todo?.id });
  }
  if (del) { blocks = blocks.filter(x => x.id !== del); saveBlocks(); renderSchedule(); }
});

// =========================================================
// Session setup
// =========================================================
let setupTodoId = null;

function renderSetup({ task = "", minutes, todoId = null } = {}) {
  $("setupTask").value = task;
  setupTodoId = todoId;
  if (minutes) $("setupMinutes").value = minutes;
  highlightDuration();
  $("extStatus").textContent = extensionInstalled()
    ? "✅ StudyBuddy extension connected: I'll find you on any tab, and distracting sites are blocked during sessions."
    : "Tip: install the StudyBuddy Chrome extension so I can alert you on other tabs too.";

  const open = todos.filter(t => !t.done).slice(0, 6);
  $("setupTodoChips").innerHTML = open.map(t =>
    `<button type="button" class="chip ${t.id === todoId ? "selected" : ""}" data-pick="${t.id}">${esc(t.text)}</button>`
  ).join("");
}

$("setupTodoChips").addEventListener("click", e => {
  const id = e.target.dataset.pick;
  if (!id) return;
  const t = todos.find(x => x.id === id);
  $("setupTask").value = t.text;
  setupTodoId = id;
  [...$("setupTodoChips").children].forEach(c => c.classList.toggle("selected", c.dataset.pick === id));
});

$("setupTask").addEventListener("input", () => {
  const t = todos.find(x => x.id === setupTodoId);
  if (!t || t.text !== $("setupTask").value) {
    setupTodoId = null;
    [...$("setupTodoChips").children].forEach(c => c.classList.remove("selected"));
  }
});

$("durationChips").addEventListener("click", e => {
  if (!e.target.dataset.min) return;
  $("setupMinutes").value = e.target.dataset.min;
  highlightDuration();
});
$("setupMinutes").addEventListener("input", highlightDuration);

function highlightDuration() {
  const v = $("setupMinutes").value;
  [...$("durationChips").children].forEach(c => c.classList.toggle("selected", c.dataset.min === v));
}

$("startSessionBtn").addEventListener("click", startSession);

// =========================================================
// Focus session
// =========================================================
const RING = 628.32;  // circumference of the timer ring (2 × π × 100)
let session = null;
let detector = null;

async function startSession() {
  const minutes = Math.min(240, Math.max(1, Number($("setupMinutes").value) || 25));
  session = {
    task: $("setupTask").value.trim(),
    todoId: setupTodoId,
    plannedSecs: minutes * 60,
    started: Date.now(),
    focused: 0, distracted: 0, distractions: 0, phone: 0,
    current: null, calibrated: false, snoozeUntil: 0, lastPing: 0,
    sound: $("setupSound").checked,
  };

  go("session");
  $("sessionTask").textContent = session.task || "Focus time";
  renderMascot($("sessionMascot"), mascot, "calm");
  updateSessionView();
  setStatus("Starting your camera…");
  setPill("Camera starting", "");

  detector ??= new Detector($("video"), $("overlay"), onDetect);
  window.detector = detector;  // handy for tuning in Chrome's console
  detector.setWritingMode($("setupWriting").checked);

  session.tick = setInterval(tick, 1000);
  tellExtension("session-start", {
    endsAt: session.started + session.plannedSecs * 1000,
    task: session.task || "Focus time",
    name: mascot.name,
    mascotAlert: mascotMarkup(mascot, "alert"),
    mascotHappy: mascotMarkup(mascot, "happy"),
  });
  if (!extensionInstalled() && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  try {
    setStatus("Loading the focus detector. This takes a few seconds the first time…");
    await detector.start();
    if (session) setStatus("Look at your screen normally for 2 seconds so I can learn how you sit.");
  } catch (err) {
    console.error(err);
    const blocked = err.name === "NotAllowedError" || err.name === "NotFoundError";
    setStatus(blocked
      ? "The camera is blocked, so distraction detection is off. The timer still works. Allow Chrome to use your camera, then start a new session."
      : `Distraction detection couldn't start: ${err.message}. The timer still works.`);
    setPill("Camera off", "bad");
  }
}

function onDetect({ calibrating, problem }) {
  if (!session) return;
  if (calibrating) { setPill("Learning your position", ""); return; }
  if (!session.calibrated) {
    session.calibrated = true;
    setStatus(`You're all set. ${mascot.name} is watching out for distractions.`);
  }

  setPill(problem ? PROBLEM_LABELS[problem] : "Focused", problem ? "bad" : "ok");
  $("ringFill").classList.toggle("distracted", !!problem);

  if (problem !== session.current) {
    if (problem) {
      if (!session.current) session.distractions++;
      if (problem === "phone") session.phone++;
      session.snoozeUntil = 0;
      showAlarm(problem);
      alertElsewhere(problem);
    } else {
      showWelcomeBack();
      tellExtension("focused", { message: pickMessage(mascot, "back") });
    }
    session.current = problem;
  } else if (problem && $("alarm").hidden && Date.now() > session.snoozeUntil) {
    showAlarm(problem);  // still distracted after pressing "I'm back on it"
  } else if (problem && Date.now() - session.lastPing > 10000) {
    alertElsewhere(problem);  // remind again every 10 seconds on other tabs
  }
}

// Alert the user on whatever tab or app they're in
function alertElsewhere(problem) {
  session.lastPing = Date.now();
  const message = $("alarmMsg").textContent || pickMessage(mascot, problem);
  tellExtension("distracted", { problem, label: PROBLEM_LABELS[problem], message, name: mascot.name });
  notifyIfHidden(`${mascot.name}: ${PROBLEM_LABELS[problem]}`, message);
}

function tick() {
  if (!session) return;
  if (session.calibrated) session.current ? session.distracted++ : session.focused++;
  updateSessionView();
  if (elapsed() >= session.plannedSecs) endSession(true);
}

const elapsed = () => Math.floor((Date.now() - session.started) / 1000);

function updateSessionView() {
  const left = Math.max(0, session.plannedSecs - elapsed());
  $("timeLeft").textContent = clock(left);
  $("ringFill").style.strokeDashoffset = RING * (1 - left / session.plannedSecs);
  const total = session.focused + session.distracted;
  $("liveFocus").textContent = total ? `${Math.round(100 * session.focused / total)}%` : "–";
  $("liveDistractions").textContent = session.distractions;
  $("livePhone").textContent = session.phone;
}

$("recalibrateBtn").addEventListener("click", () => {
  if (!detector || !session) return;
  detector.recalibrate();
  session.calibrated = false;
  setStatus("Look at your screen normally for 2 seconds…");
});

$("endSessionBtn").addEventListener("click", () => endSession(false));

function endSession(finished) {
  if (!session) return;
  clearInterval(session.tick);
  detector?.stop();
  hideAlarm();
  tellExtension("session-end");

  const s = session;
  session = null;
  const total = s.focused + s.distracted;
  const result = {
    date: todayStr(),
    task: s.task || "Focus time",
    seconds: Math.min(Math.floor((Date.now() - s.started) / 1000), s.plannedSecs),
    focusPct: total ? Math.round(100 * s.focused / total) : 100,
    distractions: s.distractions,
    phone: s.phone,
  };
  history.unshift(result);
  history = history.slice(0, 50);
  saveHistory();

  showSummary(result, s, finished);
}

// =========================================================
// Full-screen mascot alarm
// =========================================================
let chimeTimer = null;
let hideTimer = null;

function showAlarm(problem) {
  clearTimeout(hideTimer);
  const alarm = $("alarm");
  alarm.hidden = false;
  alarm.classList.remove("happy");
  renderMascot($("alarmMascot"), mascot, "alert");
  $("alarmLabel").textContent = PROBLEM_LABELS[problem];
  $("alarmMsg").textContent = pickMessage(mascot, problem);
  $("alarmOk").hidden = false;
  renderMascot($("sessionMascot"), mascot, "alert");
  clearInterval(chimeTimer);
  if (session?.sound) { chime(); chimeTimer = setInterval(chime, 4000); }
}

function showWelcomeBack() {
  clearInterval(chimeTimer);
  renderMascot($("sessionMascot"), mascot, "calm");
  const alarm = $("alarm");
  if (alarm.hidden) return;
  alarm.classList.add("happy");
  renderMascot($("alarmMascot"), mascot, "happy");
  $("alarmLabel").textContent = "Focused again";
  $("alarmMsg").textContent = pickMessage(mascot, "back");
  $("alarmOk").hidden = true;
  hideTimer = setTimeout(hideAlarm, 1600);
}

function hideAlarm() {
  clearInterval(chimeTimer);
  clearTimeout(hideTimer);
  $("alarm").hidden = true;
}

$("alarmOk").addEventListener("click", () => {
  hideAlarm();
  if (session) session.snoozeUntil = Date.now() + 8000;  // give 8 seconds to get back on task
});

function chime() {
  try {
    const audio = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const tone = audio.createOscillator(), volume = audio.createGain();
      const at = audio.currentTime + i * 0.18;
      tone.frequency.value = freq;
      volume.gain.setValueAtTime(0.18, at);
      volume.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
      tone.connect(volume).connect(audio.destination);
      tone.start(at); tone.stop(at + 0.35);
    });
    setTimeout(() => audio.close(), 1000);
  } catch { /* sound not available */ }
}

function setStatus(text) { $("sessionStatus").textContent = text; }
function setPill(text, kind) { const p = $("camPill"); p.textContent = text; p.className = `cam-pill ${kind}`; }

// =========================================================
// Summary
// =========================================================
let lastSetup = null;

function showSummary(result, s, finished) {
  lastSetup = { task: s.task, minutes: s.plannedSecs / 60, todoId: s.todoId };
  go("summary");

  const pct = result.focusPct;
  renderMascot($("summaryMascot"), mascot, pct >= 60 ? "happy" : "calm");
  $("summaryTitle").textContent = finished ? "Session complete!" : "Session ended";
  $("summaryLine").textContent =
    pct >= 90 ? `${mascot.name} is so proud. That was serious focus.` :
    pct >= 70 ? "Nice work! Just a few distractions." :
    pct >= 40 ? "Good start. Try putting your phone in another room next time." :
                "Tough session. Shorter sessions can help you build focus.";

  const mins = Math.round(result.seconds / 60);
  $("sumTime").textContent = mins < 1 ? `${result.seconds} sec` : `${mins} min`;
  $("sumFocus").textContent = `${pct}%`;
  $("sumDistractions").textContent = result.distractions;
  $("sumPhone").textContent = result.phone;

  const todo = todos.find(t => t.id === s.todoId && !t.done);
  $("sumDoneWrap").hidden = !todo;
  $("sumDone").checked = false;
  if (todo) $("sumTaskName").textContent = todo.text;
}

$("sumDone").addEventListener("change", e => {
  const t = todos.find(x => x.id === lastSetup?.todoId);
  if (t) { t.done = e.target.checked; saveTodos(); }
});

$("anotherBtn").addEventListener("click", () => go("setup", lastSetup || {}));

function renderHistory() {
  $("historyList").innerHTML = history.slice(0, 8).map(h => `<li class="item">
      <div class="when">${dayName(h.date)}</div>
      <div class="item-main">
        <div class="item-title">${esc(h.task)}</div>
        <div class="item-meta">${Math.max(1, Math.round(h.seconds / 60))} min, ${h.focusPct}% focused, ${h.phone} phone pickup${h.phone === 1 ? "" : "s"}</div>
      </div>
    </li>`).join("");
}

// =========================================================
// Mascot studio
// =========================================================
let draft = null;

function renderStudio() {
  draft = JSON.parse(JSON.stringify(mascot));
  $("mName").value = draft.name;
  $("mColor").value = draft.color;
  $("mCustomChip").hidden = !draft.image;
  $("mSaved").textContent = "";
  $("mMessages").innerHTML = Object.keys(MESSAGE_LABELS).map(type => `<div class="msg-group">
      <label for="msg-${type}">${MESSAGE_LABELS[type]}</label>
      <textarea id="msg-${type}" data-type="${type}">${esc((draft.messages[type] || DEFAULT_MESSAGES[type]).join("\n"))}</textarea>
    </div>`).join("");
  updatePreview();
}

function updatePreview() {
  renderMascot($("studioCalm"), draft, "calm");
  renderMascot($("studioAlert"), draft, "alert");
  [...$("mKinds").children].forEach(c => c.classList.toggle("selected", c.dataset.kind === draft.kind));
}

$("mName").addEventListener("input", e => { draft.name = e.target.value.trim() || "Pip"; });
$("mColor").addEventListener("input", e => {
  draft.color = e.target.value;
  if (draft.kind === "custom") draft.kind = "blob";
  updatePreview();
});
$("mKinds").addEventListener("click", e => {
  if (!e.target.dataset.kind) return;
  draft.kind = e.target.dataset.kind;
  updatePreview();
});

$("mUpload").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    draft.image = await shrinkImage(file, 360);
    draft.kind = "custom";
    $("mCustomChip").hidden = false;
    updatePreview();
  } catch {
    $("mSaved").textContent = "That image couldn't be opened. Try a PNG or JPG file.";
  }
});

// Resize uploads so they fit in the browser's storage
function shrinkImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$("mSave").addEventListener("click", () => {
  document.querySelectorAll("#mMessages textarea").forEach(t => {
    draft.messages[t.dataset.type] = t.value.split("\n").map(s => s.trim()).filter(Boolean);
  });
  mascot = JSON.parse(JSON.stringify(draft));
  const ok = saveMascot(mascot);
  $("mSaved").textContent = ok
    ? `Saved! ${mascot.name} will cheer you on from now on.`
    : `${mascot.name} is set for now, but your browser blocked saving, so it resets when you reload.`;
});

$("mReset").addEventListener("click", () => {
  draft = defaultMascot();
  $("mName").value = draft.name;
  $("mColor").value = draft.color;
  $("mCustomChip").hidden = true;
  $("mUpload").value = "";
  document.querySelectorAll("#mMessages textarea").forEach(t => { t.value = DEFAULT_MESSAGES[t.dataset.type].join("\n"); });
  updatePreview();
});

// ---------- Start on the home screen ----------
go("home");
