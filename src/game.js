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
import { Unit }                  from './entities/unit.js';
import { Base }                  from './systems/base.js';
import { keyboardInput, playSuccessKill } from './input/keyboard.js';
import { initPianoTouchInput }            from './ui/hud.js';
import { SettingsUI }                     from './ui/settings.js';
import { TablatureSystem }       from './systems/tablature.js';
import { AttackSequenceSystem }  from './systems/attackSequence.js';
import { PromptManager }         from './systems/prompts.js';

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

    // ── Input (written by keyboard layer) ─────
    input: {
      pressedKeys: new Set(),  // Set<string> active note names, auto-cleared after 150 ms
      octave:      0,          // current octave offset (−2 to +2)
    },

    // ── Tablature summon bar ───────────────────
    tablature: {
      queue:             [],    // [{note, key, status, statusTime}]
      combo:             0,     // consecutive correct notes
      activeIndex:       0,     // always 0 — leftmost slot
      pendingSpawn:      null,  // 1|2|3|null — consumed by game loop
      summonCooldownEnd: 0,     // performance.now() when cooldown expires (0 = none)
    },

    // ── Audio (written by audio subsystem + keyboard layer) ──
    audio: {
      ready:         false,  // mic permission granted + context running
      noiseFloor:    0,      // RMS amplitude floor from calibration
      detectedNote:  null,   // string | null — e.g. 'E2'
      detectedChord: null,   // string | null — e.g. 'C3' (piano) or 'Em' (mic)
      confidence:    0,      // 0–1
      waveformData:  null,   // Float32Array for calibration visualiser
      lastNotes:     [],     // string[] — rolling buffer of recent note presses
      spawnTier:     null,   // legacy — not set by new keyboard; kept for audio subsystem compat
    },

    // ── Bases (created in startGame with canvas-relative coords) ──
    playerBase: null,        // Base instance
    enemyBase:  null,        // Base instance

    // ── Entities ──────────────────────────────
    units: [],               // Unit[] — both player and enemy units

    // ── Mode & settings ───────────────────────
    inputMode:      'summon',    // 'summon' | 'attack' — toggled by Space
    modeAnnounce:   0,           // performance.now() timestamp; 0 = none
    showNoteLabels:  false,       // overridden by loadSettings()
    difficulty:      'medium',   // overridden by loadSettings()
    audioThreshold:  50,         // 0–100 mic sensitivity; overridden by loadSettings()
    masterVolume:    80,         // 0–100 output gain; overridden by loadSettings()
    showChordCues:   true,       // show chord name + tab at top; overridden by loadSettings()
    currentPrompt:   null,       // { chord, tab, difficulty } — set by PromptManager

    // ── Resources — earned via kills, spent on summons ──
    resources:          0,       // start 0; no auto-tick; kills add 20/30/50
    _lastKillMelodyMs:  0,       // throttle: ≤ 1 melody per 800 ms
    enemySpawnTimer:    8,       // seconds until next enemy spawn
    enemySpawnInterval: 8,       // current inter-spawn delay (reduces every 60 s of play)

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

const settingsUI           = new SettingsUI();
const promptManager        = new PromptManager();
settingsUI.loadSettings(state);   // override defaults from localStorage
const tablatureSystem      = new TablatureSystem();
const attackSequenceSystem = new AttackSequenceSystem();

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
  console.log(`[scene] → ${scene}`);
  if (scene === SCENE.TITLE) console.log('[scene] entered TITLE — wiring settings');
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

  // Preserve audio calibration
  Object.assign(fresh.audio, {
    ready:      state.audio.ready,
    noiseFloor: state.audio.noiseFloor,
  });

  // Preserve player settings across restarts
  Object.assign(fresh, {
    difficulty:     state.difficulty,
    showNoteLabels: state.showNoteLabels,
    audioThreshold: state.audioThreshold,
    masterVolume:   state.masterVolume,
    showChordCues:  state.showChordCues,
    inputMode:      'summon',   // always reset to summon on new game
  });

  // Preserve canvas dimensions — managed by onResize(), not game logic.
  const savedCanvas = state.canvas;
  Object.assign(state, fresh);
  state.canvas = savedCanvas;

  // Build bases at correct canvas-relative positions
  const W     = state.canvas.width;
  const H     = state.canvas.height;
  const baseY = LANE_Y * H;

  state.playerBase = new Base('player', (PLAYER_BASE_X + BASE_WIDTH / 2) * W, baseY);
  state.enemyBase  = new Base('enemy',  (ENEMY_BASE_X  + BASE_WIDTH / 2) * W, baseY);

  // Initialise subsystems
  tablatureSystem.reset(state);
  attackSequenceSystem.reset(state);
  promptManager.reset();

  // Announce Wave 1
  state.waveAnnounce = performance.now();

  // Apply difficulty to initial spawn timing
  const DIFF_INTERVALS = { easy: 12, medium: 8, hard: 5 };
  state.enemySpawnInterval = DIFF_INTERVALS[state.difficulty] ?? 8;
  state.enemySpawnTimer    = state.enemySpawnInterval;

  keyboardInput.start(state, tablatureSystem, attackSequenceSystem);
  setScene(SCENE.PLAYING);
}

