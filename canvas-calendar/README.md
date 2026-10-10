# Canvas Calendar (Chrome extension)

Shows your upcoming Canvas assignments grouped by class, with a badge for anything due in the next 24 hours. A full-tab planner lets you pick today's work, add your own tasks, and have Gemini build a schedule with breaks.

## Load it
1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Click the extension icon, then paste your Canvas feed URL
   (Canvas → Calendar → **Calendar Feed**, bottom right).
4. Click **Plan my day ↗** to open the planner. For AI scheduling, paste a Gemini API key
   (free at https://aistudio.google.com/apikey) under **Gemini settings**. Without a key it uses a simple built-in scheduler.

## How it works
- `background.js` fetches the `.ics` feed (the service worker has host permission, so no CORS issue), every 30 minutes and on demand.
- `ics.js` is a small dependency-free iCalendar parser. Canvas puts the course in brackets at the end of each title (`MP1 [CS 124 FA26]`), which it splits out.
- Parsed events live in `chrome.storage.local`; `popup.js` renders them grouped by class.
- `planner.js` collects today's picks and manual tasks; `scheduler.js` asks Gemini for a JSON schedule (structured output) or falls back to `localSchedule()`.

See HOW-IT-WORKS.md for a file-by-file walkthrough.

## Files
manifest.json · background.js · ics.js · shared.js · popup.html/.css/.js · planner.html/.css/.js · scheduler.js
