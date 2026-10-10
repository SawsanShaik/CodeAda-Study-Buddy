# Canvas calendar

The Canvas calendar is now part of StudyBuddy instead of a separate extension.

- **Schedule screen** (`index.html`, `js/planner.js`): paste your Canvas feed link, see due dates grouped by class, tick what you'll work on today, and make a plan with Gemini (or the built-in planner when there's no API key). Each work block has a Start button that opens a focus session.
- **StudyBuddy extension** (`studybuddy-extension 2/background.js`, `ics.js`): downloads the `.ics` feed every 30 minutes (a web page can't, because of CORS), sends the events to the app, and shows how many things are due in the next 24 hours on the dog icon.
- `js/canvas.js` has the date and grouping helpers; `js/scheduler.js` talks to Gemini and holds the fallback planner.

Get the feed link from Canvas → Calendar → **Calendar Feed** (bottom right). Get a free Gemini key at https://aistudio.google.com/apikey and paste it under **Gemini settings** on the Schedule screen.
