import { upcoming, groupByCourse, dueLabel, isSoon, formatTime } from "./shared.js";

const $ = (id) => document.getElementById(id);
let rangeDays = 7;

const FEED_PATTERN = /^https:\/\/(canvas\.illinois\.edu|[\w-]+\.instructure\.com)\/feeds\/calendars\/[^/]+\.ics$/;

async function init() {
  const { feedUrl } = await chrome.storage.local.get("feedUrl");
  if (!feedUrl) return showSetup();
  showMain();
}

function showSetup() {
  $("setup").hidden = false;
  $("main").hidden = true;
  chrome.storage.local.get("feedUrl").then(({ feedUrl }) => ($("feedUrl").value = feedUrl || ""));
}

async function showMain() {
  $("setup").hidden = true;
  $("main").hidden = false;
  await render();
}

async function render() {
  const { events = [], lastUpdated, lastError } = await chrome.storage.local.get([
    "events", "lastUpdated", "lastError",
  ]);
  $("error").textContent = lastError || "";
  $("updated").textContent = lastUpdated ? `Updated ${formatTime(new Date(lastUpdated))}` : "Not loaded yet";

  const assignmentsOnly = $("assignmentsOnly").checked;
  const shown = upcoming(events, rangeDays).filter((e) => !assignmentsOnly || e.kind === "assignment");

  const list = $("list");
  list.replaceChildren();
  if (!shown.length) {
    list.innerHTML = `<div class="empty">Nothing due in the next ${rangeDays} days 🎉</div>`;
    return;
  }
  for (const group of groupByCourse(shown)) list.append(renderCourse(group));
}

// One card per class, with its items in due-date order.
function renderCourse({ course, color, items }) {
  const card = document.createElement("div");
  card.className = "course";
  card.style.setProperty("--course", color);

  const head = document.createElement("div");
  head.className = "course-head";
  const name = document.createElement("span");
  name.textContent = course;
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = `${items.length} due`;
  head.append(name, count);
  card.append(head);

  for (const e of items) card.append(renderItem(e));
  return card;
}

function renderItem(e) {
  const row = document.createElement(e.url ? "a" : "div");
  row.className = "item";
  if (e.url) {
    row.href = e.url;
    row.target = "_blank";
  }
  if (isSoon(e)) row.classList.add("soon");

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = e.title;
  if (e.kind !== "assignment") {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "event";
    title.append(tag);
  }

  const due = document.createElement("span");
  due.className = "due";
  due.textContent = dueLabel(e);

  row.append(title, due);
  return row;
}

async function refresh() {
  $("refresh").disabled = true;
  await chrome.runtime.sendMessage({ type: "refresh" });
  $("refresh").disabled = false;
  await render();
}

$("save").addEventListener("click", async () => {
  const url = $("feedUrl").value.trim().replace(/^webcal:/, "https:");
  if (!FEED_PATTERN.test(url)) {
    $("setupError").textContent = "That doesn't look like a Canvas calendar feed URL (it should end in .ics).";
    return;
  }
  $("setupError").textContent = "";
  await chrome.storage.local.set({ feedUrl: url });
  const res = await chrome.runtime.sendMessage({ type: "refresh" });
  if (!res?.ok) {
    $("setupError").textContent = res?.error || "Couldn't load the feed.";
    return;
  }
  showMain();
});

$("openPlanner").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("planner.html") }));
$("refresh").addEventListener("click", refresh);
$("settings").addEventListener("click", () => ($("setup").hidden ? showSetup() : showMain()));
$("assignmentsOnly").addEventListener("change", render);
document.querySelectorAll(".filters button").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filters button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    rangeDays = Number(btn.dataset.range);
    render();
  })
);

init();
