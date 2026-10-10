// Character overlay: the pixel dog plus a speech bubble, pinned to the bottom-right
// corner of any website. Rendered inside a Shadow DOM so site CSS can't touch it.
// During a break the dog leaves the corner to play fetch along the bottom of the page.

import { createPixelDog, spriteSvg, SIZE } from './pixelDog.js';

const HOST_ID = 'study-buddy-overlay';
const AUTO_HIDE_MS = 8000; // bubbles without buttons disappear after this
const PET_MS = 2400; // wake-up + happy wiggle when the dog is clicked

const BREAK_PRESETS = [3, 5, 10, 15];
const DEFAULT_BREAK_MINUTES = 5;
const MAX_BREAK_MINUTES = 60;

const DOG_SCALE = 3;
const DOG_WIDTH = SIZE.width * DOG_SCALE;
const DOG_HEIGHT = SIZE.height * DOG_SCALE;
const BALL_SCALE = 5;
const BALL_SIZE = 4 * BALL_SCALE;
const EDGE = 16; // gap between the dog and the edge of the screen
const RUN_SPEED = 300; // px per second, matched to the gallop so the paws don't slide much
const THROW_PAUSE_MS = 1500; // how long the ball sits by the dog before the next throw
// Center of the ball in the dog's mouth: from the dog's left edge, and up from its bottom.
const MOUTH_RIGHT = 31 * DOG_SCALE;
const MOUTH_LEFT = DOG_WIDTH - MOUTH_RIGHT;
const MOUTH_UP = (SIZE.height - 15) * DOG_SCALE;
// The sitting dog's left paw, so the dropped ball lands right beside it.
const SITTING_LEFT = 10 * DOG_SCALE;

