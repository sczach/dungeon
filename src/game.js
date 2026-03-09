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
import { CueSystem }             from './systems/cueSystem.js';
import { PromptManager }         from './systems/prompts.js';
import { loadProgress, saveProgress, awardStars, applySkills } from './systems/progression.js';
import { LEVELS, LEVELS_BY_ID, computeStars } from './data/levels.js';

// Re-export SCENE for callers that import from game.js
export { SCENE };

// ─────────────────────────────────────────────────────────────────────────────
// Phase system
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default phase schedule used when a level config omits the phases array.
 * Introduction (60 s) → Development (90 s) → Climax (open-ended).
 */
const DEFAULT_PHASES = Object.freeze([
  Object.freeze({ label: 'Introduction', duration: 60  }),
  Object.freeze({ label: 'Development',  duration: 90  }),
  Object.freeze({ label: 'Climax',       duration: null }),
]);

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
      unitType:          'dps',    // set from first note of sequence: 'tank'|'dps'|'ranged'|'mage'
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
    playerBase:  null,        // Base instance
    enemyBase:   null,        // Base instance — alias to enemyBases[0] for backward compat
    enemyBases:  [],          // Base[] — all active enemy bases (≥1)
    _spawnBaseIdx: 0,         // round-robin index for enemy spawning

    // ── Entities ──────────────────────────────
    units: [],               // Unit[] — both player and enemy units
    lightningBolts: [],      // {x1,y1,x2,y2,startTime,duration,segments}[] — active bolt animations
    attackMisses:   0,       // notes pressed in ATTACK mode with no enemy match (accuracy tracking)
    projectiles:    [],      // {x,y,tx,ty,startTime,travelTime,team}[] — ranged unit shot visuals

    // ── Melody phase system ───────────────────
    currentPhase:         0,           // 0=Introduction, 1=Development, 2=Climax
    phaseTime:            0,           // elapsed seconds in current phase
    phaseLabel:           'Introduction',
    phaseAnnounce:        0,           // performance.now() when phase last changed (for overlay)
    phrasePlaysThisPhase: 0,           // tablature sequences completed since phase start

    // ── Musical cue system ────────────────────
    currentCue:           null,        // {note, startTime, deadline, status} | null

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
    noteAccuracy:   100,     // 0–100 note accuracy % for this run (set at VICTORY)

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
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the nearest alive enemy base to (x, y), or null if all are destroyed.
 * Zero allocation: indexed for-loop, scalar arithmetic.
 *
 * @param {import('./systems/base.js').Base[]} bases
 * @param {number} x
 * @param {number} y
 * @returns {import('./systems/base.js').Base|null}
 */
