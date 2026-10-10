import { upcoming, groupByCourse, shortCourse, dueLabel, isSoon, todayKey, formatTime } from "./shared.js";
import { BREAK_STYLES, DEFAULT_MODEL, pickModel, geminiSchedule, localSchedule, toMinutes, toHHMM } from "./scheduler.js";

const $ = (id) => document.getElementById(id);
const TIME_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

// Everything about today's plan lives in one object, saved under "planner".
// A new day starts with a fresh plan but keeps your start/end time and break style.
let plan;
let events = [];

function freshPlan(prev = {}) {
  return {
    date: todayKey(),
    picks: {},   // Canvas assignment uid -> { amount, minutes }
    manual: [],  // { id, title, course, amount, minutes }
    dayStart: prev.dayStart || "09:00",
    dayEnd: prev.dayEnd || "22:00",
    breakStyle: prev.breakStyle || "standard",
    notes: "",
    schedule: null,
    done: {},    // schedule block index -> true
  };
}

const save = () => chrome.storage.local.set({ planner: plan });

async function init() {
  const stored = await chrome.storage.local.get(["planner", "events", "geminiKey", "geminiModel"]);
  events = stored.events || [];
  plan = stored.planner?.date === todayKey() ? stored.planner : freshPlan(stored.planner);

  $("today").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  $("apiKey").value = stored.geminiKey || "";
  $("model").value = isAuto(stored.geminiModel) ? DEFAULT_MODEL : stored.geminiModel;
  if (!stored.geminiKey) $("generate").textContent = "Make my schedule (add a Gemini key for AI)";

  for (const [value, style] of Object.entries(BREAK_STYLES)) $("breakStyle").append(new Option(style.label, value));
  for (const m of TIME_OPTIONS) $("taskMinutes").append(new Option(minutesLabel(m), m));
  $("taskMinutes").value = 60;

  $("dayStart").value = plan.dayStart;
  $("dayEnd").value = plan.dayEnd;
  $("breakStyle").value = plan.breakStyle;
  $("notes").value = plan.notes;

  renderAssignments();
  renderManual();
  renderSchedule();
}

function minutesLabel(m) {
  if (m < 60) return `${m} min`;
  return `${m / 60} hr`;
}

// ---------- Step 1: Canvas assignments grouped by class ----------

function renderAssignments() {
  const list = $("assignments");
  list.replaceChildren();
  const assignments = upcoming(events, 14).filter((e) => e.kind === "assignment");
  if (!assignments.length) {
    list.innerHTML = `<p class="empty">No Canvas assignments found. Set your feed link in the extension popup first.</p>`;
    return;
  }
  for (const { course, color, items } of groupByCourse(assignments)) {
    const group = document.createElement("div");
    group.className = "course";
    group.style.setProperty("--course", color);
    const name = document.createElement("div");
    name.className = "course-name";
    name.textContent = course;
    group.append(name, ...items.map(renderPick));
    list.append(group);
  }
  updateSelectedSummary();
}

function renderPick(e) {
  const pick = plan.picks[e.uid];
  const row = document.createElement("div");
  row.className = "pick" + (pick ? " selected" : "");

  const main = document.createElement("label");
  main.className = "pick-main";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!pick;
  const title = document.createElement("span");
  title.textContent = e.title;
  const due = document.createElement("span");
  due.className = "due" + (isSoon(e) ? " soon" : "");
  due.textContent = "Due " + dueLabel(e);
  main.append(box, title, due);
  row.append(main);

  box.addEventListener("change", () => {
    if (box.checked) plan.picks[e.uid] = { amount: "", minutes: 60 };
    else delete plan.picks[e.uid];
    save();
    renderAssignments();
  });

  // When picked, ask how much to do today and roughly how long it'll take.
  if (pick) {
    const details = document.createElement("div");
    details.className = "pick-details";
    const amount = document.createElement("input");
    amount.placeholder = "How much today? e.g. all of it, half, Q1–3";
    amount.value = pick.amount;
    amount.addEventListener("input", () => { pick.amount = amount.value; save(); });
    const minutes = document.createElement("select");
    for (const m of TIME_OPTIONS) minutes.append(new Option(minutesLabel(m), m));
    minutes.value = pick.minutes;
    minutes.addEventListener("change", () => { pick.minutes = Number(minutes.value); save(); updateSelectedSummary(); });
    details.append(amount, minutes);
    row.append(details);
  }
  return row;
}

// ---------- Step 2: manual tasks ----------

$("addTask").addEventListener("submit", (ev) => {
  ev.preventDefault();
  plan.manual.push({
    id: "m-" + Date.now(),
    title: $("taskTitle").value.trim(),
    course: $("taskCourse").value.trim() || "Personal",
    amount: $("taskAmount").value.trim(),
    minutes: Number($("taskMinutes").value),
  });
  save();
  $("addTask").reset();
  $("taskMinutes").value = 60;
  renderManual();
});

function renderManual() {
  const list = $("manualList");
  list.replaceChildren();
  for (const task of plan.manual) {
    const row = document.createElement("div");
    row.className = "manual";
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = task.title;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = [task.course, task.amount, minutesLabel(task.minutes)].filter(Boolean).join(" · ");
    text.append(title, meta);
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.title = "Remove";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      plan.manual = plan.manual.filter((t) => t.id !== task.id);
      save();
      renderManual();
    });
    row.append(text, remove);
    list.append(row);
  }
  updateSelectedSummary();
}

// ---------- Step 3: build the schedule ----------