const STYLE = `
:host { all: initial; }
.overlay {
  position: fixed;
  right: ${EDGE}px;
  bottom: ${EDGE}px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #3b2a1e;
  transform: translateX(calc(100% + 24px));
  transition: transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  pointer-events: none;
}
.overlay.open { transform: translateX(0); }
.overlay.open .dog, .overlay.open .bubble { pointer-events: auto; }

.bubble {
  position: relative;
  max-width: 260px;
  padding: 12px 14px;
  margin-right: 24px;
  background: #fffaf2;
  border: 3px solid #5a3a22;
  border-radius: 6px;
  box-shadow: 4px 4px 0 rgba(90, 58, 34, 0.25);
  animation: pop 0.2s ease-out;
}
.bubble[hidden] { display: none; }
.bubble::after {
  content: '';
  position: absolute;
  right: 28px;
  bottom: -11px;
  width: 14px;
  height: 14px;
  background: #fffaf2;
  border-right: 3px solid #5a3a22;
  border-bottom: 3px solid #5a3a22;
  transform: rotate(45deg);
}
.bubble.no-tail { margin-right: 0; }
.bubble.no-tail::after { display: none; }
.heading { margin: 0 18px 4px 0; font-size: 12px; font-weight: 700; color: #c94f3d; }
.heading:empty { display: none; }
.text { margin: 0 18px 0 0; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
.actions:empty { display: none; }
button { font: inherit; cursor: pointer; }
.action {
  padding: 5px 10px;
  border: 2px solid #5a3a22;
  border-radius: 4px;
  background: #fff;
  color: #5a3a22;
  font-weight: 600;
}
.action:first-child { background: #5a3a22; color: #fff; }
.action:hover { filter: brightness(1.08); }
.close {
  position: absolute;
  top: 4px;
  right: 6px;
  padding: 0 4px;
  border: none;
  background: none;
  color: #7a6656;
  font-size: 18px;
  line-height: 1;
}
button:focus-visible, input:focus-visible { outline: 2px solid #4fa3a5; outline-offset: 2px; }

.chips { display: flex; gap: 6px; margin-top: 10px; }
.chip {
  padding: 3px 7px;
  border: 2px solid #c9b29a;
  border-radius: 999px;
  background: #fff;
  color: #5a3a22;
  font-size: 12px;
  white-space: nowrap;
}
.chip[aria-pressed='true'] { border-color: #5a3a22; background: #f6dfb6; font-weight: 600; }
.custom { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; }
.custom input {
  width: 52px;
  padding: 3px 6px;
  border: 2px solid #c9b29a;
  border-radius: 4px;
  font: inherit;
  color: #3b2a1e;
  background: #fff;
}

.dog { padding: 0; border: none; background: none; }

.pill {
  margin-right: 8px;
  padding: 5px 12px;
  border: 3px solid #5a3a22;
  border-radius: 999px;
  background: #fffaf2;
  color: #3b2a1e;
  box-shadow: 3px 3px 0 rgba(90, 58, 34, 0.25);
  font: 700 15px/1.2 ui-monospace, 'Cascadia Mono', Menlo, monospace;
  animation: pop 0.2s ease-out;
}
.pill[hidden] { display: none; }
.pill:hover { background: #f6dfb6; }
.overlay.open .pill { pointer-events: auto; }

/* Break screen: the page dims and a big timer sits in the middle. */
.dim {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  background: rgba(24, 16, 10, 0.6);
  animation: fade 0.3s ease-out;
}
.break-card {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 2147483646;
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 28px 44px 24px;
  text-align: center;
  background: #fffaf2;
  border: 4px solid #5a3a22;
  border-radius: 10px;
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.3);
  font: 16px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #3b2a1e;
  transform: translate(-50%, -50%);
  animation: card-in 0.25s ease-out;
}
.dim[hidden], .break-card[hidden] { display: none; }
.break-title { margin: 0; font-size: 20px; font-weight: 700; }
.break-timer {
  margin: 6px 0 2px;
  font: 700 clamp(56px, 14vw, 96px)/1.05 ui-monospace, 'Cascadia Mono', Menlo, monospace;
  letter-spacing: 2px;
}
.break-hint { margin: 0; font-size: 14px; color: #7a6656; }
.break-card .actions { justify-content: center; margin-top: 18px; }
.break-card .close { top: 8px; right: 12px; font-size: 22px; }

/* Full-screen layer the dog runs around in during breaks, above the dimmed page. */
.field { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; overflow: hidden; }
.field .dog { position: absolute; bottom: ${EDGE}px; pointer-events: auto; }
.ball { position: absolute; bottom: ${EDGE}px; line-height: 0; }
.ball[hidden] { display: none; }
.ball.ready { animation: ball-wiggle 0.5s ease-in-out infinite alternate; }

/* Full-screen alert (e.g. phone detected): flashing red, big dog, big message. */
.alert-screen {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(201, 79, 61, 0.9);
  font: 16px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #3b2a1e;
  animation: alert-flash 1.2s ease-in-out infinite;
}
.alert-screen[hidden] { display: none; }
.alert-screen.happy { background: rgba(47, 127, 129, 0.92); animation: none; }
.alert-card {
  box-sizing: border-box;
  width: 100%;
  max-width: 540px;
  padding: 28px 40px 32px;
  text-align: center;
  background: #fffaf2;
  border: 4px solid #5a3a22;
  border-radius: 10px;
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.3);
  animation: pop 0.25s ease-out;
}
.alert-dog { display: flex; justify-content: center; }
.alert-label { margin: 12px 0 4px; font-size: 16px; font-weight: 700; color: #c94f3d; }
.happy .alert-label { color: #2f7f81; }
.alert-message { margin: 0 0 22px; font-size: clamp(24px, 4.5vw, 34px); font-weight: 700; line-height: 1.2; }
.alert-card .actions { justify-content: center; flex-wrap: wrap; margin-top: 0; }
.alert-card .action { padding: 10px 20px; font-size: 16px; }

@keyframes alert-flash {
  0%, 100% { background: rgba(201, 79, 61, 0.9); }
  50% { background: rgba(160, 52, 38, 0.94); }
}
@keyframes pop {
  from { transform: scale(0.85); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes fade {
  from { opacity: 0; }
}
@keyframes card-in {
  from { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
}
@keyframes ball-wiggle {
  from { transform: translateY(0); }
  to { transform: translateY(-6px); }
}
@media (prefers-reduced-motion: reduce) {
  .overlay { transition: none; }
  .bubble, .ball.ready, .pill, .dim, .break-card, .alert-screen, .alert-card { animation: none; }
}
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const formatTime = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Mounts the overlay (replacing any previous one on the page) and returns its controls.
//   onResponse(action, data): the user answered a bubble ('take_break' comes with { minutes }).
//   requestBreak(endsAt) / requestEndBreak(): override these to sync a break across tabs
//     (e.g. through chrome.storage); then call startBreak/endBreak on every tab.
//     By default the break just runs on this page.
export function createOverlay(options = {}) {
  const onResponse = options.onResponse ?? (() => {});
  const requestBreak = options.requestBreak ?? ((endsAt) => startBreak(endsAt));
  const requestEndBreak = options.requestEndBreak ?? (() => endBreak());

  document.getElementById(HOST_ID)?.remove();

  const host = el('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  // Keep typing in the break input from triggering site shortcuts (e.g. YouTube's "k").
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (e) => e.stopPropagation());

  const style = el('style');
  style.textContent = STYLE;

  const field = el('div', 'field');
  const ball = el('div', 'ball');
  ball.hidden = true;
  ball.setAttribute('aria-hidden', 'true');
  ball.innerHTML = spriteSvg('ball', BALL_SCALE);
  field.append(ball);

  const overlay = el('div', 'overlay');
  const bubble = el('div', 'bubble');
  bubble.hidden = true;
  bubble.setAttribute('role', 'status');
  const heading = el('p', 'heading');
  const text = el('p', 'text');
  const extra = el('div');
  const actions = el('div', 'actions');
  const close = el('button', 'close', '×');
  close.setAttribute('aria-label', 'Dismiss');
  bubble.append(heading, text, extra, actions, close);

  const dogButton = el('button', 'dog');
  dogButton.setAttribute('aria-label', 'Study buddy');
  // Holds the dog's place in the corner while it's out playing, so the bubble stays put.
  const dogSpot = el('div');
  dogSpot.style.width = `${DOG_WIDTH}px`;
  dogSpot.style.height = `${DOG_HEIGHT}px`;

  // Minimized break timer: a small countdown that reopens the full bubble when clicked.
  const pill = el('button', 'pill');
  pill.hidden = true;
  pill.setAttribute('aria-label', 'Show break timer');

  overlay.append(bubble, pill, dogButton);

  const dim = el('div', 'dim');
  dim.hidden = true;
  const card = el('div', 'break-card');
  card.hidden = true;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Break timer');
  const breakTimer = el('p', 'break-timer');
  const minimize = el('button', 'close', '–');
  minimize.setAttribute('aria-label', 'Minimize break timer');
  const endEarly = el('button', 'action', 'End break early');
  const cardActions = el('div', 'actions');
  cardActions.append(endEarly);
  card.append(el('p', 'break-title', 'Break time! 🐾'), breakTimer, el('p', 'break-hint'), cardActions, minimize);

  const alertScreen = el('div', 'alert-screen');
  alertScreen.hidden = true;
  alertScreen.setAttribute('role', 'alertdialog');
  const alertCard = el('div', 'alert-card');
  const alertDogSlot = el('div', 'alert-dog');
  const alertLabel = el('p', 'alert-label');
  const alertMessage = el('p', 'alert-message');
  const alertActions = el('div', 'actions');
  alertCard.append(alertDogSlot, alertLabel, alertMessage, alertActions);
  alertScreen.append(alertCard);

  // Stacking: dimmed page < corner overlay < timer card < running dog and ball < full-screen alert.
  shadow.append(style, dim, overlay, card, field, alertScreen);
  document.documentElement.appendChild(host);

  const dog = createPixelDog(dogButton, { scale: DOG_SCALE });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let hideTimer = null;
  let breakEndsAt = null;
  let breakTick = null;
  let breakOver = false;
  let playToken = null; // replaced whenever play starts or stops, cancelling older loops
  let dogX = 0;
  let dogY = EDGE; // distance from the bottom of the screen
  let alertDog = null; // the big dog on the full-screen alert, only while it's showing
  let alertTimer = null;

  // ---- Full-screen alert ----

  function showAlert({ heading: title = '', text: message = '', buttons = [] }) {
    clearTimeout(alertTimer);
    alertScreen.classList.remove('happy');
    alertScreen.setAttribute('aria-label', title || message);
    alertLabel.textContent = title;
    alertMessage.textContent = message;
    alertActions.replaceChildren(
      ...buttons.slice(0, 2).map(({ label, action }) => {
        const button = el('button', 'action', label);
        button.onclick = () => {
          hideAlert();
          respond(action);
        };
        return button;
      }),
    );
    alertScreen.hidden = false;
    alertDog ??= createPixelDog(alertDogSlot, { scale: 6 });
    alertDog.setState('nudge');
    alertActions.querySelector('button')?.focus();
    // The corner dog is awake too.
    hideBubble();
    overlay.classList.add('open');
    dog.setState('nudge');
  }

  // Back on task: the alert turns happy for a moment, then goes away.
  function cheerAlert(message) {
    clearTimeout(alertTimer);
    alertScreen.classList.add('happy');
    alertLabel.textContent = 'Focused again';
    alertMessage.textContent = message;
    alertActions.replaceChildren();
    alertDog.setState('celebrate');
    alertTimer = setTimeout(() => {
      hideAlert();
      dog.setState('sleeping');
    }, 1600);
  }

  function hideAlert() {
    clearTimeout(alertTimer);
    alertScreen.hidden = true;
    alertDog?.destroy();
    alertDog = null;
  }

  // ---- Speech bubble ----

  function showBubble({ message, label = '', body = [], buttons = [], tail = true, autoHide = false }) {
    clearTimeout(hideTimer);
    heading.textContent = label;
    text.textContent = message;
    extra.replaceChildren(...body);
    actions.replaceChildren(
      ...buttons.slice(0, 2).map(({ label, onClick }) => {
        const button = el('button', 'action', label);
        button.onclick = onClick;
        return button;
      }),
    );
    bubble.classList.toggle('no-tail', !tail);
    bubble.hidden = false;
    if (autoHide) hideTimer = setTimeout(hideBubble, AUTO_HIDE_MS);
  }

  function hideBubble() {
    clearTimeout(hideTimer);
    bubble.hidden = true;
    if (!breakEndsAt) dog.setState('sleeping');
  }

  function respond(action, data) {
    hideBubble();
    onResponse(action, data);
  }

  close.onclick = () => (breakOver ? backToWork() : respond('dismiss'));

  dogButton.onclick = () => {
    if (breakEndsAt && !breakOver) return showBreakScreen();
    if (!bubble.hidden) return;
    // Petting the dog: a quick happy wiggle.
    dog.setState('celebrate');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => dog.setState('sleeping'), PET_MS);
  };

  // ---- Break picker and timer ----

  function showBreakPicker() {
    const input = el('input');
    Object.assign(input, { type: 'number', min: 1, max: MAX_BREAK_MINUTES, value: DEFAULT_BREAK_MINUTES });
    input.setAttribute('aria-label', 'Break length in minutes');

    const chips = BREAK_PRESETS.map((minutes) => {
      const chip = el('button', 'chip', `${minutes} min`);
      chip.onclick = () => {
        input.value = minutes;
        syncChips();
      };
      return chip;
    });
    const syncChips = () =>
      chips.forEach((chip, i) => chip.setAttribute('aria-pressed', String(Number(input.value) === BREAK_PRESETS[i])));
    input.oninput = syncChips;
    syncChips();

    const start = () => {
      const minutes = clamp(Math.round(Number(input.value)) || DEFAULT_BREAK_MINUTES, 1, MAX_BREAK_MINUTES);
      onResponse('take_break', { minutes });
      requestBreak(Date.now() + minutes * 60_000);
    };
    input.onkeydown = (e) => e.key === 'Enter' && start();

    const chipRow = el('div', 'chips');
    chipRow.append(...chips);
    const custom = el('label', 'custom');
    custom.append('Custom:', input, 'min');

    showBubble({
      message: 'How long of a break do you want?',
      body: [chipRow, custom],
      buttons: [
        { label: 'Start break', onClick: start },
        { label: 'Not now', onClick: () => respond('dismiss') },
      ],
    });
  }

  card.querySelector('.break-hint').textContent = 'Stretch, grab some water, look away from the screen.';

  endEarly.onclick = () => {
    onResponse('end_break');
    requestEndBreak();
  };

  // Full break screen: dimmed page with the big timer in the middle.
  function showBreakScreen() {
    hideBubble();
    pill.hidden = true;
    dim.hidden = false;
    card.hidden = false;
  }

  // Shrinks the break screen to the corner pill so the page can be used.
  function minimizeBreakScreen() {
    dim.hidden = true;
    card.hidden = true;
    pill.hidden = false;
  }

  function hideBreakScreen() {
    dim.hidden = true;
    card.hidden = true;
    pill.hidden = true;
  }

  minimize.onclick = minimizeBreakScreen;
  pill.onclick = showBreakScreen;

  function updateTimer() {
    const remaining = breakEndsAt - Date.now();
    if (remaining <= 0) return finishBreak();
    breakTimer.textContent = formatTime(remaining);
    pill.textContent = `⏱ ${formatTime(remaining)}`;
  }

  function startBreak(endsAt) {
    if (endsAt === breakEndsAt) return;
    hideAlert();
    clearInterval(breakTick);
    clearTimeout(hideTimer);
    breakEndsAt = endsAt;
    breakOver = false;
    overlay.classList.add('open');
    if (Date.now() >= endsAt) return finishBreak();
    updateTimer();
    showBreakScreen();
    breakTick = setInterval(updateTimer, 1000);
    startPlay();
  }

  // Time's up: the dog comes back to the corner and asks to get back to work.
  async function finishBreak() {
    clearInterval(breakTick);
    breakOver = true;
    hideBreakScreen();
    showBubble({
      message: "Break's over! Ready to get back to it?",
      buttons: [{ label: 'Back to work', onClick: backToWork }],
    });
    await stopPlay('play');
  }

  function backToWork() {
    onResponse('back_to_work');
    requestEndBreak();
  }

  function endBreak({ instant = false } = {}) {
    if (!breakEndsAt) return;
    clearInterval(breakTick);
    breakEndsAt = null;
    breakOver = false;
    hideBreakScreen();
    hideBubble();
    stopPlay('sleeping', { instant });
  }

  // ---- Fetch ----

  // The dog's position is its left edge and its distance from the bottom of the screen.
  const homeX = () => field.clientWidth - EDGE - DOG_WIDTH;
  const maxY = () => Math.max(EDGE, field.clientHeight - EDGE - DOG_HEIGHT);

  function randomSpot() {
    return { x: EDGE + Math.random() * (homeX() - EDGE), y: EDGE + Math.random() * (maxY() - EDGE) };
  }

  function placeDog(x, y) {
    dogX = x;
    dogY = y;
    dogButton.style.left = `${x}px`;
    dogButton.style.bottom = `${y}px`;
  }

  function placeBall(x, bottom = EDGE) {
    ball.style.left = `${x}px`;
    ball.style.bottom = `${bottom}px`;
  }

  // Animates with requestAnimationFrame; resolves early if play was cancelled.
  function animate(duration, token, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        if (token !== playToken) return resolve(false);
        const t = Math.min(1, (now - start) / duration);
        onFrame(t);
        if (t < 1) requestAnimationFrame(step);
        else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  function runTo({ x, y }, token, state = 'run') {
    const fromX = dogX;
    const fromY = dogY;
    const dx = x - fromX;
    const dy = y - fromY;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) return Promise.resolve(token === playToken);
    if (Math.abs(dx) > 4) dog.setFacing(dx > 0 ? 'right' : 'left');
    dog.setState(state);
    return animate((distance / RUN_SPEED) * 1000, token, (t) => placeDog(fromX + dx * t, fromY + dy * t));
  }

  // Ball flies in an arc to (toX, toY), then gives a little bounce where it lands.
  async function throwBall(toX, toY, token) {
    const fromX = parseFloat(ball.style.left);
    const fromY = parseFloat(ball.style.bottom);
    const peak = Math.min(220, field.clientHeight * 0.35);
    ball.classList.remove('ready');
    const arc = (t) => peak * 4 * t * (1 - t);
    const landed = await animate(900, token, (t) =>
      placeBall(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t + arc(t)),
    );
    return landed && animate(300, token, (t) => placeBall(toX, toY + 24 * 4 * t * (1 - t)));
  }

  async function startPlay() {
    const token = (playToken = {});
    if (reducedMotion) return dog.setState('play');

    // Move the dog from the corner into the full-screen field without a visible jump.
    if (dogButton.parentNode !== field) {
      dogButton.replaceWith(dogSpot);
      field.append(dogButton);
      placeDog(homeX(), EDGE);
    }

    while (token === playToken) {
      // Drop the ball next to the dog, wiggle it for a moment, then it gets thrown.
      dog.setFacing('right');
      dog.setState('play');
      placeBall(dogX + SITTING_LEFT - BALL_SIZE - 4, dogY);
      ball.hidden = false;
      ball.classList.add('ready');
      await sleep(THROW_PAUSE_MS);
      if (token !== playToken) return;

      // Pick where the dog will catch up with the ball, then land the ball in its mouth there.
      const target = randomSpot();
      const mouthX = target.x + (target.x < dogX ? MOUTH_LEFT : MOUTH_RIGHT);
      const thrown = throwBall(mouthX - BALL_SIZE / 2, target.y + MOUTH_UP - BALL_SIZE / 2, token);
      await sleep(200);
      const ran = runTo(target, token);
      if (!(await thrown) || !(await ran)) return;

      // Pick it up and bring it back.
      ball.hidden = true;
      if (!(await runTo({ x: homeX(), y: EDGE }, token, 'runWithBall'))) return;
    }
  }

  async function stopPlay(finalState, { instant = false } = {}) {
    const token = (playToken = {});
    ball.hidden = true;
    ball.classList.remove('ready');
    if (dogButton.parentNode === field) {
      if (!instant && !reducedMotion && !(await runTo({ x: homeX(), y: EDGE }, token))) return;
      dog.setFacing('right');
      dogButton.style.left = '';
      dogButton.style.bottom = '';
      dogSpot.replaceWith(dogButton);
    }
    if (token === playToken) dog.setState(finalState);
  }

  // ---- Public controls ----

  function say({ state = 'nudge', heading: title = '', text: message = '', buttons = [], fullscreen = false } = {}) {
    if (breakEndsAt) return; // no nudges during a break
    if (fullscreen) return showAlert({ heading: title, text: message, buttons });
    overlay.classList.add('open');
    dog.setState(state);
    showBubble({
      message,
      label: title,
      buttons: buttons.map(({ label, action }) => ({
        label,
        onClick: action === 'take_break' ? showBreakPicker : () => respond(action),
      })),
      autoHide: !buttons.length,
    });
  }

  return {
    open() {
      overlay.classList.add('open');
    },
    close() {
      endBreak({ instant: true });
      hideAlert();
      hideBubble();
      overlay.classList.remove('open');
    },
    // heading: optional small line above the text (e.g. "📱 Phone detected").
    // fullscreen: true covers the whole page (used when the phone is detected).
    // buttons: [{ label: 'Take a break', action: 'take_break' }, ...] (up to two).
    // A 'take_break' button opens the break-length picker instead of closing the bubble.
    say,
    hideBubble,
    // Opens the break-length picker right away (or the break screen if one is running).
    pickBreak() {
      if (breakEndsAt) return showBreakScreen();
      overlay.classList.add('open');
      dog.setState('breakSuggestion');
      showBreakPicker();
    },
    // The user got back on task: the dog cheers if it was in the middle of telling them off.
    cheer(message) {
      if (!alertScreen.hidden) cheerAlert(message);
      else if (!bubble.hidden && !breakEndsAt) say({ state: 'celebrate', text: message });
    },
    startBreak,
    endBreak,
    destroy() {
      playToken = {};
      clearTimeout(hideTimer);
      clearInterval(breakTick);
      dog.destroy();
      host.remove();
    },
  };
}
