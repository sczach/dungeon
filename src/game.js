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
import { LevelSelectUI }                  from './ui/levelselect.js';
import { InstrumentSelectUI }             from './ui/instrumentselect.js';
import { TablatureSystem }       from './systems/tablature.js';
import { AttackSequenceSystem }  from './systems/attackSequence.js';
import { PromptManager }         from './systems/prompts.js';
import { loadProgress, saveProgress, awardStars, applySkills } from './systems/progression.js';
import { LEVELS, LEVELS_BY_ID, computeStars } from './data/levels.js';

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
      combo:             0,     // consecutive correct sequences
      activeIndex:       0,     // 0/1/2 — which note the player must press next
      pendingSpawn:      null,  // 1|null — consumed by game loop
      summonCooldownEnd: 0,     // performance.now() when cooldown expires (0 = none)
      nextRefreshTime:   0,     // performance.now() for auto-refresh; 0 = none
      blocked:           false, // true when resource check failed (drives red flash)
      blockedTime:       0,     // performance.now() when blocked was set
      sequenceDoneTime:  0,     // performance.now() when all 3 notes completed; 0 = not done
      unitType:          'archer', // set from first note of sequence: 'archer'|'knight'|'mage'
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
    inputMode:       'summon',   // 'summon' | 'attack' — toggled by Space
    modeAnnounce:    0,          // performance.now() timestamp; 0 = none
    showNoteLabels:  false,      // overridden by loadSettings()
    difficulty:      'medium',   // overridden by loadSettings()
    audioThreshold:  50,         // 0–100 mic sensitivity; overridden by loadSettings()
    masterVolume:    80,         // 0–100 output gain; overridden by loadSettings()
    showChordCues:   true,       // show chord name + tab at top; overridden by loadSettings()
    cueDisplayStyle: 'note',     // 'note'|'qwerty'|'staff'; overridden by loadSettings()
    currentPrompt:   null,       // { chord, tab, difficulty } — set by PromptManager

    // ── Combo — consecutive correct inputs; milestones grant bonus resources ──
    combo:              0,
    comboLastInputTime: 0,       // performance.now() of last note press (for decay)
    comboBonusTime:     0,       // performance.now() when milestone bonus was awarded (for flash)

    // ── Resources — earned via kills, spent on summons ──
    resources:          200,     // start 200; no auto-tick; kills add 20/30/50
    _lastKillMelodyMs:  0,       // throttle: ≤ 1 melody per 800 ms
    enemySpawnTimer:    8,       // seconds until next enemy spawn
    enemySpawnInterval: 8,       // current inter-spawn delay (reduces every 60 s of play)

    // ── Summon cooldown — top-level gate; 500 ms after any successful summon ──
    summonCooldownEnd:  0,       // performance.now() timestamp; 0 = no cooldown active

    // ── Instrument selection (title screen) ──
    instrument: 'piano',         // 'piano' | 'guitar' | 'voice'

    // ── Wave announcement ─────────────────────
    waveAnnounce: 0,         // performance.now() timestamp, 0 = none

    // ── Canvas dimensions (managed by onResize) ─
    canvas: { width: 0, height: 0, dpr: 1 },

    // ── Level & progression ───────────────────
    currentLevel:   null,    // LevelConfig — set when player picks a level
    starsEarned:    0,       // 0–3, computed at VICTORY

    // ── Skill buff fields (reset + applied by applySkills()) ─────────────────
    skillSummonCooldownBonus:  0,
    skillBaseHpBonus:          0,
    skillMaxUnitsBonus:        0,
    skillUnitHpMult:           1.0,
    skillUnitDamageMult:       1.0,
    skillComboDoubleMilestone: false,
    skillSpawnIntervalBonus:   0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const canvas   = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const ctx      = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const renderer = new Renderer(canvas, ctx);
const state    = createInitialState();

// Progression is loaded once; mutations are written back to localStorage via saveProgress()
let progression = loadProgress();

