// =========================================================
// Canvas due dates + "Plan my day" on the Schedule screen.
// The StudyBuddy extension downloads the Canvas feed (a web
// page can't, because of CORS) and sends us the events.
// Gemini, or the built-in planner, turns today's picks into
// a timed schedule with breaks.
// =========================================================
import { upcoming, groupByCourse, shortCourse, dueLabel, isSoon, todayKey, formatTime } from "./canvas.js";
import { BREAK_STYLES, pickModel, geminiSchedule, localSchedule, toMinutes, toHHMM } from "./scheduler.js";

const $ = id => document.getElementById(id);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const FEED_PATTERN = /^https:\/\/(canvas\.illinois\.edu|[\w-]+\.instructure\.com)\/feeds\/calendars\/[^/]+\.ics$/;
// How long a task takes: every 15 minutes up to 4 hours, picked by scrolling a little wheel.
const TIME_OPTIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);
const minutesLabel = m => {
  const h = Math.floor(m / 60), rest = m % 60;
  return h ? (rest ? `${h} hr ${rest}` : `${h} hr`) : `${m} min`;
};
const WHEEL_ROW = 32;  // px, matches .time-wheel li in styles.css
const timeWheel = (attr, id, selected) => `<ul class="time-wheel" ${attr}="${esc(id)}" data-value="${selected}" tabindex="0" role="listbox" aria-label="How long">
    ${TIME_OPTIONS.map(m => `<li role="option" aria-selected="${m === selected}">${minutesLabel(m)}</li>`).join("")}
  </ul>`;

// Scrolling a wheel snaps to a time, then fires a "change" event with the minutes in data-value.
function initWheels(root) {
  root.querySelectorAll(".time-wheel").forEach(wheel => {
    const rows = [...wheel.children];
    const select = i => {
      const value = TIME_OPTIONS[i];
      rows.forEach((row, j) => row.setAttribute("aria-selected", String(j === i)));
      if (Number(wheel.dataset.value) === value) return;
      wheel.dataset.value = value;
      wheel.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const goTo = i => wheel.scrollTo({ top: Math.max(0, Math.min(rows.length - 1, i)) * WHEEL_ROW, behavior: "smooth" });
    wheel.scrollTop = TIME_OPTIONS.indexOf(Number(wheel.dataset.value)) * WHEEL_ROW;
    let settle = null;
    wheel.addEventListener("scroll", () => {
      clearTimeout(settle);
      settle = setTimeout(() => select(Math.round(wheel.scrollTop / WHEEL_ROW)), 120);
    });
    rows.forEach((row, i) => row.addEventListener("click", () => goTo(i)));
    wheel.addEventListener("keydown", e => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      goTo(Math.round(wheel.scrollTop / WHEEL_ROW) + step);
    });
  });
}

// ---------- Saved data ----------
// Last Canvas data the extension sent, so the list shows right away.
let canvas = store.get("studybuddy-canvas", { feedUrl: "", events: [], lastUpdated: null, error: null });
let gemini = store.get("studybuddy-gemini", { key: "", model: "auto", autoModel: null });
let plan = loadPlan();
let rangeDays = store.get("studybuddy-canvas-range", 7);
let editingFeed = false;

// One plan per day. A new day starts fresh but keeps your start/end time and break style.
function loadPlan() {
  const prev = store.get("studybuddy-plan", {});
  if (prev.date === todayKey()) return prev;
  return {
    date: todayKey(),
    picks: {},      // Canvas assignment uid -> { amount, minutes }
    todoPicks: {},  // to-do id -> minutes
    dayStart: prev.dayStart || "09:00",
    dayEnd: prev.dayEnd || "22:00",
    breakStyle: prev.breakStyle || "standard",
    notes: "",
    schedule: null,
    done: {},       // schedule block index -> true
  };
}
const savePlan = () => store.set("studybuddy-plan", plan);
const saveGemini = () => store.set("studybuddy-gemini", gemini);

