// Pixel dog character: sprite art, animation frames, and a tiny SVG renderer.
// Framework-agnostic so it can be dropped into the content script later:
//   const dog = createPixelDog(shadowRoot, { scale: 3 });
//   dog.setState('nudge');
// It also works inside a React component by passing a ref's element.

export const STATES = ['sleeping', 'idle', 'nudge', 'breakSuggestion', 'celebrate', 'play', 'run', 'runWithBall'];

const WIDTH = 40;
const HEIGHT = 26;

const PALETTE = {
  o: '#5a3a22', // outline
  b: '#d9a066', // fur (light brown)
  s: '#b9834f', // fur shade (ears, legs)
  l: '#f6dfb6', // cream (muzzle, chest, paws)
  e: '#2b1d14', // eyes
  n: '#2b1d14', // nose
  w: '#ffffff', // eye shine
  k: '#f2a0a0', // blush
  p: '#ef7d95', // tongue
  c: '#4fa3a5', // collar
  g: '#f5c542', // collar tag
  z: '#8a94c7', // Zzz
  y: '#f5c542', // sparkles
  a: '#7ec8e3', // water
  r: '#e26d5a', // bowl
  v: '#c6e04a', // tennis ball
};

// The dog is symmetric, so most sprites are drawn as a left half and mirrored.
const mirror = (half) => half.map((row) => row + [...row].reverse().join(''));

const SPRITES = {
  head: mirror([
    '......oooooo',
    '.ooooobbbbbb',
    'osssobbbbbbb',
    'osssobbbbbbb',
    'osssobbwebbb',
    'osssobbeebbb',
    'osssobkbblnn',
    '.ossobbbllln',
    '..ooobbblllo',
    '....obbbllol',
    '....obbbllll',
  ]),
  sitBody: mirror([
    '.....obbblll',
    '.....occcccg',
    '....obbbbllg',
    '...obbbbblll',
    '...obbbbblll',
    '..obbbbbblll',
    '..obbbbbblll',
    '..obbbsbbbll',
    '..obbbsbbbls',
    '..obbbsbbbls',
    '..obbbollllo',
    '...ooooooooo',
  ]),
  lieBody: mirror([
    '..ooooooooooooo',
    '.obbbbbbbbbbbbb',
    'obbbbbbbbbbbbbb',
    'obbbbbbbbbbbbbb',
    'obbbbbbbbbbbbbb',
    'obsbbbbbbbbbbbb',
    'obsbbbbbbbbbbbb',
    'obbsbbbbbbbbbbb',
    '.obbbbbbbbbbbbb',
    '..ooooooooooooo',
  ]),
  // Eye overlays sit on top of the open eyes ('.' leaves the head showing).
  eyesClosed: ['bb......bb', 'oo......oo'],
  eyesHappy: ['oo......oo', 'bb......bb'],
  tongue: ['pp', 'pp', 'oo'],
  paw: ['.ooooo.', 'olllllo', 'olololo', '.ooooo.'],
  tailUp: ['...oo', '..obo', '..obo', '.obo.', 'obo..', 'oo...'],
  tailSide: ['.....', '.....', '.....', '.oooo', 'obbbo', 'oooo.'],
  zSmall: ['zzzz', '..z.', '.z..', 'zzzz'],
  zBig: ['zzzzz', '...z.', '..z..', '.z...', 'zzzzz'],
  sparkle: ['.y.', 'yyy', '.y.'],
  sparkleSmall: ['y'],
  question: ['.oo.', 'o..o', '..o.', '....', '..o.'],
  bowlA: ['.ooooooo.', 'oawaaaaao', 'orrrrrrro', 'orrrrrrro', '.ooooooo.'],
  bowlB: ['.ooooooo.', 'oaaaaawao', 'orrrrrrro', 'orrrrrrro', '.ooooooo.'],
  ball: ['.oo.', 'ovwo', 'ovvo', '.oo.'],
  // Side view (facing right) for running around during breaks.
  sideBody: [
    '....................ooooo.....',
    '...................obbbbbo....',
    '..................ossbbbbbo...',
    '..................ossbbbebbooo',
    '..................ossbbbbbllln',
    '..................ossbkbbllllo',
    '.........oooooooooossobbbblllo',
    '........obbbbbbbbbooocccboooo.',
    '........obbbbbbbbbbbbcco......',
    '........obbbbbbbbbblllo.......',
    '........obbbbbbbbblllo........',
    '.........obbllllllbbo.........',
    '..........oooooooooo..........',
  ],
  sideTailUp: ['oo....', 'obo...', '.obo..', '..obo.', '...obo', '....oo'],
  sideTailFlat: ['......', '......', '......', 'ooooo.', 'obbbbo', 'oooooo'],
};

