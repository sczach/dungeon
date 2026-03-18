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
import { startCapture, updateAudio, updateCalibration, resumeAudioContext } from './audio/index.js';
import { Unit }                  from './entities/unit.js';
import { Base }                  from './systems/base.js';
import { keyboardInput, playSuccessKill } from './input/keyboard.js';
import { midiInput }                      from './input/midi.js';
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
import { WORLD_MAP_NODES, WORLD_MAP_NODES_BY_ID, isNodeUnlocked } from './data/worldMap.js';
import { getNodeAtPoint, getPlayButtonBounds, getResetViewButtonBounds } from './ui/worldMapRenderer.js';
import { generateMelody, playMelody, stopMelody } from './audio/melodyEngine.js';
import {
  startSoundEngine,
  stopSoundEngine,
  syncSoundEngine,
  onGameEvent,
} from './audio/soundEngine.js';
import { applyLesson }                             from './data/lessons.js';
import { wireSettingsUI }                           from './ui/screens.js';
import { minigameEngine }                          from './systems/minigameEngine.js';
import { MetronomeMastery }                        from './minigames/metronomeMastery.js';
import { RhythmChallenge }                         from './minigames/rhythmChallenge.js';

// Re-export SCENE for callers that import from game.js
export { SCENE };

// ── Register minigame types ─────────────────────────────────────────────────
minigameEngine.register('metronome-mastery', MetronomeMastery);
minigameEngine.register('rhythm-challenge',  RhythmChallenge);

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
      pitchStable:   false,  // true when same note detected for ≥ STABLE_FRAMES consecutive frames
      rms:           0,      // current RMS amplitude (written each frame for debug overlay)
      ctxState:      'none', // AudioContext.state string (written each frame for debug overlay)
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
    lightningBolts: [],      // {x1,y1,x2,y2,startTime,duration,segments,chargeLevel}[] — active bolt animations
    attackMisses:   0,       // notes pressed in ATTACK mode with no enemy match (accuracy tracking)
    projectiles:    [],      // {x,y,tx,ty,startTime,travelTime,team}[] — ranged unit shot visuals
    damageNumbers:  [],      // {x,y,value,startTime,color}[] — floating hit numbers
    shakeTime:      0,       // performance.now() when shake started (0 = none)
    shakeIntensity: 0,       // px amplitude of shake

    // ── Charge mechanic ───────────────────────
    chargeNote:      null,   // string|null — note held in charge mode
    chargeStartTime: 0,      // performance.now() when charge hold started
    chargeProgress:  0,      // 0.0–3.0 (0.8 s per segment)
    waveGraceEnd:    0,      // state.time when wave grace period ends (bases invulnerable until then)

    // ── Note enforcement (attack mode cue gating) ─
    attackCooldownEnd: 0,    // performance.now() when 400ms attack cooldown expires
    wrongNoteFlash:    null, // { time: number } | null — drives cue card red flash (300ms)

    // ── Mode indicator (Fix 4) ────────────────────
    lastAttackModeTime: 0,   // state.time of last frame spent in attack mode
    attackSuggestPulse: false, // true when enemies present + not in attack mode for >5s

    // ── Melody phase system ───────────────────
    currentPhase:         0,           // 0=Introduction, 1=Development, 2=Climax
    phaseTime:            0,           // elapsed seconds in current phase
    phaseLabel:           'Introduction',
    phaseAnnounce:        0,           // performance.now() when phase last changed (for overlay)
    phrasePlaysThisPhase: 0,           // tablature sequences completed since phase start

    // ── Musical cue system ────────────────────
    currentCue:           null,        // {note, startTime, deadline, status} | null

    // ── Mode & settings ───────────────────────
    inputMode:       'summon',   // 'summon' | 'attack' | 'charge' — toggled by Space
    modeAnnounce:    0,          // performance.now() timestamp; 0 = none
    showNoteLabels:  false,      // overridden by loadSettings()
    difficulty:      'medium',   // overridden by loadSettings()
    audioThreshold:  50,         // 0–100 mic sensitivity; overridden by loadSettings()
    masterVolume:    80,         // 0–100 output gain; overridden by loadSettings()
    showChordCues:   true,       // show chord name + tab at top; overridden by loadSettings()
    cueDisplayStyle: 'note',     // 'note'|'qwerty'|'staff'; overridden by loadSettings()
    currentPrompt:   null,       // { chord, tab, difficulty } — set by PromptManager

    // ── Guitar-Hero note display — large centred note when any key is pressed ──
    noteDisplay: { note: null, startTime: 0 },

    // ── Combo — consecutive correct inputs; milestones grant bonus resources ──
    combo:              0,
    comboLastInputTime: 0,       // performance.now() of last note press (for decay)
    comboBonusTime:     0,       // performance.now() when milestone bonus was awarded (for flash)

    // ── Resources — earned via kills, spent on summons ──
    resources:          200,     // start 200; no auto-tick; kills add 20/30/50
    _lastKillMelodyMs:  0,       // throttle: ≤ 1 melody per 800 ms
    enemySpawnTimer:    0,       // seconds until next enemy spawn (0 = first enemy spawns immediately)
    enemySpawnInterval: 1.5,     // seconds between spawns (set by difficulty at startGame)

    // ── Wave density tracking ─────────────────────────────────────────────
    waveEnemiesSpawned: 0,       // enemies spawned in current wave
    waveEnemiesKilled:  0,       // enemies killed from current wave
    waveSize:           8,       // total enemies for this wave
    waveOverlapping:    false,   // true when next wave started early (50% threshold)
    betweenWavesTimer:  0,       // countdown (seconds) between waves; 0 = actively spawning

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

    // ── Lesson (level-as-lesson content system) ────────────────────────────
    currentLesson:  null,    // LessonConfig | null — applied by applyLesson() in startGame()
    chordPlayCounts:{},      // map of chord root → play count (Level 3 success metric)

    // ── Victory melody ─────────────────────────────────────────────────────
    victoryMelody:  null,    // MelodyResult | null — generated at VICTORY, played on screen

    // ── World map (camera + selection + zoom) ───────────────────────────────
    worldMap: {
      selectedNodeId:       null,  // id of currently highlighted node
      lastPlayedNodeId:     null,  // id of last completed level (teal ring on return)
      cameraX:              0,     // pan offset in logical pixels
      cameraY:              0,
      isDragging:           false,
      dragAnchorX:          0,     // pointer position when drag started
      dragAnchorY:          0,
      dragCamStartX:        0,     // cameraX value when drag started
      dragCamStartY:        0,
      showTutorialComplete: false, // banner shown after T4 victory
      // ── Zoom ──────────────────────────────────────────────────────────────
      zoom:                 1.0,   // current zoom level (applied to canvas transform)
      zoomTarget:           1.0,   // target zoom (lerped toward each frame)
      // ── Pan animation (hub reveal after T4 unlock) ─────────────────────
      panAnimating:         false, // true while smoothly panning to hub
      regionsUnlockedBanner: null, // { startTime: number } | null — overlay timer
      // ── Pinch-to-zoom touch state ─────────────────────────────────────
      pinchDist0:           null,  // initial distance between two fingers
      pinchZoom0:           1.0,   // zoom at pinch start
    },

    // ── Tutorial / level-start ────────────────────────────────────────────────
    pendingLevel:      null,   // WorldMapNode to start after LEVEL_START screen
    allowedModes:      null,   // null = all modes; string[] = tutorial lock
    chargeUnlocksBase: false,  // T4: enemy base invulnerable until first charge

    // ── Debug ─────────────────────────────────────────────────────────────────
    debugOverlay: false,         // toggled by backtick key; draws audio pipeline HUD

    // ── Skill buff fields (reset + applied by applySkills()) ─────────────────
    skillSummonCooldownBonus:  0,
    skillBaseHpBonus:          0,
    skillMaxUnitsBonus:        0,
    skillUnitHpMult:           1.0,
    skillUnitDamageMult:       1.0,
    skillComboDoubleMilestone: false,
    skillSpawnIntervalBonus:   0,
    // Musical progression skill fields (Tier I–III)
    skillTimingWindowMult:     1.0,
    skillChordMemory:          false,
    skillRhythmReading:        false,
    skillUnlockMage:           false,
    skillSightReading:         false,
    skillTempoMaster:          false,
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

