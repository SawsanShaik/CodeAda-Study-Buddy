// Turns today's picked tasks into a timed schedule, using Gemini or a simple built-in fallback.

export const BREAK_STYLES = {
  pomodoro: { label: "25 min work / 5 min break", work: 25, rest: 5 },
  standard: { label: "50 min work / 10 min break", work: 50, rest: 10 },
  deep: { label: "90 min work / 15 min break", work: 90, rest: 15 },
};

// "auto" means: ask Google which models this key can use and pick the newest Flash.
// Google retires old models often, so hardcoding one name breaks.
export const DEFAULT_MODEL = "auto";

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

// ---------- Gemini ----------

// Asking Gemini for JSON that matches this shape means we never have to parse free text.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    blocks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "STRING", description: "24-hour HH:MM" },
          end: { type: "STRING", description: "24-hour HH:MM" },
          title: { type: "STRING" },
          kind: { type: "STRING", enum: ["work", "break", "event"] },
          taskId: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["start", "end", "title", "kind"],
      },
    },
  },
  required: ["summary", "blocks"],
};

function buildPrompt(input) {
  const style = BREAK_STYLES[input.breakStyle];
  return `You are a study planner for a university student. Build a realistic schedule for today.

Rules:
- Only schedule between ${input.startTime} and ${input.dayEnd} (24-hour times).
- Never overlap the fixed events; include each fixed event in the output with kind "event".
- Work in focused blocks of about ${style.work} minutes, with a ${style.rest} minute break (kind "break") between them. Add a longer meal break if the day spans a usual mealtime.
- Give each task roughly the minutes the student estimated. Split long tasks across several blocks.
- Do tasks with earlier due dates first. Put harder-sounding work earlier in the day and alternate between classes when it helps focus.
- Each work block's title should be "<class>: <task>" and its note should say what to get done in that block, based on the student's "how much" goal.
- Set taskId on work blocks to the id of the task.
- If not everything fits, say what was left out in the summary.
- The summary is 1-2 friendly sentences.

Tasks (JSON): ${JSON.stringify(input.tasks)}
Fixed events today (JSON): ${JSON.stringify(input.fixed)}
Student's notes: ${input.notes || "none"}`;
}

// Lists the models this API key can use and returns the newest stable "gemini-X.Y-flash".
export async function pickModel(apiKey) {
  const models = [];
  let pageToken = "";
  do {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`,
      { headers: { "x-goog-api-key": apiKey } }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `Gemini returned ${res.status}`);
    models.push(...(data.models || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  const usable = models.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"));
  const version = (name) => Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
  const newest = (list) => list.sort((a, b) => version(b.name) - version(a.name))[0];

  // Prefer plain stable Flash ("gemini-3-flash"), then any Flash that isn't "lite", then anything.
  const pick =
    newest(usable.filter((m) => /^models\/gemini-[\d.]+-flash$/.test(m.name))) ||
    newest(usable.filter((m) => /flash/.test(m.name) && !/lite/.test(m.name))) ||
    newest(usable.filter((m) => /gemini/.test(m.name)));
  if (!pick) throw new Error("No Gemini models are available for this API key.");
  return pick.name.replace(/^models\//, "");
}

export async function geminiSchedule(input, apiKey, model) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Gemini returned ${res.status}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini sent back an empty answer. Try again.");
  return cleanSchedule(JSON.parse(text));
}

// Drops malformed blocks and sorts by start time, so a sloppy answer can't break the page.
function cleanSchedule(schedule) {
  const valid = /^\d{1,2}:\d{2}$/;
  const blocks = (schedule.blocks || [])
    .filter((b) => valid.test(b.start) && valid.test(b.end) && toMinutes(b.end) > toMinutes(b.start))
    .map((b) => ({ ...b, start: toHHMM(toMinutes(b.start)), end: toHHMM(toMinutes(b.end)) }))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return { summary: schedule.summary || "", blocks };
}

// ---------- Built-in fallback (no API key or no internet) ----------

export function localSchedule(input) {
  const { work, rest } = BREAK_STYLES[input.breakStyle];
  const end = toMinutes(input.dayEnd);
  const fixed = input.fixed
    .map((f) => ({ ...f, s: toMinutes(f.start), e: toMinutes(f.end) }))
    .sort((a, b) => a.s - b.s);
  const queue = input.tasks.map((t) => ({ ...t, left: t.minutes }));
  const blocks = fixed.map((f) => ({ start: f.start, end: f.end, title: f.title, kind: "event" }));

  let t = toMinutes(input.startTime);
  let sinceBreak = 0;
  while (queue.length && t < end) {
    const inEvent = fixed.find((f) => f.s <= t && f.e > t);
    if (inEvent) {
      t = inEvent.e;
      sinceBreak = 0;
      continue;
    }
    const nextEvent = fixed.find((f) => f.s > t);
    const limit = Math.min(end, nextEvent ? nextEvent.s : end);

    if (sinceBreak >= work) {
      const len = Math.min(rest, limit - t);
      blocks.push({ start: toHHMM(t), end: toHHMM(t + len), title: "Break", kind: "break" });
      t += len;
      sinceBreak = 0;
      continue;
    }

    const task = queue[0];
    const len = Math.min(task.left, work - sinceBreak, limit - t);
    if (len < 10 && task.left >= 10) {
      // Too small a gap to be useful; skip ahead to the next event or stop.
      if (!nextEvent) break;
      t = nextEvent.s;
      continue;
    }
    blocks.push({
      start: toHHMM(t),
      end: toHHMM(t + len),
      title: `${task.course}: ${task.title}`,
      kind: "work",
      taskId: task.id,
      note: task.amount ? `Goal: ${task.amount}` : "",
    });
    t += len;
    sinceBreak += len;
    task.left -= len;
    if (task.left <= 0) queue.shift();
  }

  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const leftOut = queue.map((q) => q.title);
  return {
    summary: leftOut.length
      ? `Made without AI. Not finished today: ${leftOut.join(", ")}.`
      : "Made without AI, earliest due dates first.",
    blocks,
  };
}
