// Content script: shows the character overlay on every website.
//
// How the rest of the extension talks to it:
// - chrome.storage.local `sessionActive` (true/false): the dog slides in and sleeps in
//   the corner on every tab while a session is running, and slides out when it ends.
// - chrome.storage.local `breakEndsAt` (timestamp in ms, or null): a break is running
//   until that time. Every tab shows the countdown and the dog plays fetch.
//   The overlay sets this itself when the user starts a break, and clears it when they
//   end it early or click "Back to work".
// - SHOW_CHARACTER message sent to a tab: { type, state, text, buttons? }
//   state: 'nudge' | 'breakSuggestion' | 'celebrate' | 'sleeping'
//   buttons: [{ label, action }], up to two. A 'take_break' button opens the
//   break-length picker.
// - When the user answers, it sends CHARACTER_RESPONSE: { type, action, ...data }
//   action: the clicked button's action, 'dismiss' (×), 'take_break' (with minutes),
//   'end_break' (ended early), or 'back_to_work' (after the break timer finished).
//
// Content scripts can't be ES modules, so the overlay is loaded with a dynamic import.

const MESSAGES = {
  SHOW_CHARACTER: 'SHOW_CHARACTER',
  CHARACTER_RESPONSE: 'CHARACTER_RESPONSE',
};

(async () => {
  const { createOverlay } = await import(chrome.runtime.getURL('overlay.js'));

  const overlay = createOverlay({
    onResponse(action, data) {
      console.log('[Study Buddy] character response:', action, data ?? '');
      chrome.runtime.sendMessage({ type: MESSAGES.CHARACTER_RESPONSE, action, ...data }).catch(() => {
        // Nothing is listening yet (no background worker in the dev build).
      });
    },
    requestBreak: (endsAt) => chrome.storage.local.set({ breakEndsAt: endsAt }),
    requestEndBreak: () => chrome.storage.local.set({ breakEndsAt: null }),
  });

  const applySession = (active) => (active ? overlay.open() : overlay.close());
  const applyBreak = (endsAt) => (endsAt ? overlay.startBreak(endsAt) : overlay.endBreak());

  const { sessionActive, breakEndsAt } = await chrome.storage.local.get(['sessionActive', 'breakEndsAt']);
  applySession(sessionActive);
  if (sessionActive) applyBreak(breakEndsAt);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('sessionActive' in changes) applySession(changes.sessionActive.newValue);
    if ('breakEndsAt' in changes) applyBreak(changes.breakEndsAt.newValue);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MESSAGES.SHOW_CHARACTER) overlay.say(message);
  });
})();