// Leg poses for the gallop. Each leg's top sits at columns 1-4 so they all attach
// at the same hip/shoulder point. Far-side legs reuse these in a darker shade.
const LEG_POSES = {
  // Short, stubby legs: the top row tucks under the belly, so only 4-5 rows show.
  reach: ['.obbo..', '..obbo.', '..obbo.', '..ollo.', '..oooo.'], // stretched forward, in the air
  plant: ['.obbo..', '.obbo..', '.obbo..', '.obbo..', '.ollo..', '.oooo..'], // straight down on the ground
  push: ['.obbo..', '.obbo..', 'obbo...', 'obbo...', 'ollo...', 'oooo...'], // planted, angled back
  tuck: ['.obbo..', '.obbo..', '..obbo.', '..ollo.', '..ooo..'], // bent and lifted
};
for (const [pose, rows] of Object.entries(LEG_POSES)) {
  SPRITES[`leg_${pose}`] = rows;
  SPRITES[`legFar_${pose}`] = rows.map((row) => row.replaceAll('b', 's'));
}

// A layer is [spriteName, x, y]. Layers paint in order, later ones on top.
function sitting({ eyes = 'open', tongue = false, tail = 'up', dy = 0 } = {}) {
  const layers = [];
  if (tail) layers.push([tail === 'up' ? 'tailUp' : 'tailSide', 29, 17 + dy]);
  layers.push(['sitBody', 8, 14 + dy], ['head', 8, 3 + dy]);
  if (eyes === 'closed') layers.push(['eyesClosed', 15, 7 + dy]);
  if (eyes === 'happy') layers.push(['eyesHappy', 15, 7 + dy]);
  if (tongue) layers.push(['tongue', 19, 12 + dy]);
  return layers;
}

function lying({ eyes = 'closed', breathe = false } = {}) {
  const layers = [['lieBody', 5, breathe ? 15 : 16], ['head', 8, 13]];
  if (eyes === 'closed') layers.push(['eyesClosed', 15, 17]);
  layers.push(['paw', 12, 22], ['paw', 21, 22]);
  return layers;
}

// Side-view gallop in four steps: stretched out, front legs land, gathered under,
// back legs push off. Far-side legs run one step behind the near ones.
const GALLOP = [
  { front: 'reach', back: 'push', dy: 0, tail: 'sideTailUp' },
  { front: 'plant', back: 'tuck', dy: 0, tail: 'sideTailUp' },
  { front: 'push', back: 'plant', dy: -1, tail: 'sideTailFlat' },
  { front: 'tuck', back: 'push', dy: -1, tail: 'sideTailFlat' },
];

