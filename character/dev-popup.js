// Dev-only popup that fakes what the session page and background worker will send.

const DEMOS = {
  nudge: {
    state: 'nudge',
    text: "Psst! Looks like we wandered off. Back to the essay?",
    buttons: [{ label: "Let's go", action: 'back_to_work' }],
  },
  breakSuggestion: {
    state: 'breakSuggestion',
    text: "You've reached for your phone a few times. Want to take a quick break?",
    buttons: [
      { label: 'Take a break', action: 'take_break' },
      { label: "I'm good", action: 'dismiss' },
    ],
  },
  celebrate: {
    state: 'celebrate',
    text: 'You did it! 90 focused minutes. 🎉',
  },
};

const status = document.getElementById('status');

document.querySelectorAll('[data-session]').forEach((button) => {
  button.onclick = async () => {
    await chrome.storage.local.set({ sessionActive: button.dataset.session === 'true', breakEndsAt: null });
    status.textContent = button.dataset.session === 'true' ? 'Session started' : 'Session ended';
  };
});

document.getElementById('test-break').onclick = async () => {
  await chrome.storage.local.set({ sessionActive: true, breakEndsAt: Date.now() + 15_000 });
  status.textContent = 'Break started';
};

document.querySelectorAll('[data-demo]').forEach((button) => {
  button.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_CHARACTER', ...DEMOS[button.dataset.demo] });
      status.textContent = 'Sent!';
    } catch {
      status.textContent = "This tab can't show the dog. Refresh it, or try a normal website.";
    }
  };
});
