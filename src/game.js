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
import { WORLD_MAP_NODES, WORLD_MAP_NODES_BY_ID, TUTORIAL_SEQUENCE, isNodeUnlocked } from './data/worldMap.js';
import { getNodeAtPoint, getPlayButtonBounds } from './ui/worldMapRenderer.js';
import { generateMelody, playMelody, stopMelody } from './audio/melodyEngine.js';
import { applyLesson }                             from './data/lessons.js';

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

    // ── Lesson (level-as-lesson content system) ────────────────────────────
    currentLesson:  null,    // LessonConfig | null — applied by applyLesson() in startGame()
    chordPlayCounts:{},      // map of chord root → play count (Level 3 success metric)

    // ── Victory melody ─────────────────────────────────────────────────────
    victoryMelody:  null,    // MelodyResult | null — generated at VICTORY, played on screen

    // ── World map (camera + selection) ───────────────────────────────────────
    worldMap: {
      selectedNodeId:      null,  // id of currently highlighted node
      cameraX:             0,     // pan offset in logical pixels
      cameraY:             0,
      isDragging:          false,
      dragAnchorX:         0,     // pointer position when drag started
      dragAnchorY:         0,
      dragCamStartX:       0,     // cameraX value when drag started
      dragCamStartY:       0,
      showTutorialComplete: false, // banner shown after T4 victory
    },

    // ── Tutorial / level-start ────────────────────────────────────────────────
    pendingLevel:      null,   // WorldMapNode to start after LEVEL_START screen
    allowedModes:      null,   // null = all modes; string[] = tutorial lock
    chargeUnlocksBase: false,  // T4: enemy base invulnerable until first charge

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

  // Tutorial auto-advance: T1→T2→T3→T4 skip VICTORY screen
  const tutIdx = level ? TUTORIAL_SEQUENCE.indexOf(level.id) : -1;
  if (tutIdx >= 0 && tutIdx < TUTORIAL_SEQUENCE.length - 1) {
    // T1, T2, T3 — advance to the next tutorial's LEVEL_START
    const nextId           = TUTORIAL_SEQUENCE[tutIdx + 1];
    state.pendingLevel     = WORLD_MAP_NODES_BY_ID[nextId];
    setScene(SCENE.LEVEL_START);
  } else if (level?.id === 'tutorial-4') {
    // T4 complete — tutorial series done, open world map
    progression.tutorialComplete         = true;
    saveProgress(progression);
    state._progression                   = progression;
    state.worldMap.showTutorialComplete  = true;
    setScene(SCENE.WORLD_MAP);
  } else {
    // Regular level — show full VICTORY screen with melody
    setScene(SCENE.VICTORY);
  }
}

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

  // World map: centre camera on first visit (cameraX==0 means uninitialised)
  if (scene === SCENE.WORLD_MAP) {
    const W = state.canvas.width, H = state.canvas.height;
    if (state.worldMap.cameraX === 0 && state.worldMap.cameraY === 0) {
      state.worldMap.cameraX = Math.round(W / 2 - 425);
      state.worldMap.cameraY = Math.round(H * 0.45 - 355);
    }
    state._progression = progression;
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

    // Gate the navigation buttons until melody finishes + 3 s pause
    const playAgainBtn = document.getElementById('btn-play-again-victory');
    const continueBtn  = document.getElementById('btn-title-victory');
    if (playAgainBtn) playAgainBtn.disabled = true;
    if (continueBtn)  continueBtn.disabled  = true;

    playMelody(melody).then(() => {
      if (statusEl) statusEl.textContent = '✓ Ready — continue when you are';
      setTimeout(() => {
        if (playAgainBtn) playAgainBtn.disabled = false;
        if (continueBtn)  continueBtn.disabled  = false;
      }, 3000);
    }).catch(() => {
      // Web Audio unavailable — unlock buttons immediately
      if (playAgainBtn) playAgainBtn.disabled = false;
      if (continueBtn)  continueBtn.disabled  = false;
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

  // VICTORY → WORLD_MAP (or ENDGAME if all levels 3★)
  $('btn-title-victory')?.addEventListener('click', () => {
    const allThreeStars = LEVELS.every(l => (progression.bestStars[l.id] ?? 0) >= 3);
    setScene(allThreeStars ? SCENE.ENDGAME : SCENE.WORLD_MAP);
  });

  // DEFEAT → WORLD_MAP
  $('btn-title-defeat')?.addEventListener('click', () => setScene(SCENE.WORLD_MAP));

  // ENDGAME → WORLD_MAP
  $('btn-endgame-ls')?.addEventListener('click', () => setScene(SCENE.WORLD_MAP));

  // LEVEL_START: PLAY button — start the pending level
  $('btn-lst-play')?.addEventListener('click', () => {
    const lvl = state.pendingLevel;
    if (!lvl || lvl.stub) return;
    state.currentLevel = lvl;
    if (state.instrument === 'guitar' || state.instrument === 'voice') {
      setScene(SCENE.CALIBRATION);
      startCapture(state).catch(() => {});
    } else {
      startCapture(state).catch(() => {});
      startGame(lvl);
    }
  });

  // LEVEL_START: ← Map button
  $('btn-lst-back')?.addEventListener('click', () => setScene(SCENE.WORLD_MAP));
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
  const savedCanvas   = state.canvas;
  const savedWorldMap = state.worldMap;
  Object.assign(state, fresh);
  state.canvas   = savedCanvas;
  state.worldMap = savedWorldMap;

  // Apply tutorial / level-start mechanic flags
  state.allowedModes      = level.allowedModes      ?? null;
  state.chargeUnlocksBase = level.chargeUnlocksBase  ?? false;
  state._progression      = progression;   // read-only ref for renderer

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
      }
      // No resource auto-tick — resources earned from kills only

      // ── Wave progression (every 30 s of play time, capped by level) ────────
      const maxWaves  = state.currentLevel?.maxWaves ?? 10;
      const targetWave = Math.min(maxWaves, 1 + Math.floor(state.time / 30));
      if (targetWave > state.wave) {
        state.wave         = targetWave;
        state.waveAnnounce = performance.now();
        // 10-second grace period: bases invulnerable at start of each new wave
        state.waveGraceEnd = state.time + 10;
        for (let bi = 0; bi < state.enemyBases.length; bi++) {
          if (!state.enemyBases[bi].isDestroyed()) state.enemyBases[bi].vulnerable = false;
        }
      }

      // ── Wave grace period — re-enable vulnerability once grace window closes ──
      if (state.waveGraceEnd > 0 && state.time >= state.waveGraceEnd) {
        state.waveGraceEnd = 0;
        // Survival: bases always invulnerable. chargeUnlocksBase: wait for first charge.
        if (state.currentLevel?.winCondition !== 'survival' && !state.chargeUnlocksBase) {
          for (let bi = 0; bi < state.enemyBases.length; bi++) {
            if (!state.enemyBases[bi].isDestroyed()) state.enemyBases[bi].vulnerable = true;
          }
        }
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
  canvas.addEventListener('touchstart', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    const t = e.touches[0]; if (!t) return;
    const { x, y } = _toLogical(t.clientX, t.clientY);
    _onWorldMapPointerDown(x, y);
  }, { passive: true });
  canvas.addEventListener('touchmove', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    e.preventDefault();
    const t = e.touches[0]; if (!t) return;
    const { x, y } = _toLogical(t.clientX, t.clientY);
    _onWorldMapPointerMove(x, y);
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    if (state.scene !== SCENE.WORLD_MAP) return;
    const t = e.changedTouches[0]; if (!t) return;
    const { x, y } = _toLogical(t.clientX, t.clientY);
    _onWorldMapPointerUp(x, y);
  }, { passive: true });
}

