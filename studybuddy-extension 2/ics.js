// Minimal iCalendar (.ics) parser for Canvas calendar feeds. No dependencies.

// Undo RFC 5545 line folding: a line starting with a space or tab continues the previous one.
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// Parses DTSTART/DTEND values. Returns { date: Date, allDay: boolean }.
// Handles 20261015T045900Z (UTC), 20261015T045900 (floating, treated as local) and 20261015 (all day).
function parseDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === "DATE") {
    return { date: new Date(+y, +mo - 1, +d), allDay: true };
  }
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

function parseLine(line) {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(";");
  const params = {};
  for (const p of paramParts) {
    const [k, v] = p.split("=");
    if (k) params[k.toUpperCase()] = v;
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

// Canvas puts the course in brackets at the end of SUMMARY: "Homework 3 [CS 124 FA26]".
function splitCourse(summary) {
  const m = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return m ? { title: m[1], course: m[2] } : { title: summary, course: "" };
}

// Canvas UIDs look like "event-assignment-12345" or "event-calendar-event-678".
function kindFromUid(uid) {
  if (/assignment/.test(uid)) return "assignment";
  if (/calendar-event/.test(uid)) return "event";
  return "other";
}

export function parseIcs(text) {
  const events = [];
  let current = null;
  for (const raw of unfold(text).split("\n")) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && current.start) {
        const { title, course } = splitCourse(current.summary || "Untitled");
        events.push({
          uid: current.uid || "",
          title,
          course,
          kind: kindFromUid(current.uid || ""),
          start: current.start.date.toISOString(),
          end: current.end ? current.end.date.toISOString() : null,
          allDay: current.start.allDay,
          url: current.url || "",
          location: current.location || "",
          description: current.description || "",
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parseLine(line);
    if (!prop) continue;
    switch (prop.name) {
      case "SUMMARY": current.summary = unescapeText(prop.value); break;
      case "UID": current.uid = prop.value; break;
      case "URL": current.url = prop.value; break;
      case "LOCATION": current.location = unescapeText(prop.value); break;
      case "DESCRIPTION": current.description = unescapeText(prop.value); break;
      case "DTSTART": current.start = parseDate(prop.value, prop.params); break;
      case "DTEND": current.end = parseDate(prop.value, prop.params); break;
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}
