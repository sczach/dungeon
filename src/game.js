/**
 * @file src/game.js
 * @description
 *   Chord Wars — Game entry point (RTS edition).
 *   Owns ALL mutable game state.
 *   Drives the requestAnimationFrame loop and the scene state machine.
 *   Delegates rendering to Renderer (read-only view of state).
 *
 * Scene states: TITLE | CALIBRATION | PLAYING | VICTORY | DEFEAT
 *
 * RTS overview
 * ────────────
 *   Player base (left) vs Enemy base (right).
 *   Player presses piano keys → units march right toward enemy base.
 *   Enemy base auto-spawns units on a timer → they march left.
 *   Units collide in the middle and fight.
 *   Destroy the enemy base to win; lose if your base reaches 0 HP.
 */

import { Renderer }      from './renderer.js';
import {
  SCENE,
  LANE_Y, LANE_HEIGHT,
  BASE_WIDTH, PLAYER_BASE_X, ENEMY_BASE_X,
} from './constants.js';
import { startCapture, updateAudio, updateCalibration } from './audio/index.js';
import { Unit }          from './entities/unit.js';
import { Base }          from './systems/base.js';
import { keyboardInput } from './input/keyboard.js';

// Re-export SCENE for callers that import from game.js
export { SCENE };

// ─────────────────────────────────────────────────────────────────────────────
// Canonical game state
// All subsystems receive a reference — they never hold state themselves.
// ─────────────────────────────────────────────────────────────────────────────

