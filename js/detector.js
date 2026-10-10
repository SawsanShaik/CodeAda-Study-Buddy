// =========================================================
// Detector: watches the webcam and reports distractions.
// - TensorFlow.js + COCO-SSD finds a phone in view
// - MediaPipe Face Landmarker tracks head and eyes
// Everything runs on this laptop. No video is uploaded.
// =========================================================

// Tune these while testing. To see the live numbers, open Chrome's
// console (Cmd + Option + J) during a session and type: detector.face
export const SETTINGS = {
  phoneConfidence: 0.5,  // how sure the phone detector must be (0 to 1)
  phoneCheckMs: 600,     // how often to look for a phone
  faceCheckMs: 100,      // how often to check the face
  awaySeconds: 3,        // no face this long = left the desk
  turnedSeconds: 3,      // head turned this long = distracted
  downSeconds: 4,        // looking down this long = probably on the phone
  sleepySeconds: 3,      // eyes closed this long = sleepy
  turnLimit: 0.15,       // how far the head can turn from normal
  downLimit: 0.07,       // how far the head can tilt down from normal
  eyesDownLimit: 0.55,   // how far the eyes can look down (0 to 1)
  eyesClosedLimit: 0.6,  // how closed the eyes can be (0 to 1)
  calibrateMs: 2000,     // how long to learn the normal sitting position
};

const MEDIAPIPE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let phoneModel = null;
let faceModel = null;

async function loadModels() {
  if (phoneModel && faceModel) return;
  if (!window.cocoSsd) throw new Error("the AI models didn't download. Check your internet connection and reload the page");
  const loadFace = async () => {
    const { FaceLandmarker, FilesetResolver } = await import(`${MEDIAPIPE}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${MEDIAPIPE}/wasm`);
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  };
  [phoneModel, faceModel] = await Promise.all([window.cocoSsd.load(), loadFace()]);
}

export class Detector {
  // onUpdate receives { calibrating, problem } about 10 times a second.
  // problem is "phone" | "down" | "turned" | "away" | "sleepy" | null
  constructor(video, canvas, onUpdate) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onUpdate = onUpdate;
    this.timers = [];
    this.writingMode = false;
  }

  async start() {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    await this.video.play();
    await loadModels();
    this.recalibrate();
    this.phoneRecent = [];
    this.phoneNow = false;
    this.phoneBusy = false;
    this.timers = [
      setInterval(() => this.checkFace(), SETTINGS.faceCheckMs),
      setInterval(() => this.checkPhone(), SETTINGS.phoneCheckMs),
    ];
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    const stream = this.video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  recalibrate() {
    this.baseline = null;
    this.samples = [];
    this.since = {};
    this.face = { found: false };
  }

  setWritingMode(on) { this.writingMode = on; }

  // ---------- Face (MediaPipe) ----------
  checkFace() {
    if (this.video.readyState < 2) return;
    const result = faceModel.detectForVideo(this.video, performance.now());

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      this.face = { found: false };
    } else {
      const p = result.faceLandmarks[0];
      const nose = p[1], leftEdge = p[234], rightEdge = p[454], forehead = p[10], chin = p[152];
      const scores = result.faceBlendshapes?.[0]?.categories ?? [];
      const score = name => scores.find(c => c.categoryName === name)?.score ?? 0;
      this.face = {
        found: true,
        turn: (nose.x - leftEdge.x) / (rightEdge.x - leftEdge.x),  // about 0.5 when facing the camera
        tilt: (nose.y - forehead.y) / (chin.y - forehead.y),       // goes up when the head tilts down
        eyesDown: (score("eyeLookDownLeft") + score("eyeLookDownRight")) / 2,
        eyesClosed: (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2,
      };
    }

    // Learn the person's normal position first
    if (!this.baseline) {
      if (this.face.found) this.samples.push(this.face);
      if (this.samples.length >= SETTINGS.calibrateMs / SETTINGS.faceCheckMs) {
        const avg = key => this.samples.reduce((sum, s) => sum + s[key], 0) / this.samples.length;
        this.baseline = { turn: avg("turn"), tilt: avg("tilt") };
      }
      this.onUpdate({ calibrating: true, problem: null });
      return;
    }

    this.onUpdate({ calibrating: false, problem: this.decide() });
  }

  // True only when a condition has lasted at least `seconds`
  lasted(key, condition, seconds) {
    if (!condition) { this.since[key] = null; return false; }
    this.since[key] ??= Date.now();
    return Date.now() - this.since[key] >= seconds * 1000;
  }

  decide() {
    const f = this.face, b = this.baseline;
    const headDown = f.found && f.tilt - b.tilt > SETTINGS.downLimit;
    const eyesDown = f.found && f.eyesDown > SETTINGS.eyesDownLimit;
    const turned = f.found && Math.abs(f.turn - b.turn) > SETTINGS.turnLimit;
    const closed = f.found && f.eyesClosed > SETTINGS.eyesClosedLimit && !eyesDown && !headDown;

    // Check every problem so each timer keeps running, then pick the most important
    const found = {
      phone: this.phoneNow,
      down: this.lasted("down", !this.writingMode && (headDown || eyesDown), SETTINGS.downSeconds),
      turned: this.lasted("turned", turned, SETTINGS.turnedSeconds),
      away: this.lasted("away", !f.found, SETTINGS.awaySeconds),
      sleepy: this.lasted("sleepy", closed, SETTINGS.sleepySeconds),
    };
    return ["phone", "down", "turned", "away", "sleepy"].find(k => found[k]) ?? null;
  }

  // ---------- Phone (TensorFlow.js) ----------
  async checkPhone() {
    if (this.phoneBusy || this.video.readyState < 2) return;
    this.phoneBusy = true;
    try {
      const predictions = await phoneModel.detect(this.video);
      const phones = predictions.filter(p => p.class === "cell phone" && p.score >= SETTINGS.phoneConfidence);
      this.drawBoxes(phones);
      this.phoneRecent.push(phones.length > 0);
      if (this.phoneRecent.length > 3) this.phoneRecent.shift();
      this.phoneNow = this.phoneRecent.filter(Boolean).length >= 2;  // seen in 2 of the last 3 checks
    } finally {
      this.phoneBusy = false;
    }
  }

  drawBoxes(phones) {
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.lineWidth = 6;
    this.ctx.strokeStyle = "#c94f3d";
    for (const p of phones) this.ctx.strokeRect(...p.bbox);
  }
}