const settingsUI           = new SettingsUI();
const levelSelectUI        = new LevelSelectUI();
const instrumentSelectUI   = new InstrumentSelectUI();
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
  // Close settings panel whenever leaving TITLE
  if (scene !== SCENE.TITLE) {
    settingsUI.closePanel();
  }
  // Sync instrument select highlight on each visit
  if (scene === SCENE.INSTRUMENT_SELECT) {
    instrumentSelectUI.refresh(state.instrument || 'piano');
  }

  // Refresh level select display with latest progression on each visit
  if (scene === SCENE.LEVEL_SELECT) {
    levelSelectUI.refresh(progression);
  }

  // Populate victory / defeat overlays
  if (scene === SCENE.VICTORY) {
    const stars  = state.starsEarned ?? 0;
    const starsEl = document.getElementById('victory-stars');
    if (starsEl) {
      let html = '';
      for (let i = 0; i < 3; i++) {
        html += i < stars
          ? '<span class="star">★</span>'
          : '<span class="star-empty">★</span>';
      }
      starsEl.innerHTML = html;
    }
    const scoreEl = document.getElementById('victory-score');
    if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;
  }

  if (scene === SCENE.DEFEAT) {
    const scoreEl = document.getElementById('defeat-score');
    if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;
  }
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

  // TITLE → INSTRUMENT_SELECT
  $('btn-start')?.addEventListener('click', () => {
    setScene(SCENE.INSTRUMENT_SELECT);
  });

  // TITLE → PLAYING (practice mode — piano, Campfire level, bypasses menus)
  $('btn-practice')?.addEventListener('click', async () => {
    startCapture(state).catch(() => {});
    startGame(LEVELS_BY_ID['campfire']);
  });

  // LEVEL_SELECT → INSTRUMENT_SELECT (back)
  $('btn-ls-back')?.addEventListener('click', () => {
    setScene(SCENE.INSTRUMENT_SELECT);
  });

  // CALIBRATION → PLAYING
  $('btn-calibration-done')?.addEventListener('click', () => startGame());

  // VICTORY / DEFEAT → PLAYING (replay same level)
  $('btn-play-again-victory')?.addEventListener('click', () => startGame(state.currentLevel));
  $('btn-play-again-defeat')?.addEventListener('click',  () => startGame(state.currentLevel));

  // VICTORY → LEVEL_SELECT (or ENDGAME if all levels 3★)
  $('btn-title-victory')?.addEventListener('click', () => {
    const allThreeStars = LEVELS.every(l => (progression.bestStars[l.id] ?? 0) >= 3);
    setScene(allThreeStars ? SCENE.ENDGAME : SCENE.LEVEL_SELECT);
  });

  // DEFEAT → LEVEL_SELECT
  $('btn-title-defeat')?.addEventListener('click', () => setScene(SCENE.LEVEL_SELECT));

  // ENDGAME → LEVEL_SELECT
  $('btn-endgame-ls')?.addEventListener('click', () => setScene(SCENE.LEVEL_SELECT));
}

// ─────────────────────────────────────────────────────────────────────────────
// Game start — reset to fresh play state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reset and begin a new game round.
 *
 * @param {import('./data/levels.js').LevelConfig|null} [levelConfig]
 *   Level to play. Defaults to the last selected level or Campfire.
 */