export function setupPlanner({ getTodos, startSession, tellExtension, extensionInstalled }) {
  // ---------- Canvas feed ----------
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "studybuddy-extension" || e.data.type !== "canvas-data") return;
    const { feedUrl, events, lastUpdated, error } = e.data;
    canvas = { feedUrl, events, lastUpdated, error };
    store.set("studybuddy-canvas", canvas);
    $("feedForm").querySelector("button").disabled = false;
    if (feedUrl && !error) editingFeed = false;
    $("feedError").textContent = editingFeed && error ? error : "";
    $("canvasRefresh").disabled = false;
    render();
  });

  $("feedForm").addEventListener("submit", e => {
    e.preventDefault();
    const url = $("feedUrl").value.trim().replace(/^webcal:/, "https:");
    if (!FEED_PATTERN.test(url)) {
      $("feedError").textContent = "That doesn't look like a Canvas calendar feed link (it should end in .ics).";
      return;
    }
    if (!extensionInstalled()) {
      $("feedError").textContent = "Install the StudyBuddy extension first. It's what downloads your Canvas calendar.";
      return;
    }
    $("feedError").textContent = "Loading your calendar…";
    $("feedForm").querySelector("button").disabled = true;
    tellExtension("canvas-set-feed", { url });
  });

  $("canvasRefresh").addEventListener("click", () => {
    $("canvasRefresh").disabled = true;
    tellExtension("canvas-refresh");
  });
  $("canvasSettings").addEventListener("click", () => { editingFeed = !editingFeed; render(); });

  $("rangeChips").addEventListener("click", e => {
    if (!e.target.dataset.range) return;
    rangeDays = Number(e.target.dataset.range);
    store.set("studybuddy-canvas-range", rangeDays);
    render();
  });
  $("assignmentsOnly").addEventListener("change", render);

  // Ticking an assignment adds it to today's plan, then asks how much to do and how long it'll take.
  $("canvasList").addEventListener("change", e => {
    const { pick, amount, minutes } = e.target.dataset;
    if (pick) {
      if (e.target.checked) plan.picks[pick] = { amount: "", minutes: 60 };
      else delete plan.picks[pick];
      savePlan();
      render();
    }
    if (minutes) { plan.picks[minutes].minutes = Number(e.target.dataset.value); savePlan(); renderSummary(); }
    if (amount) { plan.picks[amount].amount = e.target.value; savePlan(); }
  });
  $("canvasList").addEventListener("input", e => {
    const { amount } = e.target.dataset;
    if (amount) { plan.picks[amount].amount = e.target.value; savePlan(); }
  });

  // ---------- To-dos ----------
  $("todoPicks").addEventListener("change", e => {
    const { todo, todoMinutes } = e.target.dataset;
    if (todo) {
      if (e.target.checked) plan.todoPicks[todo] = 60;
      else delete plan.todoPicks[todo];
      savePlan();
      render();
    }
    if (todoMinutes) { plan.todoPicks[todoMinutes] = Number(e.target.dataset.value); savePlan(); renderSummary(); }
  });

  // ---------- Day settings ----------
  for (const [value, style] of Object.entries(BREAK_STYLES)) $("breakStyle").append(new Option(style.label, value));
  const fields = { dayStart: "dayStart", dayEnd: "dayEnd", breakStyle: "breakStyle", planNotes: "notes" };
  for (const [id, key] of Object.entries(fields)) {
    $(id).addEventListener("change", () => { plan[key] = $(id).value; savePlan(); });
  }

  $("apiKey").value = gemini.key;
  $("geminiModel").value = isAuto(gemini.model) ? "auto" : gemini.model;
  $("saveGemini").addEventListener("click", () => {
    gemini = { key: $("apiKey").value.trim(), model: $("geminiModel").value.trim() || "auto", autoModel: null };
    saveGemini();
    $("planStatus").textContent = gemini.key ? "Gemini key saved." : "Key removed. StudyBuddy will plan without AI.";
    renderSummary();
  });

  $("makePlan").addEventListener("click", () => makePlan(getTodos));

  // ---------- Today's plan ----------
  $("planBlocks").addEventListener("click", e => {
    const i = e.target.dataset.start;
    if (i === undefined) return;
    const b = plan.schedule.blocks[i];
    startSession(b.title, Math.max(1, toMinutes(b.end) - toMinutes(b.start)));
  });
  $("planBlocks").addEventListener("change", e => {
    const i = e.target.dataset.done;
    if (i === undefined) return;
    plan.done[i] = e.target.checked;
    savePlan();
    e.target.closest(".item").classList.toggle("done", e.target.checked);
  });

  function render() {
    if (plan.date !== todayKey()) plan = loadPlan();
    renderCanvas();
    renderTodoPicks(getTodos());
    $("dayStart").value = plan.dayStart;
    $("dayEnd").value = plan.dayEnd;
    $("breakStyle").value = plan.breakStyle;
    $("planNotes").value = plan.notes;
    renderSummary();
    renderPlan();
  }

  function renderSummary() {
    const tasks = collectTasks(getTodos());
    const total = tasks.reduce((sum, t) => sum + t.minutes, 0);
    $("pickedSummary").textContent = tasks.length
      ? `${tasks.length} task${tasks.length > 1 ? "s" : ""} picked, about ${Math.floor(total / 60)} hr ${total % 60} min of work.`
      : "Tick some Canvas assignments or to-dos to plan your day.";
    $("makePlan").textContent = gemini.key ? "Make my schedule with Gemini" : "Make my schedule";
  }

  // Ask the extension for the latest Canvas data when the page opens
  if (extensionInstalled()) tellExtension("canvas-get");
  return { render };
}