function running(frame, { ball = false } = {}) {
  const step = GALLOP[frame];
  const far = GALLOP[(frame + GALLOP.length - 1) % GALLOP.length];
  const { dy } = step;
  const layers = [
    // Legs start right under the belly (x 12-21 on the canvas) so none of them float.
    [`legFar_${far.back}`, 12, 20],
    [`legFar_${far.front}`, 18, 20],
    [step.tail, 6, 10 + dy],
    ['sideBody', 2, 8 + dy],
    [`leg_${step.back}`, 11, 20],
    [`leg_${step.front}`, 17, 20],
  ];
  if (ball) layers.push(['ball', 29, 13 + dy]);
  return layers;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

// Each animation is a list of frames (layer lists) played at `fps`.
export const ANIMATIONS = {
  // Curled up asleep while the user is focused: slow breathing and drifting Zs.
  sleeping: {
    fps: 2,
    frames: [
      [...lying(), ['zSmall', 32, 9]],
      [...lying({ breathe: true }), ['zSmall', 33, 8]],
      [...lying({ breathe: true }), ['zSmall', 33, 8], ['zBig', 35, 2]],
      [...lying(), ['zBig', 35, 0]],
    ],
  },
  // Calm and awake: sitting, blinking now and then, slow tail wag.
  idle: {
    fps: 3,
    frames: range(8).map((i) => sitting({ eyes: i === 6 ? 'closed' : 'open', tail: i % 4 < 2 ? 'up' : 'side' })),
  },
  // Played once when going from sleeping to any awake state.
  wake: {
    fps: 5,
    once: true,
    frames: [lying({ eyes: 'open' }), lying({ eyes: 'open' }), sitting({ eyes: 'closed' }), sitting()],
  },
  // Got off task: sits up, slow tail wag, curious "?".
  nudge: {
    fps: 4,
    frames: range(8).map((i) => [
      ...sitting({ eyes: i === 6 ? 'closed' : 'open', tail: i % 4 < 2 ? 'up' : 'side' }),
      ...(i < 6 ? [['question', 32, 0]] : []),
    ]),
  },
  // Too many phone pickups: tongue out, tail wagging, water bowl for a break.
  breakSuggestion: {
    fps: 4,
    frames: range(8).map((i) => [
      ...sitting({ tongue: true, eyes: i === 5 ? 'closed' : 'open', tail: i % 2 ? 'side' : 'up' }),
      [i % 4 < 2 ? 'bowlA' : 'bowlB', 0, 21],
    ]),
  },
  // Goal reached: happy eyes, hopping, fast wag, sparkles.
  celebrate: {
    fps: 8,
    frames: [0, -1, -2, -3, -2, -1, 0, 0].map((dy, i) => [
      ...sitting({ eyes: 'happy', tongue: true, tail: i % 2 ? 'side' : 'up', dy }),
      ...(i % 2
        ? [['sparkleSmall', 6, 6], ['sparkleSmall', 34, 12], ['sparkle', 3, 14], ['sparkle', 34, 3]]
        : [['sparkle', 3, 4], ['sparkle', 35, 10], ['sparkleSmall', 6, 16], ['sparkleSmall', 33, 1]]),
    ]),
  },
  // Break time, waiting for the ball: excited sitting with a wagging tail.
  play: {
    fps: 6,
    frames: [0, -1, 0, 0].map((dy, i) =>
      sitting({ eyes: i === 3 ? 'happy' : 'open', tongue: true, tail: i % 2 ? 'side' : 'up', dy }),
    ),
  },
  run: { fps: 8, frames: range(4).map((i) => running(i)) },
  runWithBall: { fps: 8, frames: range(4).map((i) => running(i, { ball: true })) },
};

// Paints layers into a WIDTH x HEIGHT grid of palette keys (null = transparent).
export function composeFrame(layers) {
  const grid = range(HEIGHT).map(() => Array(WIDTH).fill(null));
  for (const [name, x, y] of layers) {
    SPRITES[name].forEach((row, dy) => {
      [...row].forEach((key, dx) => {
        const px = x + dx;
        const py = y + dy;
        if (key !== '.' && px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) grid[py][px] = key;
      });
    });
  }
  return grid;
}

// Merges horizontal runs of the same color into single rects to keep the SVG small.
export function frameToSvg(grid) {
  let out = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < WIDTH) {
      const key = row[x];
      let end = x + 1;
      while (end < WIDTH && row[end] === key) end++;
      if (key) out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PALETTE[key]}"/>`;
      x = end;
    }
  });
  return out;
}

