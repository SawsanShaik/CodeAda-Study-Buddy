// Content script: puts the pixel dog in the corner of every website.
// The rest of the extension (the "brain") prompts the dog through:
//
// - chrome.storage.local `sessionActive` (true/false): the dog slides in and sleeps in
//   the corner on every tab while a focus session runs, and leaves when it ends.
//   background.js sets this when the web app starts or ends a session.
// - chrome.storage.local `breakEndsAt` (timestamp in ms, or null): a break is running
//   until that time. Every tab shows the dimmed countdown and the dog plays fetch.
// - Messages sent to a tab:
//     SHOW_CHARACTER { state, heading?, text, buttons? }  makes the dog talk
//       state: 'nudge' | 'breakSuggestion' | 'celebrate' | 'idle' | 'sleeping'
//       buttons: [{ label, action }], up to two. A 'take_break' button opens the
//       break-length picker.
//     focused { message }  the user got back on task: the dog cheers if it was talking
// - When the user answers, the dog sends CHARACTER_RESPONSE { action, ...data } to
//   background.js. action: the button's action, 'dismiss' (×), 'take_break' (with
//   minutes), 'end_break' (ended early), or 'back_to_work' (break timer finished).
//
// Content scripts can't be ES modules, so the overlay is loaded with a dynamic import.

(() => {
  if (window.top !== window) return; // only in the main page, not inside iframes
  if (window.__studybuddyDog) return; // already running on this page
  window.__studybuddyDog = true;

  const ready = import(chrome.runtime.getURL('dog-overlay.js')).then(({ createOverlay }) =>
    createOverlay({
      onResponse(action, data) {
        chrome.runtime.sendMessage({ type: 'CHARACTER_RESPONSE', action, ...data }).catch(() => {
          // The extension was reloaded; nothing to tell.
        });
      },
      requestBreak: (endsAt) => chrome.storage.local.set({ breakEndsAt: endsAt }),
      requestEndBreak: () => chrome.storage.local.set({ breakEndsAt: null }),
    }),
  );

  // Registered right away so prompts sent while the dog is still loading aren't lost.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'SHOW_CHARACTER') ready.then((dog) => dog.say(message));
    if (message?.type === 'focused') {
      ready.then((dog) => dog.talking && dog.say({ state: 'celebrate', text: message.message }));
    }
  });

  ready.then(async (dog) => {
    const applySession = (active) => (active ? dog.open() : dog.close());
    const applyBreak = (endsAt) => (endsAt ? dog.startBreak(endsAt) : dog.endBreak());

    const { sessionActive, breakEndsAt } = await chrome.storage.local.get(['sessionActive', 'breakEndsAt']);
    applySession(sessionActive);
    if (sessionActive) applyBreak(breakEndsAt);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('sessionActive' in changes) applySession(changes.sessionActive.newValue);
      if ('breakEndsAt' in changes) applyBreak(changes.breakEndsAt.newValue);
    });
  });
})();