// ─────────────────────────────────────────────────────────────────────────────
// Enemy spawn helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick an enemy tier using time-gated + wave-scaled probabilities.
 *
 * First 120 s:  95 % tier 1, 5 % tier 2, 0 % tier 3  (tutorial window)
 * Wave 1-3:     80 % tier 1, 20 % tier 2
 * Wave 4-7:     50 % tier 1, 40 % tier 2, 10 % tier 3
 * Wave 8-10:    20 % tier 1, 50 % tier 2, 30 % tier 3
 *
 * @param {number} wave         — 1-indexed wave number
 * @param {number} elapsedSecs  — total play seconds (state.time)
 * @returns {1|2|3}
 */
function rollEnemyTier(wave, elapsedSecs) {
  const r = Math.random();
  // Gentle tutorial window: almost all tier-1 for the first 2 minutes
  if (elapsedSecs < 120) {
    return r < 0.95 ? 1 : 2;
  }
  if (wave <= 3) {
    return r < 0.8 ? 1 : 2;
  } else if (wave <= 7) {
    return r < 0.5 ? 1 : r < 0.9 ? 2 : 3;
  } else {
    return r < 0.2 ? 1 : r < 0.7 ? 2 : 3;
  }
}

/**
 * Spawn one enemy unit just outside the enemy base.
 * Hard cap: does nothing if ≥ 6 enemy units are already on screen.
 * Speed cap: enemy speed is halved vs player-unit base stats.
 */
function spawnEnemyUnit() {
  // Hard cap — prevent overwhelming the player with too many enemies at once
  let enemyCount = 0;
  for (let i = 0; i < state.units.length; i++) {
    if (state.units[i].team === 'enemy') enemyCount++;
  }
  if (enemyCount >= 6) return;

  const W        = state.canvas.width;
  const H        = state.canvas.height;
  const halfLane = LANE_HEIGHT * H * 0.5;
  const laneTop  = LANE_Y * H - halfLane;
  const laneBot  = LANE_Y * H + halfLane;
  const spread   = halfLane * 0.7;
  const rawY     = LANE_Y * H + (Math.random() * 2 - 1) * spread;
  // Clamp so the unit circle stays fully within the combat strip
  const tier     = rollEnemyTier(state.wave, state.time);
  const radius   = [0, 12, 16, 20][tier];
  const y        = Math.max(laneTop + radius, Math.min(laneBot - radius, rawY));
  const x        = ENEMY_BASE_X * W - 20;

  const unit = new Unit('enemy', tier, x, y);
  // Global 0.5× enemy speed — makes early game much more manageable
  unit.speed *= 0.5;
  attackSequenceSystem.assignSequence(unit);
  state.units.push(unit);
}

/**
 * Spawn a player unit, optionally without spending resources.
 * Silently fails if resources insufficient (when free=false).
 * @param {1|2|3}  tier
 * @param {boolean} [free=false] — if true, skips resource check/deduction (tablature spawn)
 */