// Standalone SVG for a single sprite, e.g. the ball during fetch.
export function spriteSvg(name, scale) {
  const rows = SPRITES[name];
  const w = rows[0].length;
  const h = rows.length;
  let out = '';
  rows.forEach((row, y) =>
    [...row].forEach((key, x) => {
      if (key !== '.') out += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[key]}"/>`;
    }),
  );
  return `<svg viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${out}</svg>`;
}

// A still picture of the dog in a state (its first frame), as SVG markup.
export function dogSvg(state, label = 'Pixel dog') {
  const frame = frameToSvg(composeFrame(ANIMATIONS[state].frames[0]));
  const safeLabel = String(label).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges" role="img" aria-label="${safeLabel}">${frame}</svg>`;
}

export const PALETTE_COLORS = PALETTE;
export const SIZE = { width: WIDTH, height: HEIGHT };

const STYLE = `
.pixel-dog { display: inline-block; line-height: 0; }
.pixel-dog svg { display: block; shape-rendering: crispEdges; overflow: visible; transform-origin: 50% 100%; }
.pixel-dog--left { transform: scaleX(-1); }
.pixel-dog--nudge svg { animation: pixel-dog-hop 1.6s steps(2) infinite; }
@keyframes pixel-dog-hop {
  0%, 70%, 100% { transform: translateY(0); }
  80% { transform: translateY(-4%); }
}
@media (prefers-reduced-motion: reduce) {
  .pixel-dog svg { animation: none !important; }
}
`;

const svgCache = {};
const framesFor = (name) =>
  (svgCache[name] ??= ANIMATIONS[name].frames.map((layers) => frameToSvg(composeFrame(layers))));

// Mounts the dog into `container` (an element or a ShadowRoot).
export function createPixelDog(container, { scale = 3, state = 'sleeping' } = {}) {
  if (!container.querySelector('style[data-pixel-dog]')) {
    const style = document.createElement('style');
    style.dataset.pixelDog = '';
    style.textContent = STYLE;
    container.appendChild(style);
  }

  const root = document.createElement('div');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('width', WIDTH * scale);
  svg.setAttribute('height', HEIGHT * scale);
  svg.setAttribute('role', 'img');
  root.appendChild(svg);
  container.appendChild(root);

  let current = null;
  let timer = null;
  let facing = 'right';

  function play(name, then) {
    clearInterval(timer);
    const { fps, once } = ANIMATIONS[name];
    const frames = framesFor(name);
    let i = 0;
    svg.innerHTML = frames[0];
    timer = setInterval(() => {
      i++;
      if (i >= frames.length) {
        if (once) return then();
        i = 0;
      }
      svg.innerHTML = frames[i];
    }, 1000 / fps);
  }

  function setState(next) {
    if (!STATES.includes(next)) throw new Error(`Unknown pixel dog state: ${next}`);
    if (next === current) return;
    const wasSleeping = current === 'sleeping';
    current = next;
    root.className = `pixel-dog pixel-dog--${next}`;
    root.classList.toggle('pixel-dog--left', facing === 'left');
    svg.setAttribute('aria-label', next === 'sleeping' ? 'Sleeping pixel dog' : 'Pixel dog');
    if (wasSleeping && next !== 'sleeping') play('wake', () => play(next));
    else play(next);
  }

  setState(state);

  return {
    setState,
    // The running sprite faces right; 'left' mirrors it.
    setFacing(direction) {
      facing = direction;
      root.classList.toggle('pixel-dog--left', facing === 'left');
    },
    get state() {
      return current;
    },
    destroy() {
      clearInterval(timer);
      root.remove();
    },
  };
}
