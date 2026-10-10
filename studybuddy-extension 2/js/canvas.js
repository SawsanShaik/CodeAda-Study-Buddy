// Canvas calendar helpers used by the Schedule screen (js/planner.js).

const DAY_MS = 86400000;

export function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// "2026-10-10" in local time, used to keep one plan per day.
export function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Events that haven't passed yet and fall within the next `days` days.
export function upcoming(events, days, now = new Date()) {
  const today = startOfDay(now);
  const cutoff = new Date(today.getTime() + days * DAY_MS);
  return events.filter((e) => {
    const t = new Date(e.start);
    const stillRelevant = e.allDay ? t >= today : t >= now;
    return stillRelevant && t < cutoff;
  });
}

// "CS 124 FA26" -> "CS 124". Drops the term code Canvas adds to course names.
export function shortCourse(course) {
  if (!course) return "Other";
  return course.replace(/\b(FA|SP|SU|WI)\d{2}\b/i, "").replace(/\s{2,}/g, " ").trim() || course;
}

// Gives every course a stable color by hashing its name. Colors come from the dog's palette (styles.css).
const COURSE_COLORS = ["#8a5a35", "#2f7f81", "#c94f3d", "#a87b12", "#5f7a3a", "#7a6656"];
export function courseColor(course) {
  let hash = 0;
  for (const ch of course || "") hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
}

// Groups events by course. Courses with the soonest due date come first.
export function groupByCourse(events) {
  const groups = new Map();
  for (const e of events) {
    const key = shortCourse(e.course);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.entries()]
    .map(([course, items]) => ({ course, color: courseColor(course), items }))
    .sort((a, b) => a.items[0].start.localeCompare(b.items[0].start));
}

export function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "Today, 11:59 PM", "Tomorrow", "Thu, Oct 15, 11:59 PM"
export function dueLabel(e, now = new Date()) {
  const d = new Date(e.start);
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  const day =
    diff === 0 ? "Today" :
    diff === 1 ? "Tomorrow" :
    d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return e.allDay ? day : `${day}, ${formatTime(d)}`;
}

// True when something is due within the next 24 hours.
export function isSoon(e, now = new Date()) {
  const t = new Date(e.start) - now;
  return t >= 0 && t < DAY_MS;
}
