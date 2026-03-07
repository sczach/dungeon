/**
 * @file src/game.js
 * @description
 *   Chord Wars — Game entry point.
 *   Owns ALL mutable game state.
 *   Drives the requestAnimationFrame loop and the scene state machine.
 *   Delegates rendering to Renderer (read-only view of state).
 *   Subsystems (audio, entities, waves, combat) are imported here and
 *   called with state references — they never hold state themselves.
 *
 * Scene states: TITLE | CALIBRATION | PLAYING | VICTORY | DEFEAT
 */

import { Renderer }      from './renderer.js';
import { SCENE }         from './constants.js';
import { startCapture, updateAudio, updateCalibration } from './audio/index.js';
import { WaveManager }   from './systems/waves.js';
import { updateCombat }  from './systems/combat.js';
import { PromptManager } from './systems/prompts.js';

// ─────────────────────────────────────────────
// Scene identifiers live in src/constants.js.
// Re-exported here so callers that already
// import game.js don't need an extra import.
// ─────────────────────────────────────────────
export { SCENE };

// ─────────────────────────────────────────────
// Canonical game state object.
// All subsystems receive a reference to this;
// they read what they need and write back via
// the keys they own (documented per-field).
// ─────────────────────────────────────────────
function createInitialState() {
  return {
    // ── Meta ──────────────────────────────
    scene:      SCENE.TITLE,   // current scene key
    paused:     false,
    time:       0,             // total elapsed seconds (gameplay only)
    frameCount: 0,

    // ── Player / session ──────────────────
    score:      0,
    lives:      20,            // castle HP (enemies that reach exit subtract 1)
    wave:       0,             // 1-indexed current wave (0 = not started)
    combo:      0,             // consecutive successful chord hits

    // ── Audio (written by audio subsystem, Phase 1A) ──
    audio: {
      ready:          false,   // mic permission granted + context running
      noiseFloor:     0,       // RMS amplitude below which we ignore signal
      detectedNote:   null,    // string | null — most recent note name, e.g. 'E2'
      detectedChord:  null,    // string | null — matched chord label, e.g. 'Em'
      confidence:     0,       // 0–1 confidence of chord match
      waveformData:   null,    // Float32Array snapshot for visualiser
    },

    // ── Entities (written by entity subsystems, Phase 1B) ──
    enemies: [],               // Enemy[]
    units:   [],               // Unit[]

    // ── Prompt (written by prompts system, Phase 1C) ──
    prompt: {
      chord:     null,         // string | null — chord the player must play now
      timeLeft:  0,            // seconds remaining for this prompt
      active:    false,
    },

    // ── Wave announcement timestamp ──
    waveAnnounce: 0,           // performance.now() when current wave started (0 = none)

    // ── Canvas dimensions (updated on resize) ──
    canvas: {
      width:  0,
      height: 0,
      dpr:    1,
    },
  };
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
const canvas         = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const ctx            = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const renderer       = new Renderer(canvas, ctx);
const state          = createInitialState();
const waveManager    = new WaveManager();
const promptManager  = new PromptManager();

/** Apply scene change: update state and drive CSS selector on <body>. */
function setScene(scene) {
  state.scene = scene;
  document.body.dataset.scene = scene;
}

// ─────────────────────────────────────────────
// Resize handling
// High-DPI: set canvas pixel buffer to logical
// size × devicePixelRatio, then scale context.
// ─────────────────────────────────────────────
function onResize() {
  const dpr = window.devicePixelRatio || 1;
  const w   = window.innerWidth;
  const h   = window.innerHeight;

  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // reset + apply DPR scale

  state.canvas.width  = w;
  state.canvas.height = h;
  state.canvas.dpr    = dpr;
}

window.addEventListener('resize', onResize);
onResize();  // run immediately so first frame has correct dimensions

// ─────────────────────────────────────────────
// UI button wiring
// All buttons live in index.html. game.js is the
// single place that wires them to scene transitions.
// ─────────────────────────────────────────────
function wireButtons() {
  const $ = (id) => document.getElementById(id);

  // TITLE → CALIBRATION
  // startCapture() MUST be called inside the click handler (user gesture)
  // so that iOS Safari allows AudioContext creation and mic access.
  $('btn-start')?.addEventListener('click', async () => {
    setScene(SCENE.CALIBRATION);
    await startCapture(state);
  });

  // TITLE → PLAYING (practice mode — skips calibration, mic optional)
  $('btn-practice')?.addEventListener('click', async () => {
    // Still attempt capture so audio works in practice; silence errors.
    startCapture(state).catch(() => {});
    startGame();
  });

  // CALIBRATION → PLAYING (button enabled by updateCalibration after ~1.5 s)
  $('btn-calibration-done')?.addEventListener('click', () => {
    startGame();
  });

  // VICTORY / DEFEAT → PLAYING
  $('btn-play-again-victory')?.addEventListener('click', () => startGame());
  $('btn-play-again-defeat')?.addEventListener('click',  () => startGame());

  // VICTORY / DEFEAT → TITLE
  $('btn-title-victory')?.addEventListener('click', () => setScene(SCENE.TITLE));
  $('btn-title-defeat')?.addEventListener('click',  () => setScene(SCENE.TITLE));
}

/** Reset mutable play state and enter PLAYING scene. */
function startGame() {
  const fresh = createInitialState();

  // Preserve audio calibration across restarts
  Object.assign(fresh.audio, {
    ready:      state.audio.ready,
    noiseFloor: state.audio.noiseFloor,
  });

  Object.assign(state, fresh);
  waveManager.reset();    // restart waves from Wave 1
  promptManager.reset();  // restart prompt cycle and debounce timers
  state.prompt.active = true;
  setScene(SCENE.PLAYING);
}

// ─────────────────────────────────────────────
// Main game loop (requestAnimationFrame)
// Keeps a rolling delta-time cap to prevent
// spiral-of-death on tab-blur / slow frames.
// ─────────────────────────────────────────────
const MAX_DELTA = 1 / 20;  // cap at 50 ms — prevents huge jumps after blur

let lastTimestamp = 0;

/**
 * @param {DOMHighResTimeStamp} timestamp — provided by rAF
 */
function loop(timestamp) {
  requestAnimationFrame(loop);

  const dt = Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA);
  lastTimestamp = timestamp;

  // Don't simulate on the very first frame (dt would be ~0 or huge)
  if (dt <= 0) return;

  update(dt, timestamp);
  renderer.draw(state);
}

