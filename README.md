# CodeAda-Study-Buddy

StudyBuddy is a Chrome extension with a pixel dog study buddy. It watches your webcam (on your laptop only, nothing is uploaded) during focus sessions, and the dog nudges you when you pick up your phone or look away, suggests breaks, and plays fetch while you rest.

## Run it

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and pick the `studybuddy-extension 2` folder.
3. StudyBuddy opens in a new tab. Later, open it again from the dog icon in the toolbar: **Open StudyBuddy**.
4. Start a focus session, then switch to any website to study. The dog naps in the corner and wakes up when you get distracted.

No server is needed: the whole app is part of the extension. The AI model files download from Google the first time you start a session.

After pulling new changes, click the reload arrow on StudyBuddy in `chrome://extensions` and refresh open tabs.

## Where things are

Everything lives in `studybuddy-extension 2/`:

- `app.html`, `styles.css`, `js/`: the StudyBuddy app (to-dos, schedule, Canvas calendar, focus sessions, camera detection)
- `background.js`: the extension's "brain" that passes prompts between the app and the dog on other tabs
- `dog.js`, `dog-overlay.js`, `pixelDog.js`: the pixel dog on every website (alerts, breaks, fetch)
- `site-blocker.js`: blocks distracting sites during a session
- `popup.html`, `popup.js`: the toolbar popup (status, breaks, blocked sites)
- `vendor/`: TensorFlow.js and MediaPipe, copied in because extensions can't load scripts from the internet

For development you can also serve the repo (`python -m http.server 8000`) and open http://localhost:8000; it redirects to the app.
