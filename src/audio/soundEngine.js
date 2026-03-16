/**
 * @file src/audio/soundEngine.js
 * Musical backing layers for ChordWars gameplay.
 *
 * Generates beat/bass accompaniment and event sound effects
 * using the existing AudioContext from the audio pipeline.
 * Never creates a second AudioContext.
 *
 * Public API
 * ──────────
 *   startSoundEngine(state)  — call when entering PLAYING scene
 *   stopSoundEngine()        — call when leaving PLAYING scene
 *   onGameEvent(type, data)  — fire on kill / spawn / mode-switch / damage
 *
 * Audio layers
 * ────────────
 *   Beat generator — kick/snare pattern, 90 BPM + 5 per wave, lookahead 100 ms
 *   Bass generator — root-note pulse on beats 1 & 3 of each bar
 *   Event sounds   — kill hit, spawn sweep, mode-switch click, damage rumble
 *
 * Constraints (from SOUND_ENGINE.md + CLAUDE.md)
 * ─────────────────────────────────────────────
 *   Web Audio API only — no sample loading
 *   Reuse AudioContext from capture.js — never create a second one
 *   No per-frame synthesis — schedule-ahead only
 *   iOS-safe: context.resume() on gesture; webkitAudioContext fallback
 *   All oscillators must be stopped after use (no leaks)
 */

import { getAudioContext } from './capture.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module state — reset on each startSoundEngine() call
// ─────────────────────────────────────────────────────────────────────────────

/** @type {AudioContext|null} */
let _ctx = null;

/** @type {GainNode|null} master output bus — mutable volume knob */
let _masterGain = null;

/** True while the engine is actively scheduling beats. */
let _running = false;

/** setTimeout handle for the scheduler loop. */
let _schedulerTimer = null;

/**
 * Wall-clock time (AudioContext seconds) through which beats have been scheduled.
 * Scheduler refills whenever current time approaches this horizon.
 */
let _scheduleHorizon = 0;

/** Beat number of the next unscheduled beat (0-indexed from engine start). */
let _nextBeat = 0;

/** Absolute AudioContext time when beat 0 was defined. */
let _beatOrigin = 0;

/**
 * Cached BPM at last schedule call. Recalculated from state each scheduler tick.
 * 90 BPM base + 5 per wave.
 */
let _bpm = 90;

/**
 * Root frequency (Hz) for the bass generator.
 * Updated from state.audio.detectedChord on each scheduler tick.
 * Defaults to C3 (130.81 Hz).
 */
let _bassRootHz = 130.81;

/** Snapshot of state.wave used by scheduler — avoids per-frame state ref. */
let _wave = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Note frequency table (C2–B4 range — covers bass register + events)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Readonly<Object.<string,number>>} */
const NOTE_HZ = Object.freeze({
  'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00,
  'A2': 110.00, 'B2': 123.47,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56,
  'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00,
  'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
  'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
});

/**
 * Map a chord name (e.g. 'Em', 'G', 'C') to its root bass frequency in Hz.
 * Falls back to C3 if unknown.
 * @param {string|null} chord
 * @returns {number}
 */