function spawnPlayerUnit(tier, free = false) {
  const COST = [0, 20, 50, 100];
  const cost = free ? 0 : COST[tier];
  if (state.resources < cost) return;
  if (!free) state.resources -= cost;

  const W        = state.canvas.width;
  const H        = state.canvas.height;
  const halfLane = LANE_HEIGHT * H * 0.5;
  const laneTop  = LANE_Y * H - halfLane;
  const laneBot  = LANE_Y * H + halfLane;
  // ±20 px variance (spec) — keeps player units near lane centre on spawn
  const rawY     = LANE_Y * H + (Math.random() * 2 - 1) * 20;
  const radius   = [0, 12, 16, 20][tier];
  const y        = Math.max(laneTop + radius, Math.min(laneBot - radius, rawY));
  const x        = (PLAYER_BASE_X + BASE_WIDTH) * W + 20;
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

      // ── Subsystem updates (tablature only active in summon mode) ─────────
      if (state.inputMode === 'summon') tablatureSystem.update(dt, state);
      attackSequenceSystem.update(dt, state);
      promptManager.update(dt, state);
      // No resource auto-tick — resources earned from kills only

      // ── Wave progression (every 30 s of play time) ───────────────────────
      const targetWave = Math.min(10, 1 + Math.floor(state.time / 30));
      if (targetWave > state.wave) {
        state.wave         = targetWave;
        state.waveAnnounce = performance.now();
      }

      // ── Dynamic spawn interval: −0.5 s every 60 s, floor 2 s ────────────
      // Initial 8 s → 7.5 s at 60 s → 7 s at 120 s → … → 2 s at 720 s
      const targetInterval = Math.max(2, 8 - Math.floor(state.time / 60) * 0.5);
      if (targetInterval < state.enemySpawnInterval) {
        state.enemySpawnInterval = targetInterval;
      }

      // ── Enemy spawning ────────────────────────────────────────────────────
      state.enemySpawnTimer -= dt;
      if (state.enemySpawnTimer <= 0) {
        state.enemySpawnTimer = state.enemySpawnInterval;
        spawnEnemyUnit();
      }

      // ── Tablature spawn — gated by resources ─────────────────────────────
      if (state.tablature.pendingSpawn !== null) {
        const tier = state.tablature.pendingSpawn;
        const SUMMON_COST = [0, 50, 75, 100];
        const cost = SUMMON_COST[tier] ?? 50;
        if (state.resources >= cost) {
          state.resources -= cost;
          spawnPlayerUnit(tier, true);
          console.log(`[summon] T${tier} spent ${cost} res → ${Math.floor(state.resources)} remaining`);
        } else {
          // Trigger red-flash on summon bar
          state.tablature.blocked     = true;
          state.tablature.blockedTime = performance.now();
          console.log(`[summon] blocked T${tier}: need ${cost}, have ${Math.floor(state.resources)} → red flash`);
        }
        state.tablature.pendingSpawn = null;
      }

      // ── Unit updates + cleanup ────────────────────────────────────────────
      // Backwards iteration allows safe in-place splice.
      // Passing the full units array lets each unit scan for enemies.
      const bases = { player: state.playerBase, enemy: state.enemyBase };
      for (let i = state.units.length - 1; i >= 0; i--) {
        const u = state.units[i];
        if (!u.alive) {
          if (u.team === 'enemy') {
            state.score += u.tier * 100;
            // Resource earn: T1=20, T2=30, T3=50
            const EARN = [0, 20, 30, 50];
            state.resources = Math.min(200, state.resources + EARN[u.tier]);
            console.log(`[kill] T${u.tier} +${EARN[u.tier]} res → ${Math.floor(state.resources)}`);
            // Kill melody — throttled to ≤ 1 per 800 ms
            const now = performance.now();
            if (u.attackSeq && u.attackSeq.length > 0 &&
                now - state._lastKillMelodyMs > 800) {
              state._lastKillMelodyMs = now;
              try { playSuccessKill(u.attackSeq); } catch (_) {}
            }
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
settingsUI.render(state, startGame);
initPianoTouchInput(canvas, (note) => keyboardInput.dispatchNote(note));

requestAnimationFrame((ts) => {
  lastTimestamp = ts;
  requestAnimationFrame(loop);
});