function _handleWorldMapClick(x, y) {
  if (state.scene !== SCENE.WORLD_MAP) return;
  const W = state.canvas.width, H = state.canvas.height;

  // Check PLAY button (screen-space — not affected by camera pan)
  const pb = getPlayButtonBounds(W, H);
  if (state.worldMap.selectedNodeId &&
      x >= pb.x && y >= pb.y && x <= pb.x + pb.w && y <= pb.y + pb.h) {
    const node = WORLD_MAP_NODES_BY_ID[state.worldMap.selectedNodeId];
    if (node && !node.stub && isNodeUnlocked(node, progression)) {
      state.pendingLevel = node;
      setScene(SCENE.LEVEL_START);
    }
    return;
  }

  // Hit-test world map nodes (subtract camera offset to get world coords)
  const wx = x - state.worldMap.cameraX;
  const wy = y - state.worldMap.cameraY;
  const nodeId = getNodeAtPoint(wx, wy, W, H, WORLD_MAP_NODES);
  if (nodeId) {
    const node = WORLD_MAP_NODES_BY_ID[nodeId];
    if (node && !node.stub && isNodeUnlocked(node, progression)) {
      state.worldMap.selectedNodeId = nodeId;
    }
  }
}

requestAnimationFrame((ts) => {
  lastTimestamp = ts;
  requestAnimationFrame(loop);
});
