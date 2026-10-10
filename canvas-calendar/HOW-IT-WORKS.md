# How the Canvas Calendar extension works

A plain-language walkthrough of each file, in the order things happen.

## The big picture

Canvas can give every student a private "calendar feed" link that ends in `.ics`. That link returns a text file in a standard calendar format (iCalendar, the same format Google Calendar and Apple Calendar use). The extension saves that link, downloads the file every 30 minutes, turns it into a list of assignments and events, and shows them in a popup. No Canvas login or API token is needed, because the feed link itself is the key.

The extension has a few parts that talk to each other: a **background script** that does the downloading, a **parser** that reads the calendar file, a **popup** that you see when you click the icon, and a full-tab **planner** where you pick today's work and get a schedule (from Gemini, or a built-in fallback). They share data through Chrome's built-in storage (`chrome.storage.local`), which works like a small database that belongs to the extension.

---

## manifest.json

Every Chrome extension starts with this file. It tells Chrome the extension's name, version, and what it is allowed to do. We use **Manifest V3**, the current version Chrome requires for new extensions.

`"action"` says that clicking the toolbar icon opens `popup.html`. `"background"` points at `background.js` and marks it as a `"module"`, which lets it use `import` to pull in code from `ics.js`.

`"permissions"` asks for two things. `storage` lets us save the feed link and the parsed events. `alarms` lets us wake up every 30 minutes to refresh.

`"host_permissions"` lists the websites the extension may talk to: `canvas.illinois.edu` and any `*.instructure.com` Canvas site for the feed, plus `generativelanguage.googleapis.com`, which is Google's Gemini API. This is what lets us fetch the feed without hitting a **CORS** error. Normally a web page can't download data from another website unless that site allows it. Extensions are an exception, but only for the sites listed here.

---

## ics.js (the parser)

This file turns the raw calendar text into JavaScript objects. A calendar feed looks like this:

```
BEGIN:VEVENT
DTSTART:20261015T045900Z
SUMMARY:MP1: Hello\, World [CS 124 FA26]
UID:event-assignment-12345
URL:https://canvas.illinois.edu/courses/1/assignments/12345
END:VEVENT
```

Each event sits between `BEGIN:VEVENT` and `END:VEVENT`, and every line is `NAME:value`.

`unfold()` deals with a quirk of the format. Long lines are split across several lines, and each continuation line starts with a space. This function glues them back together before we read anything.

`unescapeText()` undoes escaping. In the file, a comma inside a title is written `\,` and a newline is written `\n`. We convert those back to normal characters.

`parseDate()` reads dates. Canvas uses three styles. `20261015T045900Z` is an exact time in UTC (the `Z` means UTC), which we convert to your local time. `20261015T045900` without the `Z` is a local time. `20261015` with no time at all is an all-day event. The function returns the date plus an `allDay` flag so the popup can show "All day" instead of a time.

`parseLine()` splits one line into its name, its extra parameters, and its value. For example, `DTSTART;VALUE=DATE:20261012` has the name `DTSTART`, the parameter `VALUE=DATE`, and the value `20261012`.

`splitCourse()` uses a Canvas habit: it puts the course in square brackets at the end of every title, like `Homework 3 [CS 124 FA26]`. A regular expression pulls that out, so we get `title: "Homework 3"` and `course: "CS 124 FA26"`.

`kindFromUid()` works out whether something is an assignment or an event. Canvas gives every item a unique ID (`UID`) such as `event-assignment-12345` or `event-calendar-event-678`, so we check which word appears.