// ── Sound engine change-detection sentinels (no per-frame allocation) ────────
/** Previous player base HP — detects damage taken. */
let _prevPlayerHp = Infinity;
/** Previous modeAnnounce timestamp — detects mode switch. */
let _prevModeAnnounce = 0;
/**
 * Last mic-detected note dispatched to the game systems.
 * Tracks the folded (C3-octave) note name so the same note isn't dispatched
 * on every stable frame — only on the leading edge of each new note.
 * Reset to null when confidence hits 0 so the same note can re-trigger.
 * @type {string|null}
 */
let _prevMicNote = null;

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

// ─────────────────────────────────────────────────────────────────────────────
// Victory melody — piano-roll visualiser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rough frequency lookup for piano-roll Y positioning.
 * Duplicated from melodyEngine to avoid a circular reference.
 * @type {Object.<string, number>}
 */
const _VFREQ = {
  'C3':130.81,'D3':146.83,'E3':164.81,'F3':174.61,'F#3':185.00,
  'G3':196.00,'A3':220.00,'B3':246.94,'C#4':277.18,'C4':261.63,
  'D4':293.66,'E4':329.63,'F4':349.23,'F#4':369.99,'G4':392.00,
  'A4':440.00,'B4':493.88,'C#5':554.37,'C5':523.25,'D5':587.33,'E5':659.25,
};

/**
 * Draw a colour-coded piano-roll strip on the #victory-staff canvas.
 * Notes are laid out left-to-right by time; vertical position encodes pitch.
 * Higher pitch → lower y-position (top of canvas = highest note).
 *
 * @param {import('./audio/melodyEngine.js').MelodyResult} melody
 */