function collectTasks() {
  const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
  const canvas = Object.entries(plan.picks)
    .filter(([uid]) => byUid[uid])
    .map(([uid, p]) => ({
      id: uid,
      title: byUid[uid].title,
      course: shortCourse(byUid[uid].course),
      amount: p.amount || "all of it",
      minutes: p.minutes,
      due: dueLabel(byUid[uid]),
    }));
  const manual = plan.manual.map((t) => ({ ...t, amount: t.amount || "all of it", due: "no due date" }));
  return [...canvas, ...manual];
}

// Canvas events with a set time today (lectures, exams) that the schedule must work around.
function fixedEventsToday() {
  const today = todayKey();
  return events
    .filter((e) => e.kind !== "assignment" && !e.allDay && todayKey(new Date(e.start)) === today)
    .map((e) => {
      const s = new Date(e.start);
      const end = e.end ? new Date(e.end) : new Date(s.getTime() + 60 * 60000);
      return {
        title: e.title,
        start: toHHMM(s.getHours() * 60 + s.getMinutes()),
        end: toHHMM(end.getHours() * 60 + end.getMinutes()),
      };
    });
}

function updateSelectedSummary() {
  if (!plan) return;
  const tasks = collectTasks();
  const total = tasks.reduce((sum, t) => sum + t.minutes, 0);
  $("selectedSummary").textContent = tasks.length
    ? `${tasks.length} task${tasks.length > 1 ? "s" : ""} picked, about ${Math.floor(total / 60)} hr ${total % 60} min of work.`
    : "Pick some assignments or add tasks first.";
}

for (const id of ["dayStart", "dayEnd", "breakStyle", "notes"]) {
  $(id).addEventListener("change", () => { plan[id] = $(id).value; save(); });
}

$("generate").addEventListener("click", async () => {
  const tasks = collectTasks();
  if (!tasks.length) {
    $("status").textContent = "Pick at least one assignment or add a task first.";
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
    $("status").textContent = "Your day's end time has already passed. Move the end time later.";
    return;
  }

  const { geminiKey } = await chrome.storage.local.get("geminiKey");
  $("generate").disabled = true;
  $("status").textContent = geminiKey ? "Asking Gemini…" : "";
  try {
    plan.schedule = geminiKey ? await askGemini(input, geminiKey) : localSchedule(input);
  } catch (err) {
    // If Gemini fails (bad key, no internet), still give the student a plan.
    plan.schedule = localSchedule(input);
    plan.schedule.summary = `Gemini didn't work (${err.message}), so here's a simple plan instead. ` + plan.schedule.summary;
  }
  plan.done = {};
  save();
  $("status").textContent = "";
  $("generate").disabled = false;
  renderSchedule();
});

// Treat an empty setting, "auto", or the old retired default as "pick for me".
function isAuto(model) {
  return !model || model === "auto" || model === "gemini-2.5-flash";
}

// Uses the model from settings, or finds the newest one. The automatic choice is remembered
// so we only look it up once, and looked up again if Google retires it.
async function askGemini(input, apiKey) {
  const { geminiModel, geminiAutoModel } = await chrome.storage.local.get(["geminiModel", "geminiAutoModel"]);
  if (!isAuto(geminiModel)) return geminiSchedule(input, apiKey, geminiModel);

  let model = geminiAutoModel || (await pickModel(apiKey));
  try {
    const schedule = await geminiSchedule(input, apiKey, model);
    await chrome.storage.local.set({ geminiAutoModel: model });
    return schedule;
  } catch (err) {
    if (!geminiAutoModel) throw err;
    model = await pickModel(apiKey);
    const schedule = await geminiSchedule(input, apiKey, model);
    await chrome.storage.local.set({ geminiAutoModel: model });
    return schedule;
  }
}

function renderSchedule() {
  if (!plan.schedule) return;
  $("scheduleCard").hidden = false;
  $("scheduleSummary").textContent = plan.schedule.summary;
  const list = $("schedule");
  list.replaceChildren();
  plan.schedule.blocks.forEach((b, i) => {
    const li = document.createElement("li");
    li.className = `block ${b.kind}` + (plan.done[i] ? " done" : "");
    const time = document.createElement("div");
    time.className = "time";
    time.textContent = `${clock(b.start)} – ${clock(b.end)}`;
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = b.title;
    body.append(title);
    if (b.note) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = b.note;
      body.append(note);
    }
    const check = document.createElement("input");
    check.type = "checkbox";
    check.title = "Mark done";
    check.checked = !!plan.done[i];
    check.addEventListener("change", () => {
      plan.done[i] = check.checked;
      save();
      li.classList.toggle("done", check.checked);
    });
    li.append(time, body, check);
    list.append(li);
  });
}

// "14:30" -> "2:30 PM"
function clock(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return formatTime(new Date(2000, 0, 1, h, m));
}

// ---------- Settings ----------

$("toggleSettings").addEventListener("click", () => ($("settings").hidden = !$("settings").hidden));
$("saveSettings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    geminiKey: $("apiKey").value.trim(),
    geminiModel: $("model").value.trim() || DEFAULT_MODEL,
    geminiAutoModel: null, // re-check the newest model with the new key
  });
  $("generate").textContent = $("apiKey").value.trim()
    ? "Make my schedule with Gemini"
    : "Make my schedule (add a Gemini key for AI)";
  $("settings").hidden = true;
});

// Pick up new Canvas data if the background refreshes while this tab is open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.events) {
    events = changes.events.newValue || [];
    renderAssignments();
  }
});

init();