`parseIcs()` is the main function and the only one other files use (that's why it says `export`). It reads the file line by line. When it sees `BEGIN:VEVENT` it starts a new empty event, fills in fields as it reads each line, and when it hits `END:VEVENT` it saves the finished event to a list. At the end it sorts everything by date.

We wrote this ourselves instead of using a library because Manifest V3 doesn't allow loading code from the internet, and our needs are small enough that about 100 lines covers them.

---

## background.js (the service worker)

This runs behind the scenes, separate from the popup. In Manifest V3 it's called a **service worker**: Chrome starts it when something needs to happen and shuts it down when it's idle.

`refresh()` is the core. It reads the saved feed link from storage, downloads the file with `fetch()`, checks it really is a calendar (it should contain `BEGIN:VCALENDAR`), runs it through `parseIcs()`, and saves the events along with the time of the update. If anything fails, such as a bad link or no internet, it saves the error message so the popup can show it.

`updateBadge()` counts how many items are due in the next 24 hours and puts that number on the toolbar icon in Illinois orange. If nothing is due, the badge is blank.

The listeners at the bottom decide *when* refreshing happens. `onInstalled` runs once when the extension is installed: it sets a repeating 30-minute alarm and refreshes right away. `onStartup` refreshes when Chrome opens. `onAlarm` refreshes every time the 30-minute alarm goes off. `onMessage` lets the popup ask for a refresh (when you press ↻ or save a new link). The `return true` keeps the line open so the background can answer after the download finishes.

---

## shared.js

Small helpers that both the popup and the planner use, kept in one place so they always behave the same.

`upcoming()` keeps only events that haven't passed yet and fall within the next N days. `todayKey()` turns today's date into text like `2026-10-10`, which the planner uses to tell whether a saved plan is from today.

`shortCourse()` cleans up course names by dropping the term code, so `CS 124 FA26` becomes `CS 124`. `courseColor()` gives every class its own color by turning the name into a number and using it as a hue on the color wheel. The same class always gets the same color.

`groupByCourse()` is what makes the "sorted by class" view. It puts each event into a bucket for its class, then orders the classes so the one with the soonest due date comes first.

`dueLabel()` makes the friendly due text ("Today, 11:59 PM", "Tomorrow", "Thu, Oct 15, 11:59 PM"), and `isSoon()` says whether something is due within 24 hours, which we use for the orange highlight.

---

## popup.html and popup.css

The popup has a header with refresh ↻ and settings ⚙, then one of two sections. The **setup** section explains how to find your feed link in Canvas and has a box to paste it. The **main** section has the big orange **Plan my day ↗** button, the filters ("This week", "30 days", "Assignments only"), and the list.

The CSS turns each class into a white card with a colored stripe on top in that class's color. Inside, each assignment is a row with the title on the left and the due date on the right. Anything due within 24 hours gets a light orange background and orange due text.

---

## popup.js

`init()` runs when the popup opens. If no feed link is saved yet it shows setup, otherwise the list.

`render()` loads events from storage, filters them with `upcoming()` and the "Assignments only" box, groups them with `groupByCourse()`, and builds one card per class with `renderCourse()`. `renderItem()` builds each row. If Canvas gave a link, clicking the row opens the assignment. We set text with `textContent` instead of raw HTML so an odd assignment title can't break the page.

The **Plan my day** button opens `planner.html` in a new tab with `chrome.tabs.create`. The **Save** handler cleans up the pasted link (`webcal:` becomes `https:`), checks it looks like a Canvas feed, saves it, and refreshes right away so you find out immediately if it's wrong.

---

## planner.html and planner.css

The full-tab page. It has two columns. On the left are **1. Pick what you'll work on today** (Canvas assignments grouped by class) and **2. Add your own tasks** (a small form). On the right are **3. Make the schedule** (start time, end time, break style, an "anything else?" notes box, and the button), and **Today's schedule**, the timeline that appears after you generate. A **Gemini settings** panel at the top is where you paste your API key.

In the timeline, work blocks are orange, breaks are green, and fixed events like lectures are navy. Checking a block off fades it and crosses it out. On a narrow window the two columns stack.

---

## planner.js

Everything about today's plan lives in one object called `plan`, saved in storage under `planner`. It holds what you picked, your manual tasks, your day settings, the generated schedule, and which blocks you've checked off. `freshPlan()` makes a new one. On a new day the planner starts fresh but remembers your start/end time and break style.

`renderAssignments()` and `renderPick()` draw step 1. Ticking an assignment adds it to `plan.picks` and reveals two inputs: **how much** you'll do today ("finish it", "Q1–3") and **how long** you think it'll take.

The **Add** form and `renderManual()` handle step 2. Manual tasks get the class "Personal" if you leave that blank, and the × removes one.

`collectTasks()` combines your picked assignments and manual tasks into one clean list, with title, class, how much, minutes, and due date. `fixedEventsToday()` finds Canvas events with a set time today (like an exam or office hours) so the schedule works around them.

The **Make my schedule** handler builds the input for the scheduler. It never starts earlier than the current time, rounded up to 5 minutes. If you saved a Gemini key it asks Gemini; otherwise, or if Gemini fails, it uses the built-in scheduler, so you always get a plan. `renderSchedule()` draws the timeline, and `clock()` converts `14:30` into `2:30 PM`.

`askGemini()` decides which Gemini model to use. If the model setting is "auto" (the default), it uses the model it found last time, or asks Google for the newest one. If Google says that model was retired, it looks up the newest one again and retries once, so the extension keeps working when Google retires old models.

At the bottom, the settings panel saves your key and model name, and a storage listener redraws the assignments if the background refreshes the Canvas data while the tab is open.

---

## scheduler.js

This is where the schedule gets made.

`BREAK_STYLES` lists the three options: Pomodoro (25/5), standard (50/10), and deep work (90/15). `toMinutes()` and `toHHMM()` convert between `"14:30"` and the number of minutes since midnight (870), because times are much easier to add and compare as plain numbers.

`buildPrompt()` writes the instructions for Gemini: the time window, the break style, to work around fixed events, to do earlier due dates first, to split long tasks, and to write a note for each block based on your "how much" goal. Your tasks and events go in as JSON.

`pickModel()` asks Google's API for the list of models your key can use, and picks the newest stable Flash model (for example `gemini-3.8-flash` over `gemini-2.5-flash`). It skips the "lite" versions and the previews. We do this instead of hardcoding a model name because Google retires old models, which is exactly what broke the first version.

`geminiSchedule()` sends that prompt to Gemini's API. The important trick is `RESPONSE_SCHEMA`: we tell Gemini the exact JSON shape we want back (a summary plus a list of blocks with start, end, title, and kind), so we get data we can display directly instead of a paragraph we'd have to pick apart. `cleanSchedule()` then throws out any malformed blocks and sorts the rest, so one bad answer can't break the page.

`localSchedule()` is the no-AI backup. It walks through the day from your start time. Fixed events are placed first, then it fills the gaps with your tasks in due-date order, cutting work into blocks of the chosen length with a break after each. If a gap before the next event is under 10 minutes it skips ahead. Anything that doesn't fit is listed in the summary.

---

## README.md

Short instructions for loading the extension in Chrome and a short summary of how it works.