function drawMelodyPianoRoll(melody) {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('victory-staff'));
  if (!canvas || !melody?.notes?.length) return;
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx2.clearRect(0, 0, W, H);

  // Background
  ctx2.fillStyle = '#080814';
  ctx2.fillRect(0, 0, W, H);

  // Staff lines (5 decorative lines)
  ctx2.strokeStyle = '#1c1c30';
  ctx2.lineWidth   = 1;
  for (let i = 0; i < 5; i++) {
    const y = H * 0.15 + i * (H * 0.70 / 4);
    ctx2.beginPath();
    ctx2.moveTo(0, y);
    ctx2.lineTo(W, y);
    ctx2.stroke();
  }

  // Compute bounds
  const lastNote   = melody.notes[melody.notes.length - 1];
  const totalBeats = lastNote.beat + lastNote.duration;
  const pxPerBeat  = W / Math.max(totalBeats, 1);
  const noteH      = Math.max(6, H * 0.13);
  const pad        = 1;

  // Pitch range for Y normalisation
  const freqs  = melody.notes.map(n => _VFREQ[n.note] ?? 261.63);
  const minF   = Math.min(...freqs);
  const maxF   = Math.max(...freqs);
  const fRange = Math.max(maxF - minF, 1);

  for (let i = 0; i < melody.notes.length; i++) {
    const n    = melody.notes[i];
    const freq = _VFREQ[n.note] ?? 261.63;
    const x    = n.beat * pxPerBeat + pad;
    const w    = Math.max(4, n.duration * pxPerBeat - pad * 2);
    // Higher freq → smaller y (towards top)
    const yNorm = 1 - (freq - minF) / fRange;
    const y     = yNorm * (H - noteH - 8) + 4;

    // Colour gradient: low = blue-violet, mid = cyan, high = amber
    const t  = (freq - minF) / fRange;
    const r  = Math.round(60  + t * 172);
    const g  = Math.round(120 + (t < 0.5 ? t * 120 : (1 - t) * 120));
    const b  = Math.round(220 - t * 140);
    ctx2.fillStyle = `rgb(${r},${g},${b})`;

    // Rounded rect (manual, compatible with older engines)
    const radius = Math.min(3, noteH / 2, w / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + radius, y);
    ctx2.lineTo(x + w - radius, y);
    ctx2.arcTo(x + w, y,         x + w, y + noteH, radius);
    ctx2.arcTo(x + w, y + noteH, x,     y + noteH, radius);
    ctx2.arcTo(x,     y + noteH, x,     y,         radius);
    ctx2.arcTo(x,     y,         x + w, y,         radius);
    ctx2.closePath();
    ctx2.fill();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Victory helper — awards stars and routes to the correct next scene
// ─────────────────────────────────────────────────────────────────────────────

function _handleVictory() {
  const tab        = state.tablature;
  const totalNotes = (tab.totalHits || 0) + (tab.totalMisses || 0);
  state.noteAccuracy = totalNotes > 0
    ? Math.round((tab.totalHits || 0) / totalNotes * 100)
    : 100;

  const level = state.currentLevel;
  if (level) {
    state.starsEarned = computeStars(state.noteAccuracy, level);
    progression = awardStars(level.id, state.starsEarned, progression);
    saveProgress(progression);
    state._progression = progression;
    console.log(`[victory] ${state.starsEarned}★ acc=${state.noteAccuracy}% level=${level.id}`);
  }

  // Mark tutorial complete when T4 is beaten (gates world map unlock + hub pan)
  if (level?.id === 'tutorial-4') {
    progression.tutorialComplete         = true;
    saveProgress(progression);
    state._progression                   = progression;
    state.worldMap.showTutorialComplete  = true; // triggers banner + hub pan animation
    console.log('[unlock] Tutorial complete → The Crossroads and all region entry nodes unlocked');
  }

  // Track last played node so world map can highlight it with a teal ring
  if (level?.id) {
    state.worldMap.lastPlayedNodeId = level.id;
  }

  // Always show VICTORY screen — player navigates back to world map themselves
  setScene(SCENE.VICTORY);
}

/**
 * Handle result from a minigame handler's done() callback.
 * Routes to VICTORY or DEFEAT, persists stars like the tower-defense path.
 * @param {import('./systems/minigameEngine.js').MinigameResult} result
 */
function _handleMinigameResult(result) {
  const level = state.currentLevel;

  state.noteAccuracy = result.accuracyPct ?? 0;
  state.score        = result.score       ?? 0;
  state.starsEarned  = result.stars       ?? 0;

  if (level && result.passed) {
    progression = awardStars(level.id, state.starsEarned, progression);
    saveProgress(progression);
    state._progression = progression;
    console.log(`[minigame] victory ${state.starsEarned}★ acc=${state.noteAccuracy}% level=${level.id}`);
  }

  if (level?.id) {
    state.worldMap.lastPlayedNodeId = level.id;
  }

  setScene(result.passed ? SCENE.VICTORY : SCENE.DEFEAT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene management
// ─────────────────────────────────────────────────────────────────────────────

/** Apply scene change, update <body> data attribute, and clean up subsystems. */
function setScene(scene) {
  // Stop keyboard and sound engine when leaving PLAYING so state doesn't bleed
  if (state.scene === SCENE.PLAYING && scene !== SCENE.PLAYING) {
    keyboardInput.stop();
    stopSoundEngine();
  }
  // Tear down active minigame when leaving MINIGAME scene
  if (state.scene === SCENE.MINIGAME && scene !== SCENE.MINIGAME) {
    minigameEngine.stop();
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

  // World map: centre camera on first visit; trigger hub pan when newly unlocked
  if (scene === SCENE.WORLD_MAP) {
    const W    = state.canvas.width, H = state.canvas.height;
    const zoom = state.worldMap.zoom ?? 1.0;
    if (state.worldMap.cameraX === 0 && state.worldMap.cameraY === 0) {
      // Default view: tutorial spine centred at (1200, 1430) in the 2400×1800 map
      state.worldMap.cameraX = Math.round(W / 2 - 1200 * zoom);
      state.worldMap.cameraY = Math.round(H / 2 - 1430 * zoom);
    }
    // Pan to hub and show regions-unlocked overlay on first post-T4 arrival
    if (state.worldMap.showTutorialComplete && !state.worldMap.panAnimating
        && !state.worldMap.regionsUnlockedBanner) {
      state.worldMap.panAnimating          = true;
      state.worldMap.regionsUnlockedBanner = { startTime: performance.now() };
    }
    state._progression = progression;
    console.log(`[world-map] Arrived — tutorialComplete=${progression.tutorialComplete} bestStars=${JSON.stringify(progression.bestStars)}`);
  }

  // Populate level-start overlay from pending level node
  if (scene === SCENE.LEVEL_START) {
    const lvl = state.pendingLevel;
    if (lvl) {
      const el = (id) => document.getElementById(id);
      const iconEl  = el('lst-icon');
      const nameEl  = el('lst-name');
      const goalEl  = el('lst-goal');
      const badgeEl = el('lst-badge');
      const durEl   = el('lst-duration');
      if (iconEl)  iconEl.textContent  = lvl.icon  ?? '⚔️';
      if (nameEl)  nameEl.textContent  = lvl.name  ?? '';
      if (goalEl)  goalEl.textContent  = lvl.levelGoal ?? '';
      if (badgeEl) {
        if (lvl.mechanicBadge) {
          badgeEl.textContent = lvl.mechanicBadge;
          badgeEl.hidden      = false;
        } else {
          badgeEl.hidden = true;
        }
      }
      if (durEl) durEl.textContent = lvl.estimatedDuration ?? '';
    }
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

    // ── Victory melody — generate, visualise, and play ──────────────────────
    const levelIdx    = LEVELS.findIndex(l => l.id === state.currentLevel?.id);
    const levelNumber = levelIdx >= 0 ? levelIdx + 1 : 1;
    const melody      = generateMelody({
      levelNumber,
      bpm: state.currentLevel?.bpm ?? 100,
    });
    state.victoryMelody = melody;

    // Show lesson title if present
    const lessonEl = document.getElementById('victory-lesson');
    if (lessonEl && state.currentLesson) {
      lessonEl.textContent = `${state.currentLesson.title} — ${state.currentLesson.concept}`;
      lessonEl.hidden = false;
    } else if (lessonEl) {
      lessonEl.hidden = true;
    }

    // Reveal melody view and draw piano roll
    const melodyView = document.getElementById('victory-melody-view');
    if (melodyView) melodyView.hidden = false;
    drawMelodyPianoRoll(melody);

    // Status line
    const statusEl = document.getElementById('victory-melody-status');
    if (statusEl) statusEl.textContent = `🎵 ${melody.keyName} — your level's melody`;

    // Buttons are immediately active — melody plays in background without blocking
    const playAgainBtn = document.getElementById('btn-play-again-victory');
    const continueBtn  = document.getElementById('btn-title-victory');
    if (playAgainBtn) playAgainBtn.disabled = false;
    if (continueBtn)  continueBtn.disabled  = false;

    playMelody(melody).then(() => {
      if (statusEl) statusEl.textContent = '✓ Melody complete — continue when you are';
    }).catch(() => {
      if (statusEl) statusEl.textContent = '✓ Ready — continue when you are';
    });
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
    // Initialise MIDI on first user gesture (required by browser security policy)
    midiInput.start((note) => keyboardInput.dispatchNote(note)).catch(() => {});
    setScene(SCENE.INSTRUMENT_SELECT);
  });

  // TITLE → CALIBRATION (practice mode — Campfire level, bypasses menus)
  $('btn-practice')?.addEventListener('click', () => {
    midiInput.start((note) => keyboardInput.dispatchNote(note)).catch(() => {});
    state.currentLevel = LEVELS_BY_ID['campfire'];
    setScene(SCENE.CALIBRATION);
    startCapture(state).catch(() => {});
  });

  // LEVEL_SELECT → INSTRUMENT_SELECT (back)
  $('btn-ls-back')?.addEventListener('click', () => {
    setScene(SCENE.INSTRUMENT_SELECT);
  });

  // CALIBRATION → PLAYING
  // This click IS a user gesture — the safest moment to lift a mobile
  // AudioContext suspension before gameplay begins.
  $('btn-calibration-done')?.addEventListener('click', () => {
    resumeAudioContext()
      .then(() => startGame())
      .catch(() => startGame());   // start regardless if resume fails
  });

  // VICTORY / DEFEAT → PLAYING (replay same level)
  $('btn-play-again-victory')?.addEventListener('click', () => startGame(state.currentLevel));
  $('btn-play-again-defeat')?.addEventListener('click',  () => startGame(state.currentLevel));

  // VICTORY → WORLD_MAP (or ENDGAME if all levels 3★)
  $('btn-title-victory')?.addEventListener('click', () => {
    const allThreeStars = LEVELS.every(l => (progression.bestStars[l.id] ?? 0) >= 3);
    setScene(allThreeStars ? SCENE.ENDGAME : SCENE.WORLD_MAP);
  });

  // DEFEAT → WORLD_MAP
  $('btn-title-defeat')?.addEventListener('click', () => setScene(SCENE.WORLD_MAP));

  // ENDGAME → WORLD_MAP
  $('btn-endgame-ls')?.addEventListener('click', () => setScene(SCENE.WORLD_MAP));

  // LEVEL_START: PLAY button — all instruments go through CALIBRATION so the
  // AudioContext is created inside a user gesture and the mic bridge is ready.
  $('btn-lst-play')?.addEventListener('click', () => {
    const lvl = state.pendingLevel;
    if (!lvl || lvl.stub) return;
    state.currentLevel = lvl;

    const gameType = lvl.gameType ?? 'tower-defense';

    // Tower-defense levels use the existing startGame() path (with calibration)
    if (gameType === 'tower-defense') {
      setScene(SCENE.CALIBRATION);
      startCapture(state).catch(() => {});
      return;
    }

    // Minigame types — launch through the minigame engine
    setScene(SCENE.MINIGAME);
    minigameEngine.launch(lvl, {
      canvas,
      ctx,
      state,
      difficulty: state.difficulty,
      onNote:     (note) => keyboardInput.dispatchNote(note),
      onComplete: _handleMinigameResult,
    });
  });

  // LEVEL_START: ← Map button
  $('btn-lst-back')?.addEventListener('click', () => setScene(SCENE.WORLD_MAP));

  // ── Debug overlay — backtick (`) toggles audio pipeline HUD ─────────────
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      state.debugOverlay = !state.debugOverlay;
      console.log(`[debug] overlay ${state.debugOverlay ? 'ON' : 'OFF'}`);
    }
  });

  // ── Mobile AudioContext self-heal — resume on any canvas touch ───────────
  canvas.addEventListener('touchstart', () => {
    if (state.scene === SCENE.PLAYING) resumeAudioContext().catch(() => {});
  }, { passive: true });
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
  // Stop any victory-screen melody that may still be playing
  stopMelody();

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
    inputMode:       level.allowedModes?.[0] ?? 'summon',
    currentLevel:    level,
    starsEarned:     0,
  });

  // Preserve canvas dimensions — managed by onResize(), not game logic.
  const savedCanvas      = state.canvas;
  const savedWorldMap    = state.worldMap;
  const savedDebugOverlay = state.debugOverlay;
  Object.assign(state, fresh);
  state.canvas        = savedCanvas;
  state.worldMap      = savedWorldMap;
  state.debugOverlay  = savedDebugOverlay;  // persist debug overlay across restarts

  // Apply tutorial / level-start mechanic flags
  state.allowedModes      = level.allowedModes      ?? null;
  state.chargeUnlocksBase = level.chargeUnlocksBase  ?? false;
  state._progression      = progression;   // read-only ref for renderer

  // Reset mic-bridge state so stale note doesn't block re-triggering
  _prevMicNote = null;

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

  // Apply difficulty to spawn interval — new dense-wave system
  // Easy=2s, Medium=1.5s, Hard=1s between individual enemy spawns
  const DIFF_INTERVALS = { easy: 2, medium: 1.5, hard: 1 };
  const baseInterval   = DIFF_INTERVALS[state.difficulty] ?? 1.5;
  state.enemySpawnInterval = Math.max(0.5, baseInterval + (state.skillSpawnIntervalBonus || 0));
  state.enemySpawnTimer    = 0;   // first enemy spawns on the very first update tick

  // Initialise wave density fields
  state.waveEnemiesSpawned = 0;
  state.waveEnemiesKilled  = 0;
  state.waveSize           = 8;   // minimum 8 enemies per wave
  state.waveOverlapping    = false;
  state.betweenWavesTimer  = 0;   // 0 = start spawning immediately (no opening gap)

  // Attach level-as-lesson content (sets state.currentLesson)
  applyLesson(state, level.id);

  // Initialise subsystems
  tablatureSystem.reset(state);
  attackSequenceSystem.reset(state);
  cueSystem.reset(state);
  promptManager.reset();

  // Announce Wave 1
  state.waveAnnounce = performance.now();

  // Set initial phase label — bases always start vulnerable (grace period handled per-wave)
  {
    const phases = level.phases ?? DEFAULT_PHASES;
    state.phaseLabel = phases[0]?.label ?? 'Introduction';
    for (let i = 0; i < state.enemyBases.length; i++) {
      state.enemyBases[i].vulnerable = true;
    }
    state.phaseAnnounce = performance.now();
  }

  // Override enemy base HP for tutorial T1 (quick beatable fight ~30 s)
  if (level._enemyBaseHp != null) {
    for (let i = 0; i < state.enemyBases.length; i++) {
      state.enemyBases[i].hp    = level._enemyBaseHp;
      state.enemyBases[i].maxHp = level._enemyBaseHp;
    }
  }

  // Survival levels (T2): enemy bases permanently invulnerable
  // chargeUnlocksBase (T4): enemy base invulnerable until first charge fires
  if (level.winCondition === 'survival' || state.chargeUnlocksBase) {
    for (let i = 0; i < state.enemyBases.length; i++) {
      state.enemyBases[i].vulnerable = false;
    }
  }

  // Reset sound-engine sentinels for clean change-detection in this run
  _prevPlayerHp     = Infinity;
  _prevModeAnnounce = 0;

  keyboardInput.start(state, tablatureSystem, attackSequenceSystem, cueSystem);
  setScene(SCENE.PLAYING);
  startSoundEngine(state);
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
  // Survival levels: stop spawning once the last wave is reached (player must clear what's there)
  if (state.currentLevel?.winCondition === 'survival' &&
      state.wave >= (state.currentLevel.maxWaves ?? 3)) {
    return;
  }

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
  // Speed set in TIER_STATS: T1/T2=50 px/s (standard), T3=80 px/s (fast — visual trail)
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
      unit.speed       = 35;   // slow — holds midfield line
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
      unit.speed       = 60;   // fast charge but not instant
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
      unit.speed       = 45;   // advance slowly, stop at range
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
      unit.speed         = 20;   // stays near base, slow patrol
      unit.range         = 120;
      unit.attackSpeed   = 1.0;
      unit.radius        = 14;
      unit.role          = 'mage';
      unit.pulseCooldown = 1.5;  // first pulse at 1.5 s (sooner than 3 s repeat)
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
  onGameEvent('spawn');
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

      // ── Mic → game note bridge ────────────────────────────────────────────
      // updateAudio() writes state.audio.detectedNote (e.g. 'C4') and sets
      // state.audio.pitchStable after 6 consecutive same-note frames (~100 ms).
      // Game systems (tablature, cueSystem, attackSequence) are purely event-
      // driven via keyboardInput.dispatchNote() — they never poll state.audio.
      // This bridge is the ONLY place that converts detected audio → note events.
      if (state.audio.ready) {
        if (state.audio.pitchStable && state.audio.detectedNote) {
          // Fold detected octave to C3 octave (the octave used by piano layout
          // and expected by tablature/cue note names: 'C3'–'B3').
          const micNote = state.audio.detectedNote.replace(/\d+$/, '3');
          if (micNote !== _prevMicNote) {
            _prevMicNote = micNote;
            keyboardInput.dispatchNote(micNote);
            console.debug(`[mic-bridge] note: ${state.audio.detectedNote} → ${micNote}`);
          }
        } else if (state.audio.confidence === 0) {
          // Signal fully faded — reset so the same note can re-trigger next time
          _prevMicNote = null;
        }
      }

      // Sound engine — sync BPM/bass from state; detect damage + mode change
      syncSoundEngine(state);
      if (state.playerBase) {
        const curHp = state.playerBase.hp;
        if (curHp < _prevPlayerHp) onGameEvent('damage');
        _prevPlayerHp = curHp;
      }
      if (state.modeAnnounce !== _prevModeAnnounce) {
        _prevModeAnnounce = state.modeAnnounce;
        onGameEvent('modeSwitch');
      }

      // ── Subsystem updates (tablature only active in summon mode) ─────────
      if (state.inputMode === 'summon') tablatureSystem.update(dt, state);
      attackSequenceSystem.update(dt, state);
      cueSystem.update(dt, state);
      promptManager.update(dt, state);

      // ── Mode indicator tracking (Fix 4) ──────────────────────────────────
      if (state.inputMode === 'attack') {
        state.lastAttackModeTime = state.time;
      }
      {
        const enemiesPresent = state.units.some(u => u.team === 'enemy' && u.alive);
        state.attackSuggestPulse = enemiesPresent
          && state.inputMode !== 'attack'
          && (state.time - state.lastAttackModeTime) > 5;
      }

      // ── Charge progress (held-note mechanic) ──────────────────────────────
      if (state.inputMode === 'charge' && state.chargeNote !== null) {
        const elapsedSec     = (performance.now() - state.chargeStartTime) / 1000;
        const stabilityMult  = state.audio.pitchStable ? 1.3 : 1.0;
        state.chargeProgress = Math.min(3.0, (elapsedSec / 0.8) * stabilityMult);
      }

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
        // Damage number cleanup (1200 ms lifetime)
        for (let di = state.damageNumbers.length - 1; di >= 0; di--) {
          if (nowMs - state.damageNumbers[di].startTime >= 1200) {
            state.damageNumbers.splice(di, 1);
          }
        }
        // Wrong-note flash cleanup (300 ms)
        if (state.wrongNoteFlash && nowMs - state.wrongNoteFlash.time >= 300) {
          state.wrongNoteFlash = null;
        }
      }
      // No resource auto-tick — resources earned from kills only

      // ── Wave & spawn system ───────────────────────────────────────────────
      {
        const maxWaves = state.currentLevel?.maxWaves ?? 10;
        const lvl      = state.currentLevel;

        // Count live enemies on screen
        let aliveEnemies = 0;
        for (let ei = 0; ei < state.units.length; ei++) {
          if (state.units[ei].team === 'enemy' && state.units[ei].alive) aliveEnemies++;
        }
        const cap = Math.max(12, lvl?.maxEnemyCap ?? 12);

        // ── Spawn enemies for current wave ──────────────────────────────────
        if (state.betweenWavesTimer <= 0) {
          // Survival: stop spawning once the final wave is fully spawned
          const survivalDone = lvl?.winCondition === 'survival'
            && state.wave >= maxWaves
            && state.waveEnemiesSpawned >= state.waveSize;

          if (!survivalDone && state.waveEnemiesSpawned < state.waveSize && aliveEnemies < cap) {
            state.enemySpawnTimer -= dt;
            if (state.enemySpawnTimer <= 0) {
              state.enemySpawnTimer += state.enemySpawnInterval;
              spawnEnemyUnit();
              state.waveEnemiesSpawned++;
            }
          }
        } else {
          // Counting down between waves
          state.betweenWavesTimer = Math.max(0, state.betweenWavesTimer - dt);
        }

        // ── Wave advance: overlap at 50% killed ────────────────────────────
        if (!state.waveOverlapping
            && state.waveEnemiesSpawned > 0
            && state.waveEnemiesKilled >= Math.ceil(state.waveSize * 0.5)
            && state.wave < maxWaves) {
          state.wave++;
          state.waveAnnounce      = performance.now();
          state.waveEnemiesSpawned = 0;
          state.waveEnemiesKilled  = 0;
          state.waveSize           = Math.max(8, state.waveSize);
          state.waveOverlapping    = true;
          state.betweenWavesTimer  = 0;
          // Brief base invulnerability on each wave advance (non-survival levels)
          if (lvl?.winCondition !== 'survival' && !state.chargeUnlocksBase) {
            state.waveGraceEnd = state.time + 5;
            for (let bi = 0; bi < state.enemyBases.length; bi++) {
              if (!state.enemyBases[bi].isDestroyed()) state.enemyBases[bi].vulnerable = false;
            }
          }
          console.log(`[wave] overlap advance → wave ${state.wave}`);
        }

        // ── Wave complete: all spawned + all dead → brief gap then next wave ─
        if (state.waveEnemiesSpawned >= state.waveSize
            && aliveEnemies === 0
            && state.betweenWavesTimer === 0
            && state.wave < maxWaves) {
          state.wave++;
          state.waveAnnounce      = performance.now();
          state.waveEnemiesSpawned = 0;
          state.waveEnemiesKilled  = 0;
          state.waveSize           = Math.max(8, state.waveSize);
          state.waveOverlapping    = false;
          state.betweenWavesTimer  = 4;  // max 4 s gap before next wave begins
          console.log(`[wave] cleared → wave ${state.wave} (gap ${state.betweenWavesTimer}s)`);
        }

        // ── Grace period: bases invulnerable briefly after each wave advance ─
        if (state.waveGraceEnd > 0 && state.time >= state.waveGraceEnd) {
          state.waveGraceEnd = 0;
          if (lvl?.winCondition !== 'survival' && !state.chargeUnlocksBase) {
            for (let bi = 0; bi < state.enemyBases.length; bi++) {
              if (!state.enemyBases[bi].isDestroyed()) state.enemyBases[bi].vulnerable = true;
            }
          }
        }
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
            state.waveEnemiesKilled++;  // track kills for 50% overlap trigger
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
            // Kill event sound
            onGameEvent('kill');
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
            console.log(`[phase] → ${state.phaseLabel} (phase ${nextIdx + 1}/${phases.length})`);
          }
        }
      }

      // ── Win / lose ────────────────────────────────────────────────────────
      if (state.playerBase.isDestroyed()) {
        setScene(SCENE.DEFEAT);
        break;
      }

      // Survival win (T2): last wave reached + no live enemies remain
      {
        const lvl = state.currentLevel;
        if (lvl?.winCondition === 'survival') {
          const maxW      = lvl.maxWaves ?? 3;
          const noEnemies = !state.units.some(u => u.team === 'enemy' && u.alive);
          if (state.wave >= maxW && noEnemies) {
            _handleVictory();
            break;
          }
        }
      }

      // Victory: all enemy bases destroyed
      {
        const wonByBase = state.enemyBases.length > 0 && state.enemyBases.every(b => b.isDestroyed());
        if (wonByBase) {
          _handleVictory();
          break;
        }
      }
      break;
    }

    case SCENE.MINIGAME:
      // Minigame engine owns its own update/render loop — nothing to do here
      break;

    case SCENE.VICTORY:
    case SCENE.DEFEAT:
      break;

    case SCENE.WORLD_MAP: {
      const cam = state.worldMap;
      // Smooth zoom lerp (ease-out, ~150ms at 60fps)
      if (Math.abs((cam.zoom ?? 1) - (cam.zoomTarget ?? 1)) > 0.001) {
        cam.zoom += ((cam.zoomTarget ?? 1) - cam.zoom) * Math.min(1, dt * 10);
      }
      // Pan animation to hub node (1200, 960) — triggered by T4 unlock
      if (cam.panAnimating) {
        const W = state.canvas.width, H = state.canvas.height;
        const zoom = cam.zoom ?? 1.0;
        const targetX = W / 2 - 1200 * zoom;
        const targetY = H / 2 - 960 * zoom;
        cam.cameraX += (targetX - cam.cameraX) * Math.min(1, dt * 2.5);
        cam.cameraY += (targetY - cam.cameraY) * Math.min(1, dt * 2.5);
        if (Math.abs(cam.cameraX - targetX) < 1.5 && Math.abs(cam.cameraY - targetY) < 1.5) {
          cam.cameraX = targetX;
          cam.cameraY = targetY;
          cam.panAnimating = false;
        }
      }
      break;
    }
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
wireSettingsUI(state, () => setScene(SCENE.INSTRUMENT_SELECT));
console.log('[settings] wired');