// ---------- Canvas list ----------
function renderCanvas() {
  const showSetup = !canvas.feedUrl || editingFeed;
  $("canvasSetup").hidden = !showSetup;
  $("canvasMain").hidden = !canvas.feedUrl;
  if (showSetup && !$("feedUrl").value) $("feedUrl").value = canvas.feedUrl;
  if (!canvas.feedUrl) return;

  document.querySelectorAll("#rangeChips .chip").forEach(c => c.classList.toggle("selected", Number(c.dataset.range) === rangeDays));
  $("canvasError").textContent = canvas.error ? `Couldn't refresh: ${canvas.error}` : "";
  $("canvasUpdated").textContent = canvas.lastUpdated ? `Updated ${formatTime(new Date(canvas.lastUpdated))}` : "Not loaded yet";

  const assignmentsOnly = $("assignmentsOnly").checked;
  const shown = upcoming(canvas.events, rangeDays).filter(e => !assignmentsOnly || e.kind === "assignment");
  if (!shown.length) {
    $("canvasList").innerHTML = `<p class="empty">Nothing due in the next ${rangeDays} days 🎉</p>`;
    return;
  }
  $("canvasList").innerHTML = groupByCourse(shown).map(({ course, color, items }) => `
    <div class="course-group" style="--course: ${color}">
      <div class="course-name">${esc(course)} <span>${items.length} due</span></div>
      <ul class="list">${items.map(renderCanvasItem).join("")}</ul>
    </div>`).join("");
  initWheels($("canvasList"));
}

function renderCanvasItem(e) {
  const pick = plan.picks[e.uid];
  const title = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title);
  const canPick = e.kind === "assignment";
  return `<li class="item${pick ? " picked" : ""}">
      ${canPick ? `<input type="checkbox" data-pick="${esc(e.uid)}" ${pick ? "checked" : ""} aria-label="Plan ${esc(e.title)} today" />` : ""}
      <div class="item-main">
        <div class="item-title">${title}${canPick ? "" : ` <span class="tag">event</span>`}</div>
        <div class="item-meta${isSoon(e) ? " urgent" : ""}">${canPick ? "Due " : ""}${dueLabel(e)}</div>
      </div>
      ${pick ? `<div class="pick-details">
        <input data-amount="${esc(e.uid)}" value="${esc(pick.amount)}" placeholder="How much today? e.g. all of it, half, Q1–3" aria-label="How much today" />
        ${timeWheel("data-minutes", e.uid, pick.minutes)}
      </div>` : ""}
    </li>`;
}

function renderTodoPicks(todos) {
  const open = todos.filter(t => !t.done);
  $("todoPicksEmpty").hidden = open.length > 0;
  $("todoPicks").innerHTML = open.map(t => {
    const minutes = plan.todoPicks[t.id];
    return `<li class="item${minutes ? " picked" : ""}">
      <input type="checkbox" data-todo="${t.id}" ${minutes ? "checked" : ""} aria-label="Plan ${esc(t.text)} today" />
      <div class="item-main"><div class="item-title">${esc(t.text)}</div></div>
      ${minutes ? timeWheel("data-todo-minutes", t.id, minutes) : ""}
    </li>`;
  }).join("");
  initWheels($("todoPicks"));
}