// ─────────────────────────────────────────────
// Update — scene-dispatched simulation step
// ─────────────────────────────────────────────
/**
 * @param {number} dt         — delta time in seconds
 * @param {number} timestamp  — raw rAF timestamp (ms)
 */
function update(dt, timestamp) {   // eslint-disable-line no-unused-vars
  if (state.paused) return;

  switch (state.scene) {
    case SCENE.TITLE:
      // Animate title screen (renderer handles it; nothing to simulate here yet)
      break;

    case SCENE.CALIBRATION:
      updateCalibration(state);
      break;

    case SCENE.PLAYING:
      state.time       += dt;
      state.frameCount += 1;

      updateAudio(state, dt);

      // Spawn enemies and advance waves (mutates state.enemies, state.wave)
      waveManager.update(dt, state);

      // Check for chord detection → spawn defender units, cycle prompt
      promptManager.update(dt, state);

      // Tick defender units; remove dead units in-place
      updateCombat(state, dt);

      // Update each live enemy; detect castle breaches.
      // Backwards iteration allows in-place splice without skipping entries.
      // No array allocation — splice modifies state.enemies in place.
      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const e = state.enemies[i];
        e.update(dt, state.canvas.width, state.canvas.height);
        if (e.reachedCastle) {
          state.lives = Math.max(0, state.lives - 1);
        }
        if (!e.alive) {
          state.enemies.splice(i, 1);
        }
      }

      // Win / lose — defeat checked first; if simultaneous, defeat takes priority
      if (state.lives <= 0)     setScene(SCENE.DEFEAT);
      if (waveManager.complete) setScene(SCENE.VICTORY);
      break;

    case SCENE.VICTORY:
    case SCENE.DEFEAT:
      // Static screens — nothing to simulate
      break;
  }
}

// ─────────────────────────────────────────────
// Page visibility — pause AudioContext on hide
// to avoid battery drain on mobile.
// ─────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.paused = true;
  } else {
    state.paused = false;
    // AudioContext may have been suspended by the browser on hide;
    // unlockAudioContext() (already wired in startCapture) will
    // resume it on the next user gesture.
  }
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

// Apply initial scene to <body> so CSS shows the TITLE screen immediately
setScene(SCENE.TITLE);

wireButtons();

// Kick off the loop
requestAnimationFrame((ts) => {
  lastTimestamp = ts;
  requestAnimationFrame(loop);
});