// InstrumentSelectUI: render once; callback saves choice + advances to LEVEL_START or WORLD_MAP.
instrumentSelectUI.render(
  state.instrument || 'piano',
  (instrumentId) => {
    state.instrument = instrumentId;
    settingsUI.saveSettings(state);
    if (!progression.tutorialComplete) {
      // First play: auto-start the tutorial sequence
      state.pendingLevel = WORLD_MAP_NODES_BY_ID['tutorial-1'];
      setScene(SCENE.LEVEL_START);
    } else {
      setScene(SCENE.WORLD_MAP);
    }
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

// Re-resume AudioContext on every canvas touch during gameplay.
// Mobile browsers can re-suspend it mid-session (screen lock, phone call,
// tab switch).  This passive listener costs nothing and self-heals silently.
canvas.addEventListener('touchstart', () => {
  if (state.scene === SCENE.PLAYING) resumeAudioContext();
}, { passive: true });

initPianoTouchInput(canvas, (note) => keyboardInput.dispatchNote(note), (mode) => {
  if (state.scene !== SCENE.PLAYING) return;
  if (state.inputMode === mode) return;
  // Respect tutorial mode restrictions
  if (state.allowedModes && !state.allowedModes.includes(mode)) return;
  state.inputMode    = mode;
  state.modeAnnounce = performance.now();
  if (mode === 'summon') tablatureSystem.refresh(state);
  if (mode !== 'charge') {
    state.chargeNote     = null;
    state.chargeProgress = 0;
  }
  console.log(`[mode] tapped → ${mode}`);
});

// ── World map canvas input (drag to pan + tap to select nodes) ───────────────
{
  function _toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function _onWorldMapPointerDown(x, y) {
    if (state.scene !== SCENE.WORLD_MAP) return;
    state.worldMap.isDragging    = true;
    state.worldMap.dragAnchorX   = x;
    state.worldMap.dragAnchorY   = y;
    state.worldMap.dragCamStartX = state.worldMap.cameraX;
    state.worldMap.dragCamStartY = state.worldMap.cameraY;
  }

  function _onWorldMapPointerMove(x, y) {
    if (state.scene !== SCENE.WORLD_MAP || !state.worldMap.isDragging) return;
    state.worldMap.cameraX = state.worldMap.dragCamStartX + (x - state.worldMap.dragAnchorX);
    state.worldMap.cameraY = state.worldMap.dragCamStartY + (y - state.worldMap.dragAnchorY);
  }

  function _onWorldMapPointerUp(x, y) {
    if (state.scene !== SCENE.WORLD_MAP) return;
    const wasDragging = state.worldMap.isDragging;
    state.worldMap.isDragging = false;
    // Treat as click only if pointer barely moved (< 6 px)
    const dx = x - state.worldMap.dragAnchorX;
    const dy = y - state.worldMap.dragAnchorY;
    if (wasDragging && (dx * dx + dy * dy) > 36) return;
    _handleWorldMapClick(x, y);
  }

  canvas.addEventListener('mousedown', e => {
    const { x, y } = _toLogical(e.clientX, e.clientY);
    _onWorldMapPointerDown(x, y);
  });
  canvas.addEventListener('mousemove', e => {
    const { x, y } = _toLogical(e.clientX, e.clientY);
    _onWorldMapPointerMove(x, y);
  });
  canvas.addEventListener('mouseup', e => {
    const { x, y } = _toLogical(e.clientX, e.clientY);
    _onWorldMapPointerUp(x, y);
  });
  canvas.addEventListener('mouseleave', () => {
    if (state.scene === SCENE.WORLD_MAP) state.worldMap.isDragging = false;
  });
  // ── Touch: single-finger pan, two-finger pinch-to-zoom ──────────────────
  canvas.addEventListener('touchstart', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { x, y } = _toLogical(t.clientX, t.clientY);
      _onWorldMapPointerDown(x, y);
    } else if (e.touches.length === 2) {
      // Pinch start — record initial distance and zoom
      const a = e.touches[0], b = e.touches[1];
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      state.worldMap.pinchDist0 = Math.sqrt(dx * dx + dy * dy);
      state.worldMap.pinchZoom0 = state.worldMap.zoom;
      state.worldMap.isDragging = false;  // disable pan during pinch
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    e.preventDefault();
    if (e.touches.length === 1 && state.worldMap.pinchDist0 === null) {
      const t = e.touches[0];
      const { x, y } = _toLogical(t.clientX, t.clientY);
      _onWorldMapPointerMove(x, y);
    } else if (e.touches.length === 2 && state.worldMap.pinchDist0 !== null) {
      const a = e.touches[0], b = e.touches[1];
      const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newZoom = state.worldMap.pinchZoom0 * (dist / state.worldMap.pinchDist0);
      // Pinch centre in logical space
      const { x: cx, y: cy } = _toLogical(
        (a.clientX + b.clientX) / 2,
        (a.clientY + b.clientY) / 2
      );
      _applyWorldMapZoom(newZoom, cx, cy, true /* immediate */);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    if (e.touches.length === 0) {
      state.worldMap.pinchDist0 = null;
      const t = e.changedTouches[0]; if (!t) return;
      const { x, y } = _toLogical(t.clientX, t.clientY);
      _onWorldMapPointerUp(x, y);
    } else {
      state.worldMap.pinchDist0 = null;
    }
  }, { passive: true });

  // ── Scroll-wheel zoom ────────────────────────────────────────────────────
  canvas.addEventListener('wheel', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    e.preventDefault();
    const { x, y } = _toLogical(e.clientX, e.clientY);
    const factor    = 1 - e.deltaY * 0.0008;
    _applyWorldMapZoom(state.worldMap.zoom * factor, x, y, false /* animate */);
  }, { passive: false });
}

/**
 * Apply a zoom change centered on a screen-space point.
 * Keeps the world point under (cx, cy) fixed as zoom changes.
 * @param {number} newZoom  — desired zoom level
 * @param {number} cx       — screen x to zoom around
 * @param {number} cy       — screen y to zoom around
 * @param {boolean} immediate — true = apply directly, false = set zoomTarget (lerped)
 */
function _applyWorldMapZoom(newZoom, cx, cy, immediate = false) {
  const cam     = state.worldMap;
  const oldZoom = cam.zoom;
  newZoom       = Math.max(0.3, Math.min(1.4, newZoom));
  if (immediate) {
    // Adjust camera so the world point under cursor stays fixed
    cam.cameraX = cx - (cx - cam.cameraX) / oldZoom * newZoom;
    cam.cameraY = cy - (cy - cam.cameraY) / oldZoom * newZoom;
    cam.zoom       = newZoom;
    cam.zoomTarget = newZoom;
  } else {
    // Adjust camera immediately (keeps the view stable), animate zoom via lerp
    cam.cameraX = cx - (cx - cam.cameraX) / oldZoom * newZoom;
    cam.cameraY = cy - (cy - cam.cameraY) / oldZoom * newZoom;
    cam.zoom       = newZoom;
    cam.zoomTarget = newZoom;
  }
}

function _handleWorldMapClick(x, y) {
  if (state.scene !== SCENE.WORLD_MAP) return;
  const W    = state.canvas.width, H = state.canvas.height;
  const zoom = state.worldMap.zoom ?? 1.0;

  // ── Reset-view button (screen-space, top-right) ─────────────────────────
  const rvb = getResetViewButtonBounds(W, H);
  if (rvb && x >= rvb.x && y >= rvb.y && x <= rvb.x + rvb.w && y <= rvb.y + rvb.h) {
    // Animate camera back to tutorial spine centre at zoom=1.0
    state.worldMap.cameraX    = W / 2 - 1200 * zoom;
    state.worldMap.cameraY    = H / 2 - 1430 * zoom;
    state.worldMap.zoom       = zoom;
    state.worldMap.zoomTarget = 1.0;
    // Snap camera for the default zoom target
    state.worldMap.cameraX = W / 2 - 1200;
    state.worldMap.cameraY = H / 2 - 1430;
    state.worldMap.zoom    = 1.0;
    return;
  }

  // ── PLAY button (screen-space — not affected by camera) ────────────────
  const pb = getPlayButtonBounds(W, H);
  if (state.worldMap.selectedNodeId &&
      x >= pb.x && y >= pb.y && x <= pb.x + pb.w && y <= pb.y + pb.h) {
    const node = WORLD_MAP_NODES_BY_ID[state.worldMap.selectedNodeId];
    if (node && !node.stub && !node.isHub && isNodeUnlocked(node, progression)) {
      state.pendingLevel = node;
      setScene(SCENE.LEVEL_START);
    }
    return;
  }

  // ── Hit-test world nodes (divide by zoom to get world coords) ──────────
  const wx = (x - state.worldMap.cameraX) / zoom;
  const wy = (y - state.worldMap.cameraY) / zoom;
  const nodeId = getNodeAtPoint(wx, wy, W, H, WORLD_MAP_NODES);
  if (nodeId) {
    const node = WORLD_MAP_NODES_BY_ID[nodeId];
    // Allow selecting any unlocked node (including stubs — they show "Coming soon")
    if (node && isNodeUnlocked(node, progression)) {
      state.worldMap.selectedNodeId = nodeId;
    }
  }
}

requestAnimationFrame((ts) => {
  lastTimestamp = ts;
  requestAnimationFrame(loop);
});