function createInitialState() {
  return {
    // ── Meta ──────────────────────────────────
    scene:      SCENE.TITLE,
    paused:     false,
    time:       0,           // total elapsed play seconds
    frameCount: 0,

    // ── Session ───────────────────────────────
    score: 0,
    wave:  1,                // 1-10; increments every 30 s of play time

    // ── Audio (written by audio subsystem + keyboard layer) ──
    audio: {
      ready:         false,  // mic permission granted + context running
      noiseFloor:    0,      // RMS amplitude floor from calibration
      detectedNote:  null,   // string | null — e.g. 'E2'
      detectedChord: null,   // string | null — e.g. 'C3' (piano) or 'Em' (mic)
      confidence:    0,      // 0–1
      waveformData:  null,   // Float32Array for calibration visualiser
      lastNotes:     [],     // string[] — rolling buffer of recent note presses
      pressedKeys:   new Set(),  // Set<string> currently held keys (for HUD)
      spawnTier:     null,   // 1|2|3|null — keyboard sets, game loop consumes
    },

    // ── Bases (created in startGame with canvas-relative coords) ──
    playerBase: null,        // Base instance
    enemyBase:  null,        // Base instance

    // ── Entities ──────────────────────────────
    units: [],               // Unit[] — both player and enemy units

    // ── Resources (currency for spawning) ─────
    resources:          100,
    enemySpawnTimer:    4,   // seconds until next enemy spawn
    enemySpawnInterval: 4,   // current inter-spawn delay (shrinks with wave)

    // ── Wave announcement ─────────────────────
    waveAnnounce: 0,         // performance.now() timestamp, 0 = none

    // ── Canvas dimensions (managed by onResize) ─
    canvas: { width: 0, height: 0, dpr: 1 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const canvas   = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const ctx      = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const renderer = new Renderer(canvas, ctx);
const state    = createInitialState();

// ─────────────────────────────────────────────────────────────────────────────
// Scene management
// ─────────────────────────────────────────────────────────────────────────────

/** Apply scene change, update <body> data attribute, and clean up subsystems. */
function setScene(scene) {
  // Stop keyboard when leaving PLAYING so pressed-key state doesn't bleed
  if (state.scene === SCENE.PLAYING && scene !== SCENE.PLAYING) {
    keyboardInput.stop();
  }
  state.scene = scene;
  document.body.dataset.scene = scene;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas resize
// High-DPI: pixel buffer = logical size × devicePixelRatio.
// Context is pre-scaled so all draw calls use logical pixels.
// ─────────────────────────────────────────────────────────────────────────────

function onResize() {
  const dpr = window.devicePixelRatio || 1;
  const w   = window.innerWidth;
  const h   = window.innerHeight;

  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.canvas.width  = w;
  state.canvas.height = h;
  state.canvas.dpr    = dpr;

  // Keep base positions in sync after resize
  if (state.playerBase) {
    state.playerBase.x = (PLAYER_BASE_X + BASE_WIDTH / 2) * w;
    state.playerBase.y = LANE_Y * h;
  }
  if (state.enemyBase) {
    state.enemyBase.x = (ENEMY_BASE_X + BASE_WIDTH / 2) * w;
    state.enemyBase.y = LANE_Y * h;
  }
}

window.addEventListener('resize', onResize);
onResize();

// ─────────────────────────────────────────────────────────────────────────────
// UI button wiring
// ─────────────────────────────────────────────────────────────────────────────

function wireButtons() {
  const $ = (id) => document.getElementById(id);

  // TITLE → CALIBRATION  (must be in click handler for iOS AudioContext unlock)
  $('btn-start')?.addEventListener('click', async () => {
    setScene(SCENE.CALIBRATION);
    await startCapture(state);
  });

  // TITLE → PLAYING (practice mode — mic optional)
  $('btn-practice')?.addEventListener('click', async () => {
    startCapture(state).catch(() => {});
    startGame();
  });

  // CALIBRATION → PLAYING
  $('btn-calibration-done')?.addEventListener('click', () => startGame());

  // VICTORY / DEFEAT → PLAYING
  $('btn-play-again-victory')?.addEventListener('click', () => startGame());
  $('btn-play-again-defeat')?.addEventListener('click',  () => startGame());

  // VICTORY / DEFEAT → TITLE
  $('btn-title-victory')?.addEventListener('click', () => setScene(SCENE.TITLE));
  $('btn-title-defeat')?.addEventListener('click',  () => setScene(SCENE.TITLE));
}

// ─────────────────────────────────────────────────────────────────────────────
// Game start — reset to fresh play state
// ─────────────────────────────────────────────────────────────────────────────

function startGame() {
  const fresh = createInitialState();

  // Preserve audio calibration (mic ready flag + noise floor) across restarts
  Object.assign(fresh.audio, {
    ready:      state.audio.ready,
    noiseFloor: state.audio.noiseFloor,
  });

  // Preserve canvas dimensions — managed by onResize(), not game logic.
  // Without this, the W===0 guard in Renderer.draw() bails every frame.
  const savedCanvas = state.canvas;
  Object.assign(state, fresh);
  state.canvas = savedCanvas;

  // Build bases at correct canvas-relative positions
  const W     = state.canvas.width;
  const H     = state.canvas.height;
  const baseY = LANE_Y * H;

  state.playerBase = new Base('player', (PLAYER_BASE_X + BASE_WIDTH / 2) * W, baseY);
  state.enemyBase  = new Base('enemy',  (ENEMY_BASE_X  + BASE_WIDTH / 2) * W, baseY);

  // Announce Wave 1
  state.waveAnnounce = performance.now();

  keyboardInput.start(state);
  setScene(SCENE.PLAYING);
}

// ─────────────────────────────────────────────────────────────────────────────
// Enemy spawn helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick an enemy tier using wave-scaled probabilities.
 * Wave 1-3:  80 % tier1, 20 % tier2
 * Wave 4-7:  50 % tier1, 40 % tier2, 10 % tier3
 * Wave 8-10: 20 % tier1, 50 % tier2, 30 % tier3
 * @param {number} wave — 1-indexed wave number
 * @returns {1|2|3}
 */
function rollEnemyTier(wave) {
  const r = Math.random();
  if (wave <= 3) {
    return r < 0.8 ? 1 : 2;
  } else if (wave <= 7) {
    return r < 0.5 ? 1 : r < 0.9 ? 2 : 3;
  } else {
    return r < 0.2 ? 1 : r < 0.7 ? 2 : 3;
  }
}

/** Spawn one enemy unit just outside the enemy base. */
function spawnEnemyUnit() {
  const W      = state.canvas.width;
  const H      = state.canvas.height;
  const laneHH = LANE_HEIGHT * H * 0.35;
  const y      = LANE_Y * H + (Math.random() * 2 - 1) * laneHH;
  const x      = ENEMY_BASE_X * W - 20;   // just left of enemy base left edge
  state.units.push(new Unit('enemy', rollEnemyTier(state.wave), x, y));
}

/**
 * Try to spend resources and spawn a player unit.
 * Silently fails if resources are insufficient.
 * @param {1|2|3} tier
 */
function spawnPlayerUnit(tier) {
  const COST = [0, 20, 50, 100];
  const cost = COST[tier];
  if (state.resources < cost) return;

  state.resources -= cost;

  const W      = state.canvas.width;
  const H      = state.canvas.height;
  const laneHH = LANE_HEIGHT * H * 0.35;
  const y      = LANE_Y * H + (Math.random() * 2 - 1) * laneHH;
  const x      = (PLAYER_BASE_X + BASE_WIDTH) * W + 20;  // just right of player base
  state.units.push(new Unit('player', tier, x, y));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DELTA   = 1 / 20;   // cap at 50 ms — prevents spiral-of-death on tab-blur
let   lastTimestamp = 0;

function loop(timestamp) {
  requestAnimationFrame(loop);

  const dt = Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA);
  lastTimestamp = timestamp;

  if (dt <= 0) return;   // skip first frame

  update(dt);
  renderer.draw(state);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update — scene-dispatched simulation step
// ─────────────────────────────────────────────────────────────────────────────

/** @param {number} dt — delta time in seconds */
function update(dt) {
  if (state.paused) return;

  switch (state.scene) {

    case SCENE.TITLE:
      // Title animation is handled entirely by the renderer
      break;

    case SCENE.CALIBRATION:
      updateCalibration(state);
      break;

    case SCENE.PLAYING: {
      state.time       += dt;
      state.frameCount += 1;

      // Audio pipeline (mic chord detection / audio analysis)
      updateAudio(state, dt);

      // ── Resources tick (+10/s, cap 200) ─────────────────────────────────
      state.resources = Math.min(200, state.resources + 10 * dt);

      // ── Wave progression (every 30 s of play time) ───────────────────────
      const targetWave = Math.min(10, 1 + Math.floor(state.time / 30));
      if (targetWave > state.wave) {
        state.wave         = targetWave;
        state.waveAnnounce = performance.now();
        // Spawn interval scales from 4 s (wave 1) → 1.5 s (wave 10)
        state.enemySpawnInterval = Math.max(1.5, 4 - (state.wave - 1) * (2.5 / 9));
      }

      // ── Enemy spawning ────────────────────────────────────────────────────
      state.enemySpawnTimer -= dt;
      if (state.enemySpawnTimer <= 0) {
        state.enemySpawnTimer = state.enemySpawnInterval;
        spawnEnemyUnit();
      }

      // ── Player spawn action (set by keyboard debounce timer) ─────────────
      if (state.audio.spawnTier !== null) {
        spawnPlayerUnit(state.audio.spawnTier);
        state.audio.spawnTier = null;
      }

      // ── Unit updates + cleanup ────────────────────────────────────────────
      // Backwards iteration allows safe in-place splice.
      // Passing the full units array lets each unit scan for enemies.
      const bases = { player: state.playerBase, enemy: state.enemyBase };
      for (let i = state.units.length - 1; i >= 0; i--) {
        const u = state.units[i];
        if (!u.alive) {
          // Award points for killing an enemy unit
          if (u.team === 'enemy') {
            state.score += u.tier * 100;   // 100/200/300 per tier
          }
          state.units.splice(i, 1);
          continue;
        }
        u.update(dt, state.units, bases);
      }

      // ── Win / lose ────────────────────────────────────────────────────────
      if (state.playerBase.isDestroyed()) { setScene(SCENE.DEFEAT);  break; }
      if (state.enemyBase.isDestroyed())  { setScene(SCENE.VICTORY); break; }
      break;
    }

    case SCENE.VICTORY:
    case SCENE.DEFEAT:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page visibility — pause AudioContext on hide to save battery
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  state.paused = document.hidden;
});

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

setScene(SCENE.TITLE);
wireButtons();

requestAnimationFrame((ts) => {
  lastTimestamp = ts;
  requestAnimationFrame(loop);
});
