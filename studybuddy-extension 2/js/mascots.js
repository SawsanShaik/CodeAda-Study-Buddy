// =========================================================
// The mascot: the pixel dog (drawn in the extension's pixelDog.js
// so the app and the extension always show the same dog),
// what it says, and saving the user's name and messages for it.
// =========================================================
import { createPixelDog, dogSvg } from "../pixelDog.js";

export const DEFAULT_MESSAGES = {
  phone:  ["Phone down! Your future self says thanks.", "Caught you scrolling 👀 Back to it!", "That phone can wait. Your goals can't."],
  down:   ["Looking down a lot… is that your phone? 👀", "Eyes up! Your work misses you.", "Is something on your lap more interesting than your goals?"],
  turned: ["Eyes back on your work! You're doing great.", "Whatever's over there can wait 😉", "Back to the screen, you've got this!"],
  away:   ["Where did you go? I'll be right here.", "Come back when you're ready! 🪑", "Taking a break? Don't forget to come back!"],
  sleepy: ["Feeling sleepy? Maybe it's time for a break ☕", "Stay with me! Want to stretch for a minute?", "Your eyes look tired. Water break? 💧"],
  back:   ["Welcome back! 🎉", "Yay, you're back! Let's go!", "Back on track, nice!"],
};

export const MESSAGE_LABELS = {
  phone: "When it sees your phone",
  down: "When you look down",
  turned: "When you look away",
  away: "When you leave",
  sleepy: "When your eyes close",
  back: "When you come back",
};

export const PROBLEM_LABELS = {
  phone: "📱 Phone detected",
  down: "👇 Looking down",
  turned: "↪️ Looking away",
  away: "🚶 You left",
  sleepy: "😴 Eyes closed",
};

const DEFAULT_MASCOT = { name: "Pip", messages: DEFAULT_MESSAGES };
const KEY = "studybuddy-mascot";

// How each mood looks on the dog.
const DOG_STATES = { calm: "idle", alert: "nudge", happy: "celebrate" };

export function defaultMascot() {
  return JSON.parse(JSON.stringify(DEFAULT_MASCOT));
}

export function loadMascot() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { name: saved.name || DEFAULT_MASCOT.name, messages: { ...DEFAULT_MESSAGES, ...(saved.messages || {}) } };
  } catch { /* storage unavailable: use the default */ }
  return defaultMascot();
}

export function saveMascot(mascot) {
  try { localStorage.setItem(KEY, JSON.stringify(mascot)); return true; }
  catch { return false; }
}

export function pickMessage(mascot, type) {
  const list = (mascot.messages[type] || []).filter(Boolean);
  const fallback = DEFAULT_MESSAGES[type];
  const options = list.length ? list : fallback;
  return options[Math.floor(Math.random() * options.length)];
}

// The dog as an SVG string (used to send it to the Chrome extension)
export function mascotMarkup(mascot, mood = "calm") {
  return dogSvg(DOG_STATES[mood] || "idle", mascot.name);
}

// Draw the animated dog into a container. mood = "calm" | "alert" | "happy"
const dogs = new WeakMap();
export function renderMascot(slot, mascot, mood = "calm") {
  slot.dataset.mood = mood;
  slot.setAttribute("aria-label", mascot.name);
  let dog = dogs.get(slot);
  if (!dog) {
    slot.replaceChildren();
    dog = createPixelDog(slot, { scale: 6 });
    dogs.set(slot, dog);
  }
  dog.setState(DOG_STATES[mood] || "idle");
}