function startGame(levelConfig) {
  // Resolve which level to use
  const level = levelConfig
    ?? state.currentLevel
    ?? LEVELS_BY_ID['campfire'];

  const fresh = createInitialState();

  // Preserve audio calibration
  Object.assign(fresh.audio, {
    ready:      state.audio.ready,
    noiseFloor: state.audio.noiseFloor,
  });

  // Preserve player settings across restarts
  Object.assign(fresh, {
    difficulty:      state.difficulty,
    showNoteLabels:  state.showNoteLabels,
    audioThreshold:  state.audioThreshold,
    masterVolume:    state.masterVolume,
    showChordCues:   state.showChordCues,
    cueDisplayStyle: state.cueDisplayStyle,
    instrument:      state.instrument || 'piano',
    inputMode:       'summon',   // always reset to summon on new game
    currentLevel:    level,
    starsEarned:     0,
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

  // Apply purchased skill buffs (also adjusts playerBase.hp/maxHp if iron-will bought)
  applySkills(state, progression);

  // Apply level starting resources (after skills so War Chest stacks)
  state.resources = level.startResources + (state.skillSummonCooldownBonus > 0 ? 0 : 0);
  // War Chest adds to resources via skill effect, level sets the base — combine them:
  // applySkills already ran state.resources += bonus on the fresh 200 default.
  // We replace with level value + whatever bonus was already added.
  const skillResourceBonus = state.resources - 200;   // delta from default
  state.resources = level.startResources + skillResourceBonus;

  // Apply difficulty to initial spawn timing
  const DIFF_INTERVALS = { easy: 12, medium: 8, hard: 5 };
  let baseInterval = DIFF_INTERVALS[state.difficulty] ?? 8;
  // Level spawnMod scales the interval (>1 = slower enemies = easier)
  baseInterval = baseInterval * (level.spawnMod ?? 1.0);
  state.enemySpawnInterval = baseInterval + (state.skillSpawnIntervalBonus || 0);
  state.enemySpawnTimer    = state.enemySpawnInterval;

  // Initialise subsystems
  tablatureSystem.reset(state);
  attackSequenceSystem.reset(state);
  promptManager.reset();

  // Announce Wave 1
  state.waveAnnounce = performance.now();

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
 * Hard cap: governed by state.currentLevel.maxEnemyCap (default 6).
 * Speed cap: enemy speed is halved vs player-unit base stats.
 */
function spawnEnemyUnit() {
  // Hard cap — respect per-level enemy count ceiling
  const cap = state.currentLevel?.maxEnemyCap ?? 6;
  let enemyCount = 0;
  for (let i = 0; i < state.units.length; i++) {
    if (state.units[i].team === 'enemy') enemyCount++;
  }
  if (enemyCount >= cap) return;

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
  // Level difficulty modifier scales enemy HP (difficultyMod < 1 = easier, > 1 = harder)
  const dMod = state.currentLevel?.difficultyMod ?? 1.0;
  if (dMod !== 1.0) {
    unit.hp    = Math.round(unit.hp    * dMod);
    unit.maxHp = Math.round(unit.maxHp * dMod);
  }
  // Apply unit damage buff from skills
  if (state.skillUnitDamageMult && state.skillUnitDamageMult !== 1.0) {
    // (damage buff applies to player units only — enemy units are untouched)
  }
  attackSequenceSystem.assignSequence(unit);
  state.units.push(unit);
}

/**
 * Spawn a player unit with role-based positioning and stats.
 * Silently fails if resources insufficient (when free=false).
 *
 * @param {1|2|3}       tier
 * @param {boolean}     [free=false]      — skip resource check/deduction
 * @param {string|null} [unitType=null]   — 'archer'|'knight'|'mage'|null
 * @param {number}      [swarmOffset=0]   — 0/1/2 spread index for mage swarm units
 */
function spawnPlayerUnit(tier, free = false, unitType = null, swarmOffset = 0) {
  const COST = [0, 20, 50, 100];
  const cost = free ? 0 : COST[tier];
  if (state.resources < cost) return;
  if (!free) state.resources -= cost;

  const W           = state.canvas.width;
  const H           = state.canvas.height;
  const laneCenter  = LANE_Y * H;
  const halfLane    = LANE_HEIGHT * H * 0.5;
  const laneTop     = laneCenter - halfLane;
  const laneBot     = laneCenter + halfLane;

  const isKnight = unitType === 'knight';
  const isMage   = unitType === 'mage';

  // Spawn x — knights guard near the player base; others appear just right of it
  const x = isKnight
    ? (PLAYER_BASE_X + BASE_WIDTH + 0.025) * W   // defensive: close to base
    : (PLAYER_BASE_X + BASE_WIDTH) * W + 20;     // offensive / swarm: base edge

  // Spawn y — mage units spread in a vertical cluster; others near lane centre
  const rawY = isMage
    ? laneCenter + (swarmOffset - 1) * 22          // offsets: −22, 0, +22 px
    : laneCenter + (Math.random() * 2 - 1) * 20;

  const radius = isMage ? 10 : [0, 12, 16, 20][tier];
  const y      = Math.max(laneTop + radius, Math.min(laneBot - radius, rawY));

  const unit = new Unit('player', tier, x, y);

  // Apply skill HP and damage multipliers to player units
  if (state.skillUnitHpMult && state.skillUnitHpMult !== 1.0) {
    unit.hp    = Math.round(unit.hp    * state.skillUnitHpMult);
    unit.maxHp = Math.round(unit.maxHp * state.skillUnitHpMult);
  }
  if (state.skillUnitDamageMult && state.skillUnitDamageMult !== 1.0) {
    unit.damage = Math.round(unit.damage * state.skillUnitDamageMult);
  }

  // Visual type
  if (unitType) unit.unitType = unitType;

  // Movement role + patrol anchor
  unit.role          = isKnight ? 'defensive' : isMage ? 'swarm' : 'offensive';
  unit.patrolAnchorX = x;
  unit.patrolAnchorY = laneCenter;   // lane centre — used for y-drift by offensive

  // Swarm (mage) stat overrides — small, fast, fragile
  if (isMage) {
    unit.radius      = 10;
    unit.hp          = 15;
    unit.maxHp       = 15;
    unit.damage      = 5;
    unit.speed       = 85;
    unit.attackSpeed = 1.5;
    unit.range       = 45;
  }

  state.units.push(unit);
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

      // ── Wave progression (every 30 s of play time, capped by level) ────────
      const maxWaves  = state.currentLevel?.maxWaves ?? 10;
      const targetWave = Math.min(maxWaves, 1 + Math.floor(state.time / 30));
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

      // ── Combo decay (4 s of no input resets combo to 0) ──────────────────
      if (state.combo > 0 && state.comboLastInputTime > 0) {
        if (performance.now() - state.comboLastInputTime > 4000) {
          state.combo = 0;
        }
      }

      // ── Tablature spawn — gated by resources + top-level summon cooldown ──
      if (state.tablature.pendingSpawn !== null) {
        const now        = performance.now();
        const tier       = state.tablature.pendingSpawn;
        const unitType   = state.tablature.unitType || 'archer';
        const SUMMON_COST = [0, 50, 75, 100];
        const cost       = SUMMON_COST[tier] ?? 50;
        // Mage spawns 3 swarm units for the same resource cost
        const spawnCount = (unitType === 'mage') ? 3 : 1;

        if (now < (state.summonCooldownEnd || 0)) {
          // Top-level cooldown still active — silently discard
          console.log(`[summon] top-level cooldown active, discarding pendingSpawn`);
        } else if (state.resources >= cost) {
          state.resources        -= cost;
          state.summonCooldownEnd = now + 500;   // 500 ms top-level gate
          for (let si = 0; si < spawnCount; si++) {
            spawnPlayerUnit(tier, true, unitType, si);
          }
          console.log(`SPAWN: ${unitType} cost:${cost} resources:${Math.floor(state.resources)}`);
        } else {
          // Trigger red-flash on summon bar
          state.tablature.blocked     = true;
          state.tablature.blockedTime = now;
          console.log(`[summon] blocked: need ${cost}, have ${Math.floor(state.resources)}`);
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
            // Kill increments combo
            state.combo = (state.combo || 0) + 1;
            state.comboLastInputTime = performance.now();
            const COMBO_MILESTONES = [5, 10, 20];
            if (COMBO_MILESTONES.includes(state.combo)) {
              const bonus = state.skillComboDoubleMilestone ? 50 : 25;
              state.resources      = Math.min(999, state.resources + bonus);
              state.comboBonusTime = performance.now();
              console.log(`[combo] milestone ${state.combo} → +${bonus} bonus resources`);
            }
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
      if (state.playerBase.isDestroyed()) {
        setScene(SCENE.DEFEAT);
        break;
      }
      if (state.enemyBase.isDestroyed()) {
        // Compute and persist star result
        if (state.currentLevel) {
          state.starsEarned = computeStars(
            state.playerBase.hp,
            state.playerBase.maxHp,
            state.currentLevel
          );
          progression = awardStars(state.currentLevel.id, state.starsEarned, progression);
          saveProgress(progression);
          console.log(`[victory] ${state.starsEarned}★ on ${state.currentLevel.id}`);
        }
        setScene(SCENE.VICTORY);
        break;
      }
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
settingsUI.render(state);

// InstrumentSelectUI: render once; callback saves choice + advances to LEVEL_SELECT.
instrumentSelectUI.render(
  state.instrument || 'piano',
  (instrumentId) => {
    state.instrument = instrumentId;
    settingsUI.saveSettings(state);
    setScene(SCENE.LEVEL_SELECT);
  }
);

// LevelSelectUI: render once with current progression.
// onSelectLevel triggers calibration (for guitar) or direct game start (for piano/practice).
levelSelectUI.render(
  progression,
  (levelConfig) => {
    state.currentLevel = levelConfig;
    if (state.instrument === 'guitar' || state.instrument === 'voice') {
      // Mic needed — go through calibration first
      setScene(SCENE.CALIBRATION);
      startCapture(state).catch(() => {});
    } else {
      // Piano mode — start immediately
      startCapture(state).catch(() => {});
      startGame(levelConfig);
    }
  },
  (updatedProg) => {
    progression = updatedProg;
  }
);

initPianoTouchInput(canvas, (note) => keyboardInput.dispatchNote(note), (mode) => {
  if (state.scene !== SCENE.PLAYING) return;
  if (state.inputMode === mode) return;
  state.inputMode    = mode;
  state.modeAnnounce = performance.now();
  if (mode === 'summon') tablatureSystem.refresh(state);
  console.log(`[mode] tapped → ${mode}`);
});

requestAnimationFrame((ts) => {
  lastTimestamp = ts;
  requestAnimationFrame(loop);
});