function findNearestAliveBase(bases, x, y) {
  let best  = null;
  let bestD2 = Infinity;
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];
    if (b.isDestroyed()) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = b; }
  }
  return best;
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
const cueSystem            = new CueSystem();

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
    const stars   = state.starsEarned ?? 0;
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
    const acc     = state.noteAccuracy ?? 100;
    const accEl   = document.getElementById('victory-accuracy');
    if (accEl) accEl.textContent = `Note accuracy: ${acc}%`;
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
  if (state.enemyBases.length > 0 && state.currentLevel) {
    const cfgs = state.currentLevel.enemyBases ?? [{ x: ENEMY_BASE_X, y: LANE_Y }];
    for (let i = 0; i < state.enemyBases.length; i++) {
      const cfg = cfgs[i] ?? cfgs[0];
      state.enemyBases[i].x = (cfg.x + BASE_WIDTH / 2) * w;
      state.enemyBases[i].y = cfg.y * h;
    }
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

  // Build all enemy bases from level config (default: single centre base)
  const baseCfgs   = level.enemyBases ?? [{ x: ENEMY_BASE_X, y: LANE_Y }];
  state.enemyBases = baseCfgs.map(cfg => new Base('enemy', (cfg.x + BASE_WIDTH / 2) * W, cfg.y * H));
  state.enemyBase  = state.enemyBases[0];   // backward-compat alias

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
  cueSystem.reset(state);
  promptManager.reset();

  // Announce Wave 1
  state.waveAnnounce = performance.now();

  // Set initial phase label and enemy base vulnerability (all bases invulnerable until Climax)
  {
    const phases = level.phases ?? DEFAULT_PHASES;
    state.phaseLabel = phases[0]?.label ?? 'Introduction';
    const startVulnerable = (phases.length <= 1);
    for (let i = 0; i < state.enemyBases.length; i++) {
      state.enemyBases[i].vulnerable = startVulnerable;
    }
    state.phaseAnnounce = performance.now();
  }

  keyboardInput.start(state, tablatureSystem, attackSequenceSystem, cueSystem);
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

  const W = state.canvas.width;
  const H = state.canvas.height;

  // Round-robin base selection — skip destroyed bases
  const numBases = state.enemyBases.length;
  let spawnBase = null;
  for (let attempt = 0; attempt < numBases; attempt++) {
    const idx = (state._spawnBaseIdx + attempt) % numBases;
    if (!state.enemyBases[idx].isDestroyed()) {
      spawnBase             = state.enemyBases[idx];
      state._spawnBaseIdx   = (idx + 1) % numBases;
      break;
    }
  }
  if (!spawnBase) return;   // all bases destroyed — win condition about to trigger

  const halfLane   = LANE_HEIGHT * H * 0.5;
  const laneCenter = spawnBase.y;
  const laneTop    = laneCenter - halfLane;
  const laneBot    = laneCenter + halfLane;
  const spread     = halfLane * 0.65;
  const rawY       = laneCenter + (Math.random() * 2 - 1) * spread;

  const tier   = rollEnemyTier(state.wave, state.time);
  const radius = [0, 12, 16, 20][tier];
  const y      = Math.max(laneTop + radius, Math.min(laneBot - radius, rawY));
  const x      = spawnBase.x - BASE_WIDTH * W / 2 - 20;   // just left of this base

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
 * @param {string|null} [unitType=null] — 'tank'|'dps'|'ranged'|'mage'|null
 */
function spawnPlayerUnit(tier, free = false, unitType = null) {
  const COST = [0, 20, 50, 100];
  const cost = free ? 0 : COST[tier];
  if (state.resources < cost) return;
  if (!free) state.resources -= cost;

  const W          = state.canvas.width;
  const H          = state.canvas.height;
  const laneCenter = LANE_Y * H;
  const halfLane   = LANE_HEIGHT * H * 0.5;
  const laneTop    = laneCenter - halfLane;
  const laneBot    = laneCenter + halfLane;

  // Mages spawn right beside the player base so they can safely patrol there
  const isMage = unitType === 'mage';
  const x      = isMage
    ? (PLAYER_BASE_X + BASE_WIDTH + 0.01) * W     // mage: hugs base
    : (PLAYER_BASE_X + BASE_WIDTH) * W + 20;      // others: base edge

  const rawY   = laneCenter + (Math.random() * 2 - 1) * 20;
  const radius = [0, 12, 16, 20][tier] ?? 12;
  const y      = Math.max(laneTop + radius, Math.min(laneBot - radius, rawY));

  const unit = new Unit('player', tier, x, y);

  // ── Archetype stat overrides ───────────────────────────────────────────
  // Each archetype replaces the generic tier stats with role-appropriate values.
  switch (unitType) {
    case 'tank':
      unit.hp = unit.maxHp = 200;
      unit.damage      = 6;
      unit.speed       = 40;
      unit.range       = 60;
      unit.attackSpeed = 0.7;
      unit.radius      = 20;
      unit.role        = 'tank';
      // patrolAnchorX = midfield (45 % of canvas width)
      unit.patrolAnchorX = W * 0.45;
      unit.patrolAnchorY = laneCenter;
      break;

    case 'dps':
      unit.hp = unit.maxHp = 25;
      unit.damage      = 20;
      unit.speed       = 100;
      unit.range       = 50;
      unit.attackSpeed = 1.5;
      unit.radius      = 10;
      unit.role        = 'dps';
      unit.patrolAnchorX = x;
      unit.patrolAnchorY = laneCenter;
      break;

    case 'ranged':
      unit.hp = unit.maxHp = 40;
      unit.damage      = 12;
      unit.speed       = 70;
      unit.range       = 180;
      unit.attackSpeed = 0.8;
      unit.radius      = 12;
      unit.role        = 'ranged';
      unit.patrolAnchorX = x;
      unit.patrolAnchorY = laneCenter;
      break;

    case 'mage':
      unit.hp = unit.maxHp = 50;
      unit.damage        = 8;
      unit.speed         = 30;
      unit.range         = 120;
      unit.attackSpeed   = 1.0;
      unit.radius        = 14;
      unit.role          = 'mage';
      unit.pulseCooldown = 1.5;      // first pulse at 1.5 s (sooner than 3 s repeat)
      unit.patrolAnchorX = x;
      unit.patrolAnchorY = laneCenter;
      break;

    default:
      // Legacy fallback — offensive archer stats from tier table
      unit.role          = 'offensive';
      unit.patrolAnchorX = x;
      unit.patrolAnchorY = laneCenter;
  }

  // ── Apply skill multipliers (after archetype override so they stack) ───
  if (state.skillUnitHpMult && state.skillUnitHpMult !== 1.0) {
    unit.hp    = Math.round(unit.hp    * state.skillUnitHpMult);
    unit.maxHp = Math.round(unit.maxHp * state.skillUnitHpMult);
  }
  if (state.skillUnitDamageMult && state.skillUnitDamageMult !== 1.0) {
    unit.damage = Math.round(unit.damage * state.skillUnitDamageMult);
  }

  if (unitType) unit.unitType = unitType;

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
      cueSystem.update(dt, state);
      promptManager.update(dt, state);

      // ── Lightning bolt cleanup (remove expired bolts) ──────────────────
      {
        const nowMs = performance.now();
        for (let bi = state.lightningBolts.length - 1; bi >= 0; bi--) {
          if (nowMs - state.lightningBolts[bi].startTime >= state.lightningBolts[bi].duration) {
            state.lightningBolts.splice(bi, 1);
          }
        }
        // Ranged-unit projectile cleanup (remove arrived orbs)
        for (let pi = state.projectiles.length - 1; pi >= 0; pi--) {
          const p = state.projectiles[pi];
          if (nowMs - p.startTime >= p.travelTime) {
            state.projectiles.splice(pi, 1);
          }
        }
      }
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
        const unitType   = state.tablature.unitType || 'dps';
        const SUMMON_COST = [0, 50, 75, 100];
        const cost       = SUMMON_COST[tier] ?? 50;
        // All archetypes spawn as a single unit (mage is no longer a swarm)
        const MAX_PLAYER = 8 + (state.skillMaxUnitsBonus || 0);

        let playerCount = 0;
        for (let pu = 0; pu < state.units.length; pu++) {
          if (state.units[pu].team === 'player') playerCount++;
        }

        if (now < (state.summonCooldownEnd || 0)) {
          // Top-level cooldown still active — silently discard
          console.log(`[summon] top-level cooldown active, discarding pendingSpawn`);
        } else if (playerCount >= MAX_PLAYER) {
          // Unit cap reached — block but let combo continue
          state.tablature.blocked     = true;
          state.tablature.blockedTime = now;
          console.log(`[summon] blocked: unit cap ${MAX_PLAYER}`);
        } else if (state.resources >= cost) {
          state.resources        -= cost;
          state.summonCooldownEnd = now + 500;   // 500 ms top-level gate
          spawnPlayerUnit(tier, true, unitType);
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
      //
      // Multi-base: disable lane clamping so units can move freely in y.
      // Per-player-unit: resolve nearest alive enemy base (minimises wasted marching).
      const multiBase = state.enemyBases.length > 1;
      const bases = {
        player:        state.playerBase,
        enemy:         state.enemyBase,
        clampDisabled: multiBase,
      };
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
        // Resolve target base per player unit (nearest alive base in multi-base levels)
        if (multiBase && u.team === 'player') {
          bases.enemy = findNearestAliveBase(state.enemyBases, u.x, u.y) ?? state.enemyBase;
        } else {
          bases.enemy = state.enemyBase;
        }
        u.update(dt, state.units, bases);
        // Collect ranged-unit projectile visuals
        if (u.pendingProjectile) {
          state.projectiles.push(u.pendingProjectile);
          u.pendingProjectile = null;
        }
      }

      // ── Phase progression ─────────────────────────────────────────────────
      {
        const phases    = state.currentLevel?.phases ?? DEFAULT_PHASES;
        const curPhaseIdx = state.currentPhase;
        state.phaseTime += dt;
        if (curPhaseIdx < phases.length - 1) {
          const phaseDuration = phases[curPhaseIdx].duration;
          if (phaseDuration !== null && state.phaseTime >= phaseDuration) {
            // Advance to the next phase
            const nextIdx           = curPhaseIdx + 1;
            state.currentPhase      = nextIdx;
            state.phaseTime         = 0;
            state.phrasePlaysThisPhase = 0;
            state.phaseLabel        = phases[nextIdx].label ?? `Phase ${nextIdx + 1}`;
            state.phaseAnnounce     = performance.now();
            // All enemy bases become vulnerable only in the final (Climax) phase
            const nowVulnerable = (nextIdx >= phases.length - 1);
            for (let bi = 0; bi < state.enemyBases.length; bi++) {
              state.enemyBases[bi].vulnerable = nowVulnerable;
            }
            console.log(`[phase] → ${state.phaseLabel} (phase ${nextIdx + 1}/${phases.length})`);
          }
        }
      }

      // ── Win / lose ────────────────────────────────────────────────────────
      if (state.playerBase.isDestroyed()) {
        setScene(SCENE.DEFEAT);
        break;
      }

      // Victory only available in the final phase (Climax)
      if (state.currentPhase >= ((state.currentLevel?.phases ?? DEFAULT_PHASES).length - 1)) {
        // All enemy bases must be destroyed to win by base destruction
        let wonByBase = state.enemyBases.length > 0 && state.enemyBases.every(b => b.isDestroyed());

        // Performance win: ≥2 complete sequences in Climax with ≥70 % accuracy
        const tab         = state.tablature;
        const totalNotes  = (tab.totalHits || 0) + (tab.totalMisses || 0);
        const accuracy    = totalNotes > 0 ? (tab.totalHits || 0) / totalNotes : 1;
        const wonByPhrase = state.phrasePlaysThisPhase >= 2 && accuracy >= 0.70;

        if (wonByBase || wonByPhrase) {
          // Compute accuracy and persist result
          state.noteAccuracy = totalNotes > 0
            ? Math.round((tab.totalHits || 0) / totalNotes * 100)
            : 100;

          if (state.currentLevel) {
            state.starsEarned = computeStars(state.noteAccuracy, state.currentLevel);
            progression = awardStars(state.currentLevel.id, state.starsEarned, progression);
            saveProgress(progression);
            const why = wonByBase ? 'base destroyed' : 'phrase performance';
            console.log(`[victory] ${state.starsEarned}★ acc=${state.noteAccuracy}% via ${why}`);
          }
          setScene(SCENE.VICTORY);
          break;
        }
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