function chordToRootHz(chord) {
  if (!chord) return NOTE_HZ['C3'];
  // Strip quality suffix — we only need the root letter + optional sharp/flat
  const m = chord.match(/^([A-G][#b]?)/);
  if (!m) return NOTE_HZ['C3'];

  const root = m[1];
  // Map to closest C3-octave bass note
  const noteMap = {
    'C':  NOTE_HZ['C3'],
    'C#': NOTE_HZ['C#3'], 'Db': NOTE_HZ['C#3'],
    'D':  NOTE_HZ['D3'],
    'D#': NOTE_HZ['D#3'], 'Eb': NOTE_HZ['D#3'],
    'E':  NOTE_HZ['E3'],
    'F':  NOTE_HZ['F3'],
    'F#': NOTE_HZ['F#3'], 'Gb': NOTE_HZ['F#3'],
    'G':  NOTE_HZ['G3'],
    'G#': NOTE_HZ['G#3'], 'Ab': NOTE_HZ['G#3'],
    'A':  NOTE_HZ['A3'],
    'A#': NOTE_HZ['A#3'], 'Bb': NOTE_HZ['A#3'],
    'B':  NOTE_HZ['B3'],
  };
  return noteMap[root] ?? NOTE_HZ['C3'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler constants
// ─────────────────────────────────────────────────────────────────────────────

/** How far ahead (seconds) we schedule beats. */
const LOOKAHEAD_SEC = 0.15;

/** How often the scheduler callback runs (ms). */
const SCHEDULER_INTERVAL_MS = 60;

/** Number of beats per bar (4/4 time). */
const BEATS_PER_BAR = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Beat synthesis — kick and snare (no samples)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a kick drum hit at time `t` on the given AudioContext.
 * Kick = sine oscillator starting at 150 Hz, pitched down quickly, short attack.
 *
 * @param {AudioContext} ctx
 * @param {GainNode}     bus   — master bus to connect to
 * @param {number}       t     — AudioContext time (seconds) for the onset
 */
function scheduleKick(ctx, bus, t) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.7, t + 0.005);   // sharp attack
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

  osc.connect(gain);
  gain.connect(bus);

  osc.start(t);
  osc.stop(t + 0.20);
}

/**
 * Schedule a snare hit at time `t`.
 * Snare = noise burst through a bandpass filter + short gain envelope.
 *
 * @param {AudioContext} ctx
 * @param {GainNode}     bus
 * @param {number}       t
 */
function scheduleSnare(ctx, bus, t) {
  // Noise source via a buffer of white noise
  const bufLen   = Math.ceil(ctx.sampleRate * 0.12);
  const buffer   = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data     = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.4, t + 0.004);   // fast crack
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

  src.connect(bp);
  bp.connect(gain);
  gain.connect(bus);

  src.start(t);
  src.stop(t + 0.15);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bass synthesis — root-note pulse on beats 1 & 3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a bass note at time `t` with the given root frequency.
 * Sine wave, low gain, short decay — acts as a groove anchor.
 *
 * @param {AudioContext} ctx
 * @param {GainNode}     bus
 * @param {number}       t
 * @param {number}       hz   — root frequency in Hz
 */
function scheduleBass(ctx, bus, t, hz) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = hz;

  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

  osc.connect(gain);
  gain.connect(bus);

  osc.start(t);
  osc.stop(t + 0.30);
}

// ─────────────────────────────────────────────────────────────────────────────
// Beat scheduler — called repeatedly via setTimeout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fill the audio schedule buffer with beats up to _scheduleHorizon.
 * Called by the scheduler loop; safe to run while _running is true.
 */
function _scheduleTick() {
  if (!_running || !_ctx) return;

  const ctx = _ctx;
  const bus = _masterGain;
  if (!bus) return;

  // Resume if iOS suspended the context mid-session
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    return;
  }

  const now     = ctx.currentTime;
  const horizon = now + LOOKAHEAD_SEC;

  const secondsPerBeat = 60 / _bpm;

  while (_scheduleHorizon < horizon) {
    const t        = _beatOrigin + _nextBeat * secondsPerBeat;
    const beatInBar = _nextBeat % BEATS_PER_BAR;   // 0, 1, 2, 3

    // Kick on beats 0 and 2 (downbeat + beat 3)
    if (beatInBar === 0 || beatInBar === 2) {
      scheduleKick(ctx, bus, t);
    }

    // Snare on beats 1 and 3
    if (beatInBar === 1 || beatInBar === 3) {
      scheduleSnare(ctx, bus, t);
    }

    // Bass on beats 0 and 2 (downbeat + beat 3) — slightly quieter than kick
    if (beatInBar === 0 || beatInBar === 2) {
      scheduleBass(ctx, bus, t, _bassRootHz);
    }

    _scheduleHorizon = t + secondsPerBeat;
    _nextBeat++;
  }
}

/**
 * Start the scheduler loop. Calls _scheduleTick every SCHEDULER_INTERVAL_MS ms.
 */
function _startScheduler() {
  if (_schedulerTimer !== null) return;

  function tick() {
    _scheduleTick();
    if (_running) {
      _schedulerTimer = setTimeout(tick, SCHEDULER_INTERVAL_MS);
    }
  }
  _schedulerTimer = setTimeout(tick, 0);
}

/**
 * Stop the scheduler loop and clear the timer.
 */
function _stopScheduler() {
  if (_schedulerTimer !== null) {
    clearTimeout(_schedulerTimer);
    _schedulerTimer = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event sounds — one-shot synthesised effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kill sound — short noise burst through a bandpass filter.
 * Pitched higher than the snare to cut through the mix.
 */
function _playKill() {
  if (!_ctx) return;
  const ctx = _ctx;
  const bus = _masterGain;
  if (!bus || ctx.state !== 'running') return;

  const t      = ctx.currentTime + 0.01;
  const bufLen = Math.ceil(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data   = buffer.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

  const src  = ctx.createBufferSource();
  src.buffer = buffer;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.35, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

  src.connect(bp);
  bp.connect(gain);
  gain.connect(bus);

  src.start(t);
  src.stop(t + 0.06);
}

/**
 * Spawn sound — rising tone sweep (100 ms).
 */
function _playSpawn() {
  if (!_ctx) return;
  const ctx = _ctx;
  const bus = _masterGain;
  if (!bus || ctx.state !== 'running') return;

  const t   = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.linearRampToValueAtTime(600, t + 0.10);

  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
  gain.gain.linearRampToValueAtTime(0,    t + 0.10);

  osc.connect(gain);
  gain.connect(bus);

  osc.start(t);
  osc.stop(t + 0.12);
}

/**
 * Mode-switch click — distinct pop/click at ~800 Hz.
 */
function _playModeSwitch() {
  if (!_ctx) return;
  const ctx = _ctx;
  const bus = _masterGain;
  if (!bus || ctx.state !== 'running') return;

  const t   = ctx.currentTime + 0.005;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.value = 800;

  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.20, t + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

  osc.connect(gain);
  gain.connect(bus);

  osc.start(t);
  osc.stop(t + 0.05);
}

/**
 * Damage-taken rumble — low sine at 50 Hz, 200 ms.
 */
function _playDamage() {
  if (!_ctx) return;
  const ctx = _ctx;
  const bus = _masterGain;
  if (!bus || ctx.state !== 'running') return;

  const t   = ctx.currentTime + 0.01;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = 50;

  gain.gain.setValueAtTime(0,    t);
  gain.gain.linearRampToValueAtTime(0.30, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);

  osc.connect(gain);
  gain.connect(bus);

  osc.start(t);
  osc.stop(t + 0.22);
}

// ─────────────────────────────────────────────────────────────────────────────
// State update — called by the scheduler before each tick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync engine parameters from current game state.
 * Called once per scheduler interval — no per-frame allocation.
 *
 * @param {object} state — canonical game state (read-only)
 */
function _syncFromState(state) {
  _wave       = state.wave ?? 1;
  _bpm        = 90 + (_wave - 1) * 5;   // 90 BPM base + 5 per wave
  _bassRootHz = chordToRootHz(state.audio?.detectedChord ?? null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start the sound engine when entering PLAYING scene.
 *
 * Reuses the AudioContext created by the mic pipeline (capture.js).
 * If no context is available (e.g. piano-only mode), creates a minimal one.
 * Safe to call multiple times — stops any previous session first.
 *
 * @param {object} state — canonical game state (read-only reference)
 */
export function startSoundEngine(state) {
  stopSoundEngine();   // clean up any leftover session

  // Prefer the shared context from the mic pipeline
  let ctx = getAudioContext();

  if (!ctx || ctx.state === 'closed') {
    // Fallback: create a minimal context (piano-only mode)
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn('[soundEngine] Web Audio API not available — skipping');
      return;
    }
    try {
      ctx = new AudioCtx();
    } catch (e) {
      console.warn('[soundEngine] Failed to create AudioContext:', e);
      return;
    }
  }

  // Resume if suspended (required on iOS after a gesture)
  ctx.resume().catch(() => {});

  _ctx = ctx;

  // Master gain bus — all layers route through here
  const master = ctx.createGain();
  master.gain.value = 0.6;   // headroom so events + beats don't clip
  master.connect(ctx.destination);
  _masterGain = master;

  // Initialise beat origin at current time + small scheduling buffer
  _beatOrigin      = ctx.currentTime + 0.05;
  _nextBeat        = 0;
  _scheduleHorizon = _beatOrigin;
  _running         = true;

  // Sync BPM + bass root before first scheduler tick
  _syncFromState(state);

  _startScheduler();

  console.info(`[soundEngine] started — wave=${_wave} bpm=${_bpm}`);
}

/**
 * Stop the sound engine and release all resources.
 * Safe to call when the engine was never started.
 */
export function stopSoundEngine() {
  _running = false;
  _stopScheduler();

  // Disconnect master gain — in-flight oscillators will auto-stop at their
  // scheduled stop time; we don't need to cancel them individually.
  if (_masterGain) {
    try { _masterGain.disconnect(); } catch (_) {}
    _masterGain = null;
  }

  _ctx             = null;
  _nextBeat        = 0;
  _scheduleHorizon = 0;
  _beatOrigin      = 0;
  _bpm             = 90;
  _wave            = 1;
  _bassRootHz      = 130.81;

  console.info('[soundEngine] stopped');
}

/**
 * Update engine parameters from the current game state.
 * Call once per frame (or per scheduler tick) while PLAYING.
 * Zero allocation — only updates cached scalars.
 *
 * @param {object} state
 */
export function syncSoundEngine(state) {
  if (!_running) return;
  _syncFromState(state);
}

/**
 * Fire a one-shot event sound.
 *
 * @param {'kill'|'spawn'|'modeSwitch'|'damage'} type
 * @param {object} [_data] — reserved for future per-event metadata
 */
export function onGameEvent(type, _data) {
  if (!_running || !_ctx) return;

  switch (type) {
    case 'kill':       _playKill();       break;
    case 'spawn':      _playSpawn();      break;
    case 'modeSwitch': _playModeSwitch(); break;
    case 'damage':     _playDamage();     break;
    default:
      console.warn(`[soundEngine] unknown event type: ${type}`);
  }
}