// ---------- Making the schedule ----------
function collectTasks(todos) {
  const byUid = Object.fromEntries(canvas.events.map(e => [e.uid, e]));
  const fromCanvas = Object.entries(plan.picks)
    .filter(([uid]) => byUid[uid])
    .map(([uid, p]) => ({
      id: uid,
      title: byUid[uid].title,
      course: shortCourse(byUid[uid].course),
      amount: p.amount || "all of it",
      minutes: p.minutes,
      due: dueLabel(byUid[uid]),
    }));
  const fromTodos = todos
    .filter(t => !t.done && plan.todoPicks[t.id])
    .map(t => ({
      id: t.id,
      title: t.text,
      course: "Personal",
      amount: "all of it",
      minutes: plan.todoPicks[t.id],
      due: t.due || "no due date",
    }));
  return [...fromCanvas, ...fromTodos];
}

// Canvas events with a set time today (lectures, exams) that the schedule must work around.
function fixedEventsToday() {
  const today = todayKey();
  return canvas.events
    .filter(e => e.kind !== "assignment" && !e.allDay && todayKey(new Date(e.start)) === today)
    .map(e => {
      const s = new Date(e.start);
      const end = e.end ? new Date(e.end) : new Date(s.getTime() + 60 * 60000);
      return {
        title: e.title,
        start: toHHMM(s.getHours() * 60 + s.getMinutes()),
        end: toHHMM(end.getHours() * 60 + end.getMinutes()),
      };
    });
}

async function makePlan(getTodos) {
  const tasks = collectTasks(getTodos());
  if (!tasks.length) {
    $("planStatus").textContent = "Tick at least one Canvas assignment or to-do first.";
    return;
  }
  // Don't schedule anything earlier than right now.
  const now = new Date();
  const nowMins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
  const input = {
    startTime: toHHMM(Math.max(toMinutes(plan.dayStart), nowMins)),
    dayEnd: plan.dayEnd,
    breakStyle: plan.breakStyle,
    notes: plan.notes,
    tasks,
    fixed: fixedEventsToday(),
  };
  if (toMinutes(input.startTime) >= toMinutes(input.dayEnd)) {
    $("planStatus").textContent = "Your day's end time has already passed. Move the end time later.";
    return;
  }

  $("makePlan").disabled = true;
  $("planStatus").textContent = gemini.key ? "Asking Gemini…" : "";
  try {
    plan.schedule = gemini.key ? await askGemini(input) : localSchedule(input);
  } catch (err) {
    // If Gemini fails (bad key, no internet), still give a plan.
    plan.schedule = localSchedule(input);
    plan.schedule.summary = `Gemini didn't work (${err.message}), so here's a simple plan instead. ` + plan.schedule.summary;
  }
  plan.done = {};
  savePlan();
  $("planStatus").textContent = "";
  $("makePlan").disabled = false;
  renderPlan();
  $("planResult").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Treat an empty setting, "auto", or the old retired default as "pick for me".
function isAuto(model) {
  return !model || model === "auto" || model === "gemini-2.5-flash";
}

// Uses the model from settings, or finds the newest one. The automatic choice is remembered
// so we only look it up once, and looked up again if Google retires it.
async function askGemini(input) {
  if (!isAuto(gemini.model)) return geminiSchedule(input, gemini.key, gemini.model);
  const remembered = gemini.autoModel;
  let model = remembered || (await pickModel(gemini.key));
  let schedule;
  try {
    schedule = await geminiSchedule(input, gemini.key, model);
  } catch (err) {
    if (!remembered) throw err;
    model = await pickModel(gemini.key);
    schedule = await geminiSchedule(input, gemini.key, model);
  }
  gemini.autoModel = model;
  saveGemini();
  return schedule;
}

// "14:30" -> "2:30 PM"
function clock(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return formatTime(new Date(2000, 0, 1, h, m));
}

function renderPlan() {
  $("planResult").hidden = !plan.schedule;
  if (!plan.schedule) return;
  $("planSummary").textContent = plan.schedule.summary;
  $("planBlocks").innerHTML = plan.schedule.blocks.map((b, i) => `
    <li class="item plan-${b.kind}${plan.done[i] ? " done" : ""}">
      <div class="when">${clock(b.start)}<br />${clock(b.end)}</div>
      <div class="item-main">
        <div class="item-title">${esc(b.title)}</div>
        ${b.note ? `<div class="item-meta">${esc(b.note)}</div>` : ""}
      </div>
      ${b.kind === "work" ? `<button class="btn" data-start="${i}">Start</button>` : ""}
      <input type="checkbox" data-done="${i}" ${plan.done[i] ? "checked" : ""} aria-label="Mark done" />
    </li>`).join("");
}
