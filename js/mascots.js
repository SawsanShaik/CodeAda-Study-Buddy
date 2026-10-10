// =========================================================
// Mascots: the built-in characters, what they say, and saving
// a user's custom mascot.
// To add a new built-in character: write a draw function like
// drawBlob below and add it to the CHARACTERS list.
// =========================================================

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

const DEFAULT_MASCOT = { name: "Pip", kind: "blob", color: "#6c4cf1", image: null, messages: DEFAULT_MESSAGES };
const KEY = "studybuddy-mascot";

export function defaultMascot() {
  return JSON.parse(JSON.stringify(DEFAULT_MASCOT));
}

export function loadMascot() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...defaultMascot(), ...saved, messages: { ...DEFAULT_MESSAGES, ...(saved.messages || {}) } };
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

// The mascot as an HTML string (used to send it to the Chrome extension)
export function mascotMarkup(mascot, mood = "calm") {
  if (mascot.kind === "custom" && mascot.image) return `<img src="${mascot.image}" alt="" style="width:100%;height:100%;object-fit:contain">`;
  return (CHARACTERS[mascot.kind] || drawBlob)(mascot.color, mood);
}

// Draw the mascot into a container. mood = "calm" | "alert" | "happy"
export function renderMascot(slot, mascot, mood = "calm") {
  slot.dataset.mood = mood;
  if (mascot.kind === "custom" && mascot.image) {
    slot.innerHTML = "";
    const img = document.createElement("img");
    img.src = mascot.image;
    img.alt = mascot.name;
    slot.appendChild(img);
    return;
  }
  const draw = CHARACTERS[mascot.kind] || drawBlob;
  slot.innerHTML = draw(mascot.color, mood);
}

// ---------- Shared face parts ----------
const INK = "#23164a";

function eyes(lx, rx, y, r, mood) {
  if (mood === "happy") {
    return [lx, rx].map(x => `<path d="M${x - r} ${y + 4} Q${x} ${y - r} ${x + r} ${y + 4}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`).join("");
  }
  const white = mood === "alert" ? r * 1.25 : r;
  const pupil = mood === "alert" ? r * 0.32 : r * 0.55;
  const dy = mood === "alert" ? 0 : r * 0.2;
  let out = [lx, rx].map(x =>
    `<circle cx="${x}" cy="${y}" r="${white}" fill="#fff"/>` +
    `<circle cx="${x}" cy="${y + dy}" r="${pupil}" fill="${INK}"/>` +
    `<circle cx="${x + pupil * 0.35}" cy="${y + dy - pupil * 0.4}" r="${pupil * 0.3}" fill="#fff"/>`
  ).join("");
  if (mood === "alert") {
    out += `<path d="M${lx - r} ${y - white - 10} L${lx + r * 0.6} ${y - white - 2}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    out += `<path d="M${rx + r} ${y - white - 10} L${rx - r * 0.6} ${y - white - 2}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  }
  return out;
}

function mouth(x, y, mood) {
  if (mood === "alert") return `<ellipse cx="${x}" cy="${y + 6}" rx="11" ry="14" fill="${INK}"/>`;
  if (mood === "happy") return `<path d="M${x - 20} ${y} Q${x} ${y + 30} ${x + 20} ${y} Z" fill="${INK}"/><path d="M${x - 9} ${y + 12} Q${x} ${y + 22} ${x + 9} ${y + 12} Z" fill="#ff8fa3"/>`;
  return `<path d="M${x - 14} ${y} Q${x} ${y + 14} ${x + 14} ${y}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
}

function cheeks(lx, rx, y) {
  return `<circle cx="${lx}" cy="${y}" r="11" fill="#ff8fa3" opacity=".55"/><circle cx="${rx}" cy="${y}" r="11" fill="#ff8fa3" opacity=".55"/>`;
}

// ---------- Characters (all drawn on a 200 x 200 canvas) ----------
function drawBlob(color, mood) {
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Blob mascot">
    <ellipse cx="100" cy="190" rx="58" ry="7" fill="${INK}" opacity=".12"/>
    <path d="M100 24 C152 24 184 64 182 114 C180 162 148 186 100 186 C52 186 20 162 18 114 C16 64 48 24 100 24Z" fill="${color}"/>
    <ellipse cx="66" cy="62" rx="20" ry="12" fill="#fff" opacity=".28" transform="rotate(-25 66 62)"/>
    ${eyes(72, 128, 100, 18, mood)}
    ${cheeks(52, 148, 132)}
    ${mouth(100, 136, mood)}
  </svg>`;
}

function drawOwl(color, mood) {
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Owl mascot">
    <ellipse cx="100" cy="192" rx="54" ry="6" fill="${INK}" opacity=".12"/>
    <path d="M40 58 L54 18 L82 44 Z M160 58 L146 18 L118 44 Z" fill="${color}"/>
    <ellipse cx="100" cy="112" rx="72" ry="78" fill="${color}"/>
    <ellipse cx="100" cy="146" rx="44" ry="38" fill="#fff" opacity=".35"/>
    <circle cx="72" cy="96" r="30" fill="#fff" opacity=".25"/><circle cx="128" cy="96" r="30" fill="#fff" opacity=".25"/>
    ${eyes(72, 128, 96, 19, mood)}
    <path d="M90 118 L110 118 L100 ${mood === "alert" ? 140 : 132} Z" fill="#ffc93c"/>
    ${mood === "happy" ? cheeks(46, 154, 122) : ""}
  </svg>`;
}

function drawCat(color, mood) {
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Cat mascot">
    <ellipse cx="100" cy="192" rx="56" ry="6" fill="${INK}" opacity=".12"/>
    <path d="M34 82 L46 20 L94 50 Z M166 82 L154 20 L106 50 Z" fill="${color}"/>
    <path d="M46 66 L52 34 L78 52 Z M154 66 L148 34 L122 52 Z" fill="#ff8fa3" opacity=".7"/>
    <circle cx="100" cy="114" r="76" fill="${color}"/>
    ${eyes(70, 130, 106, 16, mood)}
    ${cheeks(50, 150, 136)}
    <path d="M93 128 L107 128 L100 136 Z" fill="#ff8fa3"/>
    ${mouth(100, 142, mood)}
    <g stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity=".6">
      <path d="M40 128 L70 132"/><path d="M42 144 L70 140"/><path d="M160 128 L130 132"/><path d="M158 144 L130 140"/>
    </g>
  </svg>`;
}

const CHARACTERS = { blob: drawBlob, owl: drawOwl, cat: drawCat };
